import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { readLogTail } from "../src/cli/logs.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true }),
  ))
})

describe("readLogTail", () => {
  it("reads the last requested lines from a real file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "arete-logs-"))
    temporaryDirectories.push(directory)
    const logPath = path.join(directory, "arete.log")
    await writeFile(logPath, "first\nsecond\nthird\nfourth", "utf8")

    expect(await readLogTail(2, { logPath })).toBe("third\nfourth")
  })

  it("reports a missing log file", async () => {
    const logPath = path.join(tmpdir(), `missing-arete-${Date.now()}.log`)

    expect(await readLogTail(20, { logPath })).toBe(`No log file yet: ${logPath}`)
  })

  it("returns an empty tail when no lines are requested", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "arete-logs-empty-"))
    temporaryDirectories.push(directory)
    const logPath = path.join(directory, "arete.log")
    await writeFile(logPath, "must not be returned", "utf8")

    expect(await readLogTail(0, { logPath })).toBe("")
    expect(await readLogTail(-1, { logPath })).toBe("")
  })
})
