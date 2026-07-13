import { describe, expect, expectTypeOf, it } from "vitest"

import { checkNodeVersion } from "../src/cli/runtime-check.js"

describe("checkNodeVersion", () => {
  it("accepts Node.js 22", () => {
    expect(checkNodeVersion("22.18.0")).toEqual({ ok: true, major: 22 })
  })

  it("rejects unsupported Node.js versions with an actionable message", () => {
    const result = checkNodeVersion("24.1.0")

    expect(result).toEqual({
      ok: false,
      major: 24,
      message: "Arete requires Node.js 22 LTS. Detected 24.1.0.",
    })

    if (result.ok) {
      throw new Error("Expected Node.js 24 to be rejected")
    }

    expectTypeOf(result.message).toEqualTypeOf<string>()
    expect(result.message).toContain("Node.js 22 LTS")
  })
})
