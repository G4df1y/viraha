import { describe, expect, it } from "vitest"

import { checkNodeVersion } from "../src/cli/runtime-check.js"

describe("checkNodeVersion", () => {
  it("accepts Node.js 22", () => {
    expect(checkNodeVersion("22.18.0")).toEqual({ ok: true, major: 22 })
  })

  it("rejects unsupported Node.js versions with an actionable message", () => {
    expect(checkNodeVersion("24.1.0")).toEqual({
      ok: false,
      major: 24,
      message: "Arete requires Node.js 22 LTS. Detected 24.1.0.",
    })
  })
})
