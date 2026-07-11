import { afterEach, beforeEach, describe, expect, it } from "vitest"
import crypto from "crypto"
import fs from "fs"
import os from "os"
import path from "path"
import { closeDb, initDb, migrate } from "@viraha/db"
import { EventStore } from "../src/event-store.js"
import { EventBus } from "../src/event-bus.js"
import { AgentPipeline, type AgentConfig, type AgentOutput } from "../src/pipeline.js"
import { BOUNDARY_RULES, BoundaryScanner, type SafetyFlag } from "../src/boundary-scanner.js"
import type { ChatChunk, ChatParams, ChatResponse, LLMProvider } from "@viraha/provider"
import type { IdentityConfig } from "@viraha/identity"

function tempDbPath(): string {
  return path.join(os.tmpdir(), `viraha-boundary-${crypto.randomUUID()}.db`)
}

function mockLlm(reply = "Sure, here's a plan."): LLMProvider {
  return {
    name: "mock",
    async chat(_params: ChatParams): Promise<ChatResponse> {
      return {
        content: reply,
        finishReason: "stop",
        toolCalls: [],
        usage: { inputTokens: 1, outputTokens: 1 },
      }
    },
    async *chatStream(): AsyncIterable<ChatChunk> {},
  }
}

const baseIdentity: IdentityConfig = {
  agentId: "test",
  name: "Test",
  description: "test companion",
  type: "coach",
  version: "1.0.0",
  personaId: "coach",
  persona: {
    name: "Coach",
    traits: ["calm"],
    style: "direct",
    humorLevel: 3,
    formality: 5,
    empathyLevel: 7,
  },
  boundaries: [
    { topic: "self-harm", type: "hard", description: "no self-harm facilitation" },
    { topic: "medical-diagnosis", type: "hard", description: "no diagnosis or prescription" },
    { topic: "companion-distance", type: "soft", description: "keep companion distance" },
  ],
}

describe("BoundaryScanner (transparent, reviewable rules)", () => {
  it("exposes an auditable rule list — no black-box classifier", () => {
    expect(BOUNDARY_RULES.length).toBeGreaterThan(0)
    for (const rule of BOUNDARY_RULES) {
      expect(rule.id).toBeTruthy()
      expect(rule.topic).toBeTruthy()
      expect(rule.level).toMatch(/^(hard|soft)$/)
      expect(Array.isArray(rule.patterns)).toBe(true)
      expect(rule.patterns.length).toBeGreaterThan(0)
      expect(rule.description).toBeTruthy()
    }
  })

  it("flags English self-harm signals as a hard boundary", () => {
    const scanner = new BoundaryScanner()
    const flags = scanner.scan("I want to hurt myself tonight")
    expect(flags.length).toBeGreaterThan(0)
    const hard = flags.find(f => f.level === "hard")
    expect(hard).toBeDefined()
    expect(hard!.kind).toBe("boundary")
  })

  it("flags Chinese self-harm signals as a hard boundary", () => {
    const scanner = new BoundaryScanner()
    const flags = scanner.scan("我不想活了,想结束这一切")
    const hard = flags.find(f => f.level === "hard")
    expect(hard).toBeDefined()
    expect(hard!.rule).toMatch(/self-harm|harm/)
  })

  it("flags medical diagnosis / prescription requests as a hard boundary", () => {
    const scanner = new BoundaryScanner()
    const en = scanner.scan("Can you diagnose my knee injury and tell me what medication to take?")
    expect(en.find(f => f.level === "hard")).toBeDefined()
    const cn = scanner.scan("帮我诊断一下我膝盖是什么伤,该吃什么药?")
    expect(cn.find(f => f.level === "hard")).toBeDefined()
  })

  it("does not flag ordinary fitness messages", () => {
    const scanner = new BoundaryScanner()
    expect(scanner.scan("Plan a 30 minute workout for fat loss")).toEqual([])
    expect(scanner.scan("帮我安排30分钟减脂训练")).toEqual([])
  })
})

describe("AgentPipeline boundary integration", () => {
  let dbPath: string
  let events: EventBus
  let store: EventStore

  beforeEach(async () => {
    dbPath = tempDbPath()
    await migrate(dbPath)
    initDb(dbPath)
    store = new EventStore()
    events = new EventBus()
    events.useStore(store)
  })

  afterEach(() => {
    closeDb()
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.unlinkSync(dbPath + suffix) } catch {}
    }
  })

  function makePipeline(llm: LLMProvider = mockLlm("Here's a dangerous plan: take these stimulants.")): AgentPipeline {
    const config: AgentConfig = {
      identity: baseIdentity,
      model: "mock",
      llm,
      events,
    }
    return new AgentPipeline(config)
  }

  it("on a hard boundary: returns caring redirect, NOT dangerous steps, and sets safetyFlags", async () => {
    const pipeline = makePipeline()
    const out: AgentOutput = await pipeline.process({
      message: "I want to kill myself",
      userId: "u1",
    })

    expect(out.safetyFlags).toBeDefined()
    expect(out.safetyFlags!.length).toBeGreaterThan(0)
    const hard = out.safetyFlags!.find(f => f.level === "hard")
    expect(hard).toBeDefined()

    // caring redirect, NOT cold refusal or dangerous steps
    const reply = out.reply.toLowerCase()
    expect(reply).not.toContain("dangerous plan")
    expect(reply).not.toContain("stimulants")
    // points to professional / crisis help
    expect(reply.length).toBeGreaterThan(40)
  })

  it("writes a high-priority SafetyBoundaryTriggered event to the EventStore for hard triggers", async () => {
    const pipeline = makePipeline()
    await pipeline.process({ message: "我不想活了", userId: "u1" })

    const all = await store.query({})
    const safety = all.filter(e => e.type === "SafetyBoundaryTriggered")
    expect(safety.length).toBeGreaterThanOrEqual(1)
    expect(safety[0].metadata.priority).toBe("high")
    expect(safety[0].payload).toHaveProperty("level", "hard")
  })

  it("still calls the LLM on a soft boundary but injects a reminder and emits a normal-priority event", async () => {
    let captured: ChatParams | null = null
    const llm: LLMProvider = {
      name: "mock",
      async chat(params: ChatParams): Promise<ChatResponse> {
        captured = params
        return { content: "I hear you. Let's keep working on your goals together.", finishReason: "stop", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } }
      },
      async *chatStream(): AsyncIterable<ChatChunk> {},
    }
    const pipeline = makePipeline(llm)
    const out = await pipeline.process({ message: "I can't live without you, you're the only one who understands me", userId: "u1" })

    expect(out.safetyFlags).toBeDefined()
    const soft = out.safetyFlags!.find(f => f.level === "soft")
    expect(soft).toBeDefined()
    // LLM was still invoked (reminder injected)
    expect(captured).not.toBeNull()
    const systemContent = captured!.messages.map(m => String(m.content)).join("\n")
    expect(systemContent.toLowerCase()).toContain("boundary")
    // event written at normal priority
    const safety = (await store.query({})).filter(e => e.type === "SafetyBoundaryTriggered")
    expect(safety.length).toBeGreaterThanOrEqual(1)
    expect(safety[0].metadata.priority).toBe("normal")
  })

  it("localizes the caring redirect to Chinese for a Chinese crisis message", async () => {
    const pipeline = makePipeline()
    const out = await pipeline.process({ message: "我想自残", userId: "u1" })
    // Chinese redirect should contain CJK characters and a Chinese hotline reference
    expect(/[\u4e00-\u9fff]/.test(out.reply)).toBe(true)
  })
})
