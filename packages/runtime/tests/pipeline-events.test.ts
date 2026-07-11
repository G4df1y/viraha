import { describe, expect, it } from "vitest"
import { AgentPipeline, EventBus } from "../src/index.js"
import type { EventEnvelope } from "@viraha/core"
import type { IdentityConfig } from "@viraha/identity"
import type { LLMProvider } from "@viraha/provider"

const identity: IdentityConfig = {
  agentId: "arete",
  name: "Arete",
  version: "0.0.0-test",
  type: "coach",
  description: "A fitness companion",
  coreValues: ["safety", "consistency"],
  boundaries: [],
  capabilities: [],
  skills: [],
}

describe("AgentPipeline events", () => {
  it("emits turn events with one correlation id", async () => {
    const events = new EventBus()
    const llm: LLMProvider = {
      name: "fake",
      async chat() {
        return {
          content: "Ready.",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      },
      async *chatStream() {},
    }

    const pipeline = new AgentPipeline({
      identity,
      model: "fake-model",
      llm,
      events,
    })

    await pipeline.process({ message: "hi", userId: "web-user" })

    const history = events.getHistory()
    expect(history.map(e => e.type)).toEqual([
      "UserMessageReceived",
      "AgentThinking",
      "AgentResponseSent",
    ])
    expect(new Set(history.map(e => e.correlationId)).size).toBe(1)
    expect(history[0].metadata.userId).toBe("web-user")
  })

  it("emits tool, reflection, and relationship events", async () => {
    const events = new EventBus()
    const done = waitForEvents(events, ["ReflectionCompleted", "RelationshipChanged"])
    let calls = 0
    const llm: LLMProvider = {
      name: "fake",
      async chat() {
        calls++
        if (calls === 1) {
          return {
            content: "",
            finishReason: "tool_use",
            toolCalls: [{
              id: "tc_1",
              name: "calculator",
              arguments: { expression: "2 + 2" },
            }],
            usage: { inputTokens: 1, outputTokens: 1 },
          }
        }

        return {
          content: "It equals 4.",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      },
      async *chatStream() {},
    }

    const pipeline = new AgentPipeline({
      identity,
      model: "fake-model",
      llm,
      events,
      reflection: {
        async reflect() {},
      },
      companion: {
        async enrichPrompt(_userId, basePrompt) { return basePrompt },
        async onInteraction() {},
      },
    })

    await pipeline.process({ message: "what is 2 + 2?", userId: "web-user" })
    await done

    const types = events.getHistory().map(e => e.type)
    expect(types).toContain("ToolCalled")
    expect(types).toContain("ReflectionCompleted")
    expect(types).toContain("RelationshipChanged")
  })
})

function waitForEvents(events: EventBus, wanted: EventEnvelope["type"][]): Promise<void> {
  const pending = new Set(wanted)

  return new Promise(resolve => {
    for (const type of wanted) {
      events.on(type, () => {
        pending.delete(type)
        if (pending.size === 0) resolve()
      })
    }
  })
}
