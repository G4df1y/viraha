import { describe, expect, it } from "vitest"
import { AgentPipeline } from "../src/pipeline.js"
import type { LLMProvider } from "@viraha/provider"
import type { IdentityConfig } from "@viraha/identity"

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

function fakeLlm(reply = "OK"): LLMProvider {
  return {
    name: "fake",
    async chat() {
      return { content: reply, finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } }
    },
    async *chatStream() {},
  }
}

describe("AgentPipeline companion integration", () => {
  it("injects relationship state into the system prompt", async () => {
    let systemPrompt = ""
    const llm: LLMProvider = {
      name: "fake",
      async chat(params) {
        systemPrompt = params.messages[0].content
        return { content: "Sure.", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } }
      },
      async *chatStream() {},
    }

    const pipeline = new AgentPipeline({
      identity,
      model: "fake-model",
      llm,
      companion: {
        async enrichPrompt(_userId, basePrompt) {
          return `${basePrompt}\n\n## Relationship State\nLevel: 1 (Acquaintance)`
        },
        async onInteraction() {},
      },
    })

    await pipeline.process({ message: "hi", userId: "web-user" })

    expect(systemPrompt).toContain("## Relationship State")
    expect(systemPrompt).toContain("Level: 1 (Acquaintance)")
  })

  it("calls onInteraction after a successful turn", async () => {
    let interactedUserId = ""
    const pipeline = new AgentPipeline({
      identity,
      model: "fake-model",
      llm: fakeLlm(),
      companion: {
        async enrichPrompt(_userId, basePrompt) { return basePrompt },
        async onInteraction(userId) { interactedUserId = userId },
      },
    })

    await pipeline.process({ message: "hi", userId: "web-user" })

    // onInteraction is fired asynchronously; give it a tick
    await new Promise(r => setTimeout(r, 50))
    expect(interactedUserId).toBe("web-user")
  })

  it("does not break when companion is not configured", async () => {
    const pipeline = new AgentPipeline({
      identity,
      model: "fake-model",
      llm: fakeLlm(),
    })

    const result = await pipeline.process({ message: "hi", userId: "web-user" })
    expect(result.reply).toBe("OK")
  })
})
