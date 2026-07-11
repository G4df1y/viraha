import { describe, expect, it } from "vitest"
import { PluginRegistry, type CompanionPack } from "../src/plugins.js"

function pack(name: string, toolName: string, reply: string): CompanionPack {
  return {
    name,
    version: "1.0.0",
    description: `${name} pack`,
    tools: [{
      name: toolName,
      description: `${toolName} tool`,
      inputSchema: { type: "object", properties: {} },
    }],
    async toolHandler(receivedToolName, _args, userId) {
      return { content: `${reply}:${receivedToolName}:${userId}` }
    },
  }
}

describe("PluginRegistry", () => {
  it("exposes pack tools and dispatches tool handlers", async () => {
    const registry = new PluginRegistry()
    registry.registerPack(pack("fitness", "log_workout", "logged"))

    expect(registry.tools.map(tool => tool.name)).toEqual(["log_workout"])
    expect(registry.packs.map(p => p.name)).toEqual(["fitness"])

    const handler = registry.getHandler()
    await expect(handler?.("log_workout", {}, "user-1")).resolves.toEqual({
      content: "logged:log_workout:user-1",
    })
  })

  it("returns an error for unknown tools", async () => {
    const registry = new PluginRegistry()
    registry.registerPack(pack("fitness", "log_workout", "logged"))

    const handler = registry.getHandler()
    await expect(handler?.("missing_tool", {}, "user-1")).resolves.toEqual({
      content: "Unknown tool: missing_tool",
      isError: true,
    })
  })

  it("rejects duplicate tool names", () => {
    const registry = new PluginRegistry()
    registry.registerPack(pack("fitness", "log_workout", "logged"))

    expect(() => registry.registerPack(pack("duplicate", "log_workout", "other"))).toThrow(
      'Tool "log_workout" already registered',
    )
  })
})
