import { describe, expect, it } from "vitest"
import type { IdentityConfig } from "@viraha/identity"
import type { ChatMessage, LLMProvider, ToolDefinition } from "@viraha/provider"
import { AgentPipeline, PluginRegistry, denyToolPolicy } from "../src/index.js"

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

describe("AgentPipeline tool integration", () => {
  it("exposes plugin tools and executes plugin handlers", async () => {
    const plugins = new PluginRegistry()
    plugins.registerPack({
      name: "test-pack",
      version: "1.0.0",
      description: "Test pack",
      tools: [{
        name: "plugin_echo",
        description: "Echo through a plugin",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      }],
      async toolHandler(toolName, args, userId) {
        return { content: `${toolName}:${args.text}:${userId}` }
      },
    })

    let calls = 0
    let firstTools: ToolDefinition[] = []
    let secondMessages: ChatMessage[] = []
    const llm: LLMProvider = {
      name: "fake",
      async chat(params) {
        calls++
        if (calls === 1) {
          firstTools = params.tools ?? []
          return {
            content: "",
            finishReason: "tool_use",
            toolCalls: [{
              id: "tc_plugin",
              name: "plugin_echo",
              arguments: { text: "hello" },
            }],
            usage: { inputTokens: 1, outputTokens: 1 },
          }
        }

        secondMessages = params.messages
        return {
          content: "Plugin handled it.",
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
      plugins,
    })

    const result = await pipeline.process({ message: "echo", userId: "user-1" })

    expect(result.reply).toBe("Plugin handled it.")
    expect(firstTools.map(tool => tool.name)).toContain("plugin_echo")
    expect(secondMessages.map(message => message.content).join("\n")).toContain(
      "[Tool plugin_echo returned: plugin_echo:hello:user-1]",
    )
  })

  it("blocks tool calls denied by policy", async () => {
    let calls = 0
    let secondMessages = ""
    const llm: LLMProvider = {
      name: "fake",
      async chat(params) {
        calls++
        if (calls === 1) {
          return {
            content: "",
            finishReason: "tool_use",
            toolCalls: [{ id: "tc_1", name: "calculator", arguments: { expression: "2 + 2" } }],
            usage: { inputTokens: 1, outputTokens: 1 },
          }
        }
        secondMessages = params.messages.map(m => m.content).join("\n")
        return { content: "Denied.", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } }
      },
      async *chatStream() {},
    }

    const pipeline = new AgentPipeline({
      identity,
      model: "fake-model",
      llm,
      toolPolicy: denyToolPolicy("calculator disabled"),
    })

    await pipeline.process({ message: "2+2", userId: "u1", channel: "web" })

    expect(secondMessages).toContain("Tool calculator denied: calculator disabled")
  })
})
