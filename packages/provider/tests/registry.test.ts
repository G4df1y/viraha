import { describe, it, expect } from "vitest"
import { ProviderRegistry } from "../src/registry.js"

class MockProvider {
  name = "mock"
  async chat() { return { content: "", finishReason: "stop" as const, usage: { inputTokens: 0, outputTokens: 0 } } }
  async *chatStream() {}
  async embed() { return [{ embedding: [0.1, 0.2], model: "mock" }] }
}

describe("ProviderRegistry", () => {
  it("registers and resolves a provider", () => {
    const reg = new ProviderRegistry()
    reg.register("mock", new MockProvider(), ["mock-model"])
    const provider = reg.resolve("mock-model")
    expect(provider.name).toBe("mock")
  })

  it("throws for unknown model", () => {
    const reg = new ProviderRegistry()
    expect(() => reg.resolve("nonexistent")).toThrow()
  })

  it("lists registered models", () => {
    const reg = new ProviderRegistry()
    reg.register("mock", new MockProvider(), ["mock-1", "mock-2"])
    const models = reg.listModels()
    expect(models.length).toBe(2)
  })

  it("checks model existence", () => {
    const reg = new ProviderRegistry()
    reg.register("mock", new MockProvider(), ["mock-model"])
    expect(reg.hasModel("mock-model")).toBe(true)
    expect(reg.hasModel("unknown")).toBe(false)
  })

  it("lists registered providers", () => {
    const reg = new ProviderRegistry()
    reg.register("mock", new MockProvider(), ["mock-model"])
    expect(reg.list()).toEqual([{ name: "mock" }])
  })
})

