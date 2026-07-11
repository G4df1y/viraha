import { describe, expect, it } from "vitest"
import { AgentPipeline } from "../src/index.js"
import type { StreamEvent } from "../src/pipeline.js"
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

describe("AgentPipeline streaming", () => {
  it("streams token events from chatStream before done", async () => {
    let streamCalls = 0
    const llm: LLMProvider = {
      name: "fake",
      async chat() {
        return { content: "fallback", finishReason: "stop", usage: { inputTokens: 0, outputTokens: 0 } }
      },
      async *chatStream() {
        streamCalls++
        yield { content: "Hello ", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } }
        yield { content: "world", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } }
      },
    }

    const pipeline = new AgentPipeline({
      identity,
      model: "fake-model",
      llm,
    })

    const events: StreamEvent[] = []
    for await (const ev of pipeline.processStream({ message: "hi", userId: "u1" })) {
      events.push(ev)
    }

    expect(streamCalls).toBe(1)
    const tokenEvents = events.filter(e => e.type === "token")
    expect(tokenEvents.length).toBeGreaterThanOrEqual(2)
    expect(events.at(-1)?.type).toBe("done")
    expect(events.findIndex(e => e.type === "done")).toBeGreaterThan(events.findIndex(e => e.type === "token"))
  })
})
