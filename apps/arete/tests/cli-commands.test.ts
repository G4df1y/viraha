import { describe, expect, it, vi } from "vitest"

import { runCli } from "../src/cli.js"

const passingReport = {
  ok: true,
  checks: [{ id: "node" as const, ok: true }],
}

describe("runCli", () => {
  it("runs doctor and prints every check", async () => {
    const writeLine = vi.fn()
    const runDoctor = vi.fn().mockResolvedValue(passingReport)

    const code = await runCli(["doctor"], { runDoctor, writeLine })

    expect(code).toBe(0)
    expect(runDoctor).toHaveBeenCalledOnce()
    expect(writeLine).toHaveBeenCalledWith("OK node: Ready")
  })

  it("returns one when doctor fails", async () => {
    const writeLine = vi.fn()
    const runDoctor = vi.fn().mockResolvedValue({
      ok: false,
      checks: [{ id: "port" as const, ok: false, message: "Port busy" }],
    })

    expect(await runCli(["doctor"], { runDoctor, writeLine })).toBe(1)
    expect(writeLine).toHaveBeenCalledWith("FAIL port: Port busy")
  })

  it.each([{ args: [] }, { args: ["start"] }])("starts for arguments $args", async ({ args }) => {
    const startArete = vi.fn().mockResolvedValue(7)

    expect(await runCli(args, { startArete })).toBe(7)
    expect(startArete).toHaveBeenCalledOnce()
  })

  it("prints the log tail", async () => {
    const writeLine = vi.fn()
    const readLogTail = vi.fn().mockResolvedValue("second\nthird")

    expect(await runCli(["logs"], { readLogTail, writeLine })).toBe(0)
    expect(writeLine).toHaveBeenCalledWith("second\nthird")
  })

  it("prints product command usage for an unknown command", async () => {
    const writeLine = vi.fn()

    expect(await runCli(["chat"], { writeLine })).toBe(1)
    const usage = writeLine.mock.calls.join("\n")
    expect(usage).toContain("arete start")
    expect(usage).toContain("arete doctor")
    expect(usage).toContain("arete logs")
  })
})
