import { EventEmitter } from "node:events"
import { PassThrough, Writable } from "node:stream"

import { describe, expect, it, vi } from "vitest"

import { startArete } from "../src/cli/start.js"

function createChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
  }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  return child
}

function createLog() {
  let contents = ""
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      contents += chunk.toString()
      callback()
    },
  })
  return { stream, contents: () => contents }
}

const paths = {
  rootDir: "/tmp/arete",
  dataDir: "/tmp/arete/data",
  configDir: "/tmp/arete/config",
  logDir: "/tmp/arete/logs",
  dbPath: "/tmp/arete/data/arete.db",
  logPath: "/tmp/arete/logs/arete.log",
}

describe("startArete", () => {
  it("does not spawn when doctor fails", async () => {
    const spawn = vi.fn()
    const writeLine = vi.fn()

    const code = await startArete({
      runDoctor: async () => ({
        ok: false,
        checks: [{ id: "port", ok: false, message: "Port busy" }],
      }),
      spawn,
      writeLine,
    })

    expect(code).toBe(1)
    expect(spawn).not.toHaveBeenCalled()
    expect(writeLine).toHaveBeenCalledWith("FAIL port: Port busy")
  })

  it("returns one and closes the log after a spawn error", async () => {
    const child = createChild()
    const log = createLog()
    const closed = new Promise<void>(resolve => log.stream.once("finish", resolve))
    const spawn = vi.fn(() => child as never)

    const result = startArete({
      runDoctor: async () => ({ ok: true, checks: [] }),
      resolvePaths: () => paths,
      mkdir: vi.fn().mockResolvedValue(undefined),
      createWriteStream: () => log.stream,
      spawn,
    })
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    child.emit("error", new Error("spawn failed"))

    expect(await result).toBe(1)
    await closed
    expect(log.stream.writableEnded).toBe(true)
  })

  it("forwards output, opens a chunked web URL once, and returns the exit code", async () => {
    const child = createChild()
    const log = createLog()
    const terminalOut = createLog()
    const terminalErr = createLog()
    const openBrowser = vi.fn().mockResolvedValue(undefined)
    const spawn = vi.fn(() => child as never)

    const result = startArete({
      runDoctor: async () => ({ ok: true, checks: [] }),
      resolvePaths: () => paths,
      mkdir: vi.fn().mockResolvedValue(undefined),
      createWriteStream: () => log.stream,
      spawn,
      openBrowser,
      stdout: terminalOut.stream,
      stderr: terminalErr.stream,
    })

    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    child.stdout.write("boot\nArete web: http://127.0.")
    child.stdout.write("0.1:3000\nArete web: http://127.0.0.1:3000\n")
    child.stderr.write("warning\n")
    child.emit("close", 4)

    expect(await result).toBe(4)
    expect(openBrowser).toHaveBeenCalledOnce()
    expect(openBrowser).toHaveBeenCalledWith("http://127.0.0.1:3000")
    expect(terminalOut.contents()).toContain("boot")
    expect(terminalErr.contents()).toBe("warning\n")
    expect(log.contents()).toContain("warning")
  })
})
