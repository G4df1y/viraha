import { EventEmitter } from "node:events"
import { PassThrough, Writable } from "node:stream"

import { describe, expect, it, vi } from "vitest"

import { startArete } from "../src/cli/start.js"

function createChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = vi.fn(() => true)
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
    const terminalErr = createLog()

    const result = startArete({
      runDoctor: async () => ({ ok: true, checks: [] }),
      resolvePaths: () => paths,
      mkdir: vi.fn().mockResolvedValue(undefined),
      createWriteStream: () => log.stream,
      spawn,
      stderr: terminalErr.stream,
    })
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    child.emit("error", new Error("spawn failed"))

    expect(await result).toBe(1)
    await closed
    expect(log.stream.writableEnded).toBe(true)
    expect(terminalErr.contents()).toContain("spawn failed")
    expect(terminalErr.contents()).toContain("index.js")
  })

  it("reports a synchronous spawn failure with the server entry", async () => {
    const log = createLog()
    const terminalErr = createLog()

    const code = await startArete({
      runDoctor: async () => ({ ok: true, checks: [] }),
      resolvePaths: () => paths,
      mkdir: vi.fn().mockResolvedValue(undefined),
      createWriteStream: () => log.stream,
      spawn: () => { throw new Error("sync spawn failed") },
      stderr: terminalErr.stream,
    })

    expect(code).toBe(1)
    expect(terminalErr.contents()).toContain("sync spawn failed")
    expect(terminalErr.contents()).toContain("index.js")
  })

  it("settles and reports an asynchronous log open error", async () => {
    const child = createChild()
    const log = createLog()
    const terminalErr = createLog()
    const spawn = vi.fn(() => child as never)

    const result = startArete({
      runDoctor: async () => ({ ok: true, checks: [] }),
      resolvePaths: () => paths,
      mkdir: vi.fn().mockResolvedValue(undefined),
      createWriteStream: () => log.stream,
      spawn,
      stderr: terminalErr.stream,
    })
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    const error = Object.assign(new Error("permission denied"), { code: "EACCES" })
    log.stream.emit("error", error)

    expect(await result).toBe(1)
    expect(terminalErr.contents()).toContain("permission denied")
    expect(terminalErr.contents()).toContain(paths.logPath)
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it("settles and reports a log write error", async () => {
    const child = createChild()
    const terminalOut = createLog()
    const terminalErr = createLog()
    const failingLog = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error("disk full"))
      },
    })
    const spawn = vi.fn(() => child as never)

    const result = startArete({
      runDoctor: async () => ({ ok: true, checks: [] }),
      resolvePaths: () => paths,
      mkdir: vi.fn().mockResolvedValue(undefined),
      createWriteStream: () => failingLog,
      spawn,
      stdout: terminalOut.stream,
      stderr: terminalErr.stream,
    })
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    child.stdout.write("trigger log write")

    expect(await result).toBe(1)
    expect(terminalErr.contents()).toContain("disk full")
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it("forwards parent signals once and removes listeners after close", async () => {
    const child = createChild()
    const log = createLog()
    const parent = new EventEmitter()
    const spawn = vi.fn(() => child as never)

    const result = startArete({
      runDoctor: async () => ({ ok: true, checks: [] }),
      resolvePaths: () => paths,
      mkdir: vi.fn().mockResolvedValue(undefined),
      createWriteStream: () => log.stream,
      spawn,
      parentProcess: parent,
    })
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())

    parent.emit("SIGINT")
    parent.emit("SIGTERM")
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGINT")
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGTERM")
    expect(parent.listenerCount("SIGINT")).toBe(1)
    expect(parent.listenerCount("SIGTERM")).toBe(1)
    expect(parent.listenerCount("exit")).toBe(1)

    child.emit("close", 0)
    expect(await result).toBe(0)
    expect(parent.listenerCount("SIGINT")).toBe(0)
    expect(parent.listenerCount("SIGTERM")).toBe(0)
    expect(parent.listenerCount("exit")).toBe(0)
  })

  it("kills the child when the parent exits", async () => {
    const child = createChild()
    const log = createLog()
    const parent = new EventEmitter()
    const spawn = vi.fn(() => child as never)

    const result = startArete({
      runDoctor: async () => ({ ok: true, checks: [] }),
      resolvePaths: () => paths,
      mkdir: vi.fn().mockResolvedValue(undefined),
      createWriteStream: () => log.stream,
      spawn,
      parentProcess: parent,
    })
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    parent.emit("exit")

    expect(child.kill).toHaveBeenCalledOnce()
    child.emit("close", 0)
    expect(await result).toBe(0)
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

  it("bounds unterminated output while preserving a marker split near the boundary", async () => {
    const child = createChild()
    const log = createLog()
    const terminalOut = createLog()
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
      urlScanBufferLimit: 128,
    })
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())

    child.stdout.write(`Arete web: http://stale.test ${"x".repeat(1024)}`)
    child.stdout.write("\nArete web: http://127.0.")
    child.stdout.write("0.1:3000\n")
    child.emit("close", 0)

    expect(await result).toBe(0)
    expect(openBrowser).toHaveBeenCalledOnce()
    expect(openBrowser).toHaveBeenCalledWith("http://127.0.0.1:3000")
  })
})
