import { describe, expect, it } from "vitest"
import { evaluateMathExpression } from "../src/math.js"

describe("evaluateMathExpression", () => {
  it("evaluates basic arithmetic with precedence", () => {
    expect(evaluateMathExpression("2 + 3 * 4")).toBe(14)
    expect(evaluateMathExpression("(2 + 3) * 4")).toBe(20)
  })

  it("supports signed numbers and exponentiation", () => {
    expect(evaluateMathExpression("-2 + 5")).toBe(3)
    expect(evaluateMathExpression("2 ^ 3 ^ 2")).toBe(512)
  })

  it("rejects unsafe or invalid input", () => {
    expect(() => evaluateMathExpression("process.exit()")).toThrow()
    expect(() => evaluateMathExpression("2 / 0")).toThrow()
    expect(() => evaluateMathExpression("2 +")).toThrow()
  })
})
