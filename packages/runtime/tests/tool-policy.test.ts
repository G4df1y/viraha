import { describe, expect, it } from "vitest"
import { allowAllToolPolicy, denyToolPolicy } from "../src/tool-policy.js"

describe("ToolPolicy", () => {
  it("allows all tools by default helper", async () => {
    await expect(allowAllToolPolicy.decide({
      toolName: "calculator",
      args: { expression: "2+2" },
      userId: "u1",
      channel: "web",
    })).resolves.toEqual({ allow: true })
  })

  it("denies with a reason", async () => {
    await expect(denyToolPolicy("nope").decide({
      toolName: "web_search",
      args: {},
      userId: "u1",
      channel: "web",
    })).resolves.toEqual({ allow: false, reason: "nope" })
  })
})
