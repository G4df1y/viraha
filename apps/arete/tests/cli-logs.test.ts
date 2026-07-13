import { mkdtemp, open, rm, writeFile } from "node:fs/promises"
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

  it("reads only tail chunks from a large log file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "arete-logs-large-"))
    temporaryDirectories.push(directory)
    const logPath = path.join(directory, "arete.log")
    await writeFile(logPath, `${"x".repeat(3 * 1024 * 1024)}\nkeep-one\nkeep-two\n`, "utf8")
    let bytesRead = 0

    const result = await readLogTail(2, {
      logPath,
      openFile: async filePath => {
        const handle = await open(filePath, "r")
        return {
          stat: () => handle.stat(),
          read: async (...args: Parameters<typeof handle.read>) => {
            const readResult = await handle.read(...args)
            bytesRead += readResult.bytesRead
            return readResult
          },
          close: () => handle.close(),
        }
      },
    })

    expect(result).toBe("keep-one\nkeep-two")
    expect(bytesRead).toBeGreaterThan(0)
    expect(bytesRead).toBeLessThan(256 * 1024)
  })

  it("normalizes CRLF and ignores a trailing newline", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "arete-logs-crlf-"))
    temporaryDirectories.push(directory)
    const logPath = path.join(directory, "arete.log")
    await writeFile(logPath, "first\r\nsecond\r\nthird\r\n", "utf8")

    expect(await readLogTail(2, { logPath })).toBe("second\nthird")
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
    expect(await readLogTail(Number.NaN, { logPath })).toBe("")
    expect(await readLogTail(Number.POSITIVE_INFINITY, { logPath })).toBe("")
    expect(await readLogTail(0.5, { logPath })).toBe("")
  })
})
