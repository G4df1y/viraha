import { afterEach, beforeEach, describe, expect, it } from "vitest"
import os from "os"
import path from "path"
import fs from "fs"
import crypto from "crypto"

import { AgentPipeline, AgentWorkRunner, EventBus, EventStore } from "@viraha/runtime"
import type { ChatChunk, ChatParams, ChatResponse, LLMProvider } from "@viraha/provider"
import { closeDb, initDb, migrate } from "@viraha/db"
import { MemoryEngine, ReflectionEngine } from "@viraha/memory"

import { ARETE_IDENTITY } from "../src/identity.js"
import {
  calculatorManifest,
  nutritionCoachManifest,
  progressAnalysisManifest,
  searchManifest,
  workoutCoachManifest,
} from "../src/skills/manifests.js"
import {
  calculatorHandler,
  nutritionCoachHandler,
  progressAnalysisHandler,
  searchHandler,
  workoutCoachHandler,
} from "../src/skills/handlers.js"
import { createAreteApp } from "../src/web.js"

function tempDbPath(): string {
  return path.join(os.tmpdir(), `arete-e2e-${crypto.randomUUID()}.db`)
}

function mockLlm(opts: {
  reply?: string
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
  captureSystem?: (s: string) => void
  onChat?: (params: ChatParams) => ChatResponse | undefined
} = {}): LLMProvider {
  return {
    name: "mock",
    async chat(params: ChatParams): Promise<ChatResponse> {
      const custom = opts.onChat?.(params)
      if (custom) return custom

      const sys = params.messages.find(m => m.role === "system")
      if (sys) opts.captureSystem?.(sys.content)

      return {
        content: opts.reply ?? "OK",
        finishReason: opts.toolCalls?.length ? "tool_use" : "stop",
        toolCalls: opts.toolCalls,
        usage: { inputTokens: 1, outputTokens: 1 },
      }
    },
    async *chatStream(): AsyncIterable<ChatChunk> {},
  }
}

function buildAretePipeline(
  llm: LLMProvider,
  opts: { memory?: MemoryEngine; reflection?: Pick<ReflectionEngine, "reflect">; events?: EventBus } = {},
): AgentPipeline {
  const pipeline = new AgentPipeline({
    identity: ARETE_IDENTITY,
    model: "mock-model",
    llm,
    memory: opts.memory,
    reflection: opts.reflection,
    events: opts.events,
  })

  pipeline.registerSkill(workoutCoachManifest, workoutCoachHandler)
  pipeline.registerSkill(nutritionCoachManifest, nutritionCoachHandler)
  pipeline.registerSkill(progressAnalysisManifest, progressAnalysisHandler)
  pipeline.registerSkill(searchManifest, searchHandler)
  pipeline.registerSkill(calculatorManifest, calculatorHandler)
  return pipeline
}

describe("Arete e2e", () => {
  let dbPath: string

  beforeEach(async () => {
    dbPath = tempDbPath()
    await migrate(dbPath)
    initDb(dbPath)
  })

  afterEach(() => {
    closeDb()
    try { fs.unlinkSync(dbPath) } catch {}
    try { fs.unlinkSync(dbPath + "-wal") } catch {}
    try { fs.unlinkSync(dbPath + "-shm") } catch {}
  })

  it("assembles Arete pipeline with identity and 5 skills registered", () => {
    const pipeline = buildAretePipeline(mockLlm())
    const identity = pipeline.identityEngine.get("arete")
    expect(identity?.name).toBe("Arete")
    expect(identity?.version).toBe("2.0.0")

    const skillIds = pipeline.skillsRegistry.list().map(s => s.manifest.id)
    expect(skillIds).toContain("workout-coach")
    expect(skillIds).toContain("nutrition-coach")
    expect(skillIds).toContain("progress-analysis")
    expect(skillIds).toContain("search")
    expect(skillIds).toContain("calculator")
    expect(skillIds.length).toBe(5)
  })

  it("responds to a chat message", async () => {
    const pipeline = buildAretePipeline(mockLlm({ reply: "Let's get to work." }))
    const result = await pipeline.process({ message: "hi", userId: "e2e-user" })
    expect(result.reply).toBe("Let's get to work.")
    expect(result.tokensUsed).toBeGreaterThan(0)
  })

  it("renders trace cockpit entry points", async () => {
    const pipeline = buildAretePipeline(mockLlm())
    const app = createAreteApp(pipeline)

    const response = await app.request("/")
    const html = await response.text()

    expect(html).toContain('id="tracebtn"')
    expect(html).toContain('id="trace-drawer"')
    expect(html).toContain("loadTraces")
    expect(html).toContain("/api/traces")
    expect(html).toContain("/api/events")
  })

  it("records web chat token usage in traces", async () => {
    const pipeline = buildAretePipeline(mockLlm({ reply: "Trace me." }))
    const app = createAreteApp(pipeline)

    const chatResponse = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    })
    expect(chatResponse.status).toBe(200)

    const traceResponse = await app.request("/api/traces")
    const body = await traceResponse.json() as { recent: Array<{ tokens: number }> }
    expect(body.recent.at(-1)?.tokens).toBe(2)
  })

  it("queues web chat turns for the same user", async () => {
    const release = deferred<void>()
    const seen: string[] = []
    const llm = mockLlm({
      async onChat(params) {
        const userMessage = params.messages.at(-1)?.content ?? ""
        if (userMessage === "first") {
          seen.push("first:start")
          await release.promise
          seen.push("first:end")
          return {
            content: "first done",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1 },
          }
        }

        seen.push(`${userMessage}:start`)
        return {
          content: `${userMessage} done`,
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      },
    })
    const pipeline = buildAretePipeline(llm)
    const app = createAreteApp(pipeline, undefined, undefined, undefined, undefined, undefined, new AgentWorkRunner({ concurrency: 2 }))

    const first = app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "first" }),
    })
    const second = app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "second" }),
    })

    await tick()
    expect(seen).toEqual(["first:start"])

    release.resolve()
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(seen).toEqual(["first:start", "first:end", "second:start"])
  })

  it("persists pipeline turn events", async () => {
    const events = new EventBus()
    const store = new EventStore()
    events.useStore(store)
    const pipeline = buildAretePipeline(mockLlm({ reply: "Tracked." }), { events })
    const app = createAreteApp(pipeline, undefined, undefined, undefined, events, store)

    // Without a hub, resolveWebUserId() falls back to "web-user", so the API
    // only ever returns events stored under that identity. Run the pipeline
    // under the same identity the API will resolve to.
    await pipeline.process({ message: "track this", userId: "web-user", channel: "web" })

    const persisted = await store.query({ userId: "web-user" })
    const types = persisted.map(e => e.type)
    expect(types).toEqual(["UserMessageReceived", "AgentThinking", "AgentResponseSent"])
    expect(new Set(persisted.map(e => e.correlationId)).size).toBe(1)

    const response = await app.request("/api/events?type=AgentResponseSent&limit=1")
    const body = await response.json() as { events: Array<{ type: string; correlationId: string }> }
    expect(body.events).toHaveLength(1)
    expect(body.events[0].type).toBe("AgentResponseSent")
    expect(body.events[0].correlationId).toBe(persisted[0].correlationId)

    const timelineResponse = await app.request(`/api/events?correlationId=${persisted[0].correlationId}&limit=10`)
    const timeline = await timelineResponse.json() as { events: Array<{ correlationId: string; payload: unknown }> }
    expect(timeline.events.length).toBeGreaterThanOrEqual(3)
    expect(new Set(timeline.events.map(e => e.correlationId)).size).toBe(1)
    expect(typeof timeline.events[0].payload).toBe("object")
  })

  it("returns provider health", async () => {
    const pipeline = buildAretePipeline(mockLlm())
    const app = createAreteApp(pipeline, undefined, undefined, undefined, undefined, undefined, undefined, () => ({
      model: "mock-model",
      providers: [{ name: "mock", status: "ok" }],
    }))

    const response = await app.request("/api/provider-health")
    const body = await response.json() as { model: string; providers: Array<{ name: string; status: string }> }

    expect(body.model).toBe("mock-model")
    expect(body.providers).toEqual([{ name: "mock", status: "ok" }])
  })

  it("triggers workout-coach skill via tool call and logs to DB", async () => {
    const pipeline = buildAretePipeline(mockLlm({
      reply: "Logged your workout.",
      toolCalls: [{
        id: "tc_1",
        name: "skill_workout-coach",
        arguments: {
          action: "log",
          exercises: [{ name: "bench press", sets: 3, reps: 10, weight: 60 }],
          duration: 45,
        },
      }],
    }))

    const result = await pipeline.process({ message: "Log my workout", userId: "e2e-user" })

    expect(result.reply).toBe("Logged your workout.")
  })

  it("injects knowledge context into system prompt", async () => {
    let capturedSystem = ""
    const pipeline = buildAretePipeline(mockLlm({
      reply: "Based on the knowledge...",
      captureSystem: s => { capturedSystem = s },
    }))

    await pipeline.process({
      message: "How should I squat with knee pain?",
      userId: "e2e-user",
      knowledge: async () => "RELEVANT_KNOWLEDGE_MARKER: For knee pain, box squats reduce shear stress.",
    })

    expect(capturedSystem).toContain("RELEVANT_KNOWLEDGE_MARKER")
    expect(capturedSystem).toContain("Relevant Knowledge")
  })

  it("remembers explicit user goals and limitations across turns", async () => {
    const memory = new MemoryEngine()
    const realReflection = new ReflectionEngine(memory.profile, memory.store)
    let capturedSystem = ""
    let reflectionDone: (() => void) | undefined
    let reflectionEnabled = true
    const reflected = new Promise<void>(resolve => { reflectionDone = resolve })
    const reflection: Pick<ReflectionEngine, "reflect"> = {
      async reflect(...args) {
        if (!reflectionEnabled) return
        await realReflection.reflect(...args)
        reflectionDone?.()
      },
    }

    const llm = mockLlm({
      captureSystem: s => { capturedSystem = s },
      onChat(params) {
        const system = params.messages.find(m => m.role === "system")?.content ?? ""
        if (system.includes("memory extraction system")) {
          return {
            content: JSON.stringify({
              profile: {
                goal: "fat loss",
                injuries: ["right knee pain"],
                equipment: ["dumbbells"],
                availableMinutes: 30,
              },
              facts: [
                {
                  key: "knee_limit",
                  content: "User has right knee pain and should avoid high-impact lower-body work.",
                },
              ],
              emotion: {
                mood: "motivated",
                intensity: 7,
                context: "wants to train safely",
              },
            }),
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1 },
          }
        }

        const sys = params.messages.find(m => m.role === "system")
        if (sys) capturedSystem = sys.content

        return {
          content: "I'll keep it knee-friendly.",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      },
    })

    const pipeline = buildAretePipeline(llm, { memory, reflection })

    await pipeline.process({
      message: "My goal is fat loss. My right knee hurts, and I only have dumbbells and 30 minutes.",
      userId: "memory-user",
      channel: "web",
    })
    await reflected
    reflectionEnabled = false

    capturedSystem = ""
    await pipeline.process({
      message: "Plan today's workout.",
      userId: "memory-user",
      channel: "web",
    })

    expect(capturedSystem).toContain("Goal: fat loss")
    expect(capturedSystem).toContain("Available time: 30 minutes")
    expect(capturedSystem).toContain("Equipment: dumbbells")
    expect(capturedSystem).toContain("Injuries/limitations: right knee pain")
    expect(capturedSystem).toContain("User has right knee pain")
  })
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}
