import { describe, it, expect } from "vitest"
import { estimateTokens, enforceBudget, createBudget } from "../src/token-budget.js"

describe("estimateTokens", () => {
  it("estimates tokens for text", () => {
    const tokens = estimateTokens("hello world this is a test")
    expect(tokens).toBeGreaterThan(0)
  })

  it("handles Chinese text", () => {
    const tokens = estimateTokens("你好世界这是一个测试")
    expect(tokens).toBeGreaterThan(0)
  })
})

describe("createBudget", () => {
  it("allocates budget by percentages", () => {
    const budget = createBudget(10000, { a: 50, b: 30, c: 20 })
    expect(budget.allocations.get("a")).toBe(5000)
    expect(budget.allocations.get("b")).toBe(3000)
    expect(budget.allocations.get("c")).toBe(2000)
  })

  it("calculates remaining buffer", () => {
    const budget = createBudget(10000, { a: 50, b: 30, c: 20 })
    expect(budget.remaining).toBeGreaterThanOrEqual(0)
  })
})

describe("enforceBudget", () => {
  it("returns original if within budget", () => {
    const result = enforceBudget("short text", 1000)
    expect(result.truncated).toBe(false)
    expect(result.trimmed).toBe("short text")
  })

  it("truncates if over budget", () => {
    const longText = "a".repeat(10000)
    const result = enforceBudget(longText, 10)
    expect(result.truncated).toBe(true)
    expect(result.trimmed.length).toBeLessThan(longText.length)
  })
})

