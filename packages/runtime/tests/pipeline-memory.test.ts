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

describe("AgentPipeline memory integration", () => {
  it("injects user memory into the system prompt", async () => {
    let systemPrompt = ""
    const llm: LLMProvider = {
      name: "fake",
      async chat(params) {
        systemPrompt = params.messages[0].content
        return {
          content: "Keep the session low-impact because of your knee.",
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
      memory: {
        profile: {
          async getOrCreateUser() { return "internal-user" },
        },
        async buildMemoryContext() {
          return "=== USER PROFILE ===\nGoal: fat loss\n\n=== RELEVANT MEMORIES ===\n[long_term] knee: User has knee pain."
        },
      },
    })

    await pipeline.process({ message: "Plan today's workout", userId: "web-user" })

    expect(systemPrompt).toContain("## User Memory")
    expect(systemPrompt).toContain("User has knee pain")
  })

  it("reflects after the reply using the internal user id", async () => {
    let reflectedUserId = ""
    const llm: LLMProvider = {
      name: "fake",
      async chat() {
        return {
          content: "Noted.",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      },
      async *chatStream() {},
    }

    const reflected = new Promise<void>(resolve => {
      const pipeline = new AgentPipeline({
        identity,
        model: "fake-model",
        llm,
        memory: {
          profile: {
            async getOrCreateUser() { return "internal-user" },
          },
          async buildMemoryContext() { return "No memories yet." },
        },
        reflection: {
          async reflect(userId) {
            reflectedUserId = userId
            resolve()
          },
        },
      })

      void pipeline.process({ message: "My knee hurts", userId: "web-user" })
    })

    await reflected

    expect(reflectedUserId).toBe("internal-user")
  })

  it("uses an internal routed user id without remapping it", async () => {
    let ensuredUserId = ""
    let memoryUserId = ""
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
      memory: {
        profile: {
          async getOrCreateUser() { throw new Error("should not remap internal user id") },
          async ensureUser(userId) {
            ensuredUserId = userId
            return userId
          },
        },
        async buildMemoryContext(userId) {
          memoryUserId = userId
          return "No memories yet."
        },
      },
    })

    await pipeline.process({ message: "hi", userId: "routed-user", userIdKind: "internal", channel: "feishu" })

    expect(ensuredUserId).toBe("routed-user")
    expect(memoryUserId).toBe("routed-user")
  })
})
