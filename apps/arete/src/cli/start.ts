import { spawn as defaultSpawn } from "node:child_process"
import type { SpawnOptions } from "node:child_process"
import { createWriteStream as defaultCreateWriteStream } from "node:fs"
import { mkdir as defaultMkdir } from "node:fs/promises"
import type { Readable, Writable } from "node:stream"
import { fileURLToPath } from "node:url"

import open from "open"

import { resolveAretePaths as defaultResolvePaths } from "../config/paths.js"
import type { AretePaths } from "../config/paths.js"
import { runDoctor as defaultRunDoctor } from "./doctor.js"
import type { DoctorReport } from "./doctor.js"
import { formatDoctorCheck } from "./output.js"

const DEFAULT_URL_SCAN_BUFFER_LIMIT = 4096

interface StartChild {
  stdout: Readable
  stderr: Readable
  kill(signal?: NodeJS.Signals): boolean
  once(event: "error", listener: (error: Error) => void): this
  once(event: "close", listener: (code: number | null) => void): this
  off(event: "error", listener: (error: Error) => void): this
  off(event: "close", listener: (code: number | null) => void): this
}

interface LogStream extends Writable {
  end(callback?: () => void): this
}

interface ParentProcess {
  on(event: string, listener: (...args: never[]) => void): unknown
  off(event: string, listener: (...args: never[]) => void): unknown
}

export interface StartAreteDependencies {
  runDoctor?: () => Promise<DoctorReport>
  resolvePaths?: () => AretePaths
  mkdir?: (path: string, options: { recursive: true }) => Promise<unknown>
  createWriteStream?: (path: string, options: { flags: "a" }) => LogStream
  spawn?: (command: string, args: string[], options: SpawnOptions) => StartChild
  openBrowser?: (url: string) => Promise<unknown>
  stdout?: NodeJS.WritableStream
  stderr?: NodeJS.WritableStream
  writeLine?: (line: string) => void
  execPath?: string
  env?: NodeJS.ProcessEnv
  parentProcess?: ParentProcess
  urlScanBufferLimit?: number
}

export async function startArete(
  dependencies: StartAreteDependencies = {},
): Promise<number> {
  const report = await (dependencies.runDoctor ?? defaultRunDoctor)()
  const writeLine = dependencies.writeLine ?? console.log

  if (!report.ok) {
    for (const check of report.checks) writeLine(formatDoctorCheck(check))
    return 1
  }

  const paths = (dependencies.resolvePaths ?? defaultResolvePaths)()
  const mkdir = dependencies.mkdir ?? defaultMkdir
  const stdout = dependencies.stdout ?? process.stdout
  const stderr = dependencies.stderr ?? process.stderr
  const parentProcess = dependencies.parentProcess ?? process
  const serverEntry = fileURLToPath(new URL("../index.js", import.meta.url))
  await mkdir(paths.logDir, { recursive: true })

  const createWriteStream = dependencies.createWriteStream ?? defaultCreateWriteStream
  let log: LogStream
  try {
    log = createWriteStream(paths.logPath, { flags: "a" })
  } catch (error) {
    reportLogError(stderr, paths.logPath, error)
    return 1
  }

  const spawn = dependencies.spawn ?? spawnWithPipedOutput
  const openBrowser = dependencies.openBrowser ?? open
  const detector = createWebUrlDetector(
    url => { void openBrowser(url).catch(error => stderr.write(`${errorMessage(error)}\n`)) },
    dependencies.urlScanBufferLimit ?? DEFAULT_URL_SCAN_BUFFER_LIMIT,
  )

  return new Promise(resolve => {
    let child: StartChild | undefined
    let settled = false
    let resolved = false
    const forwardingCleanups: Array<() => void> = []

    const onSigint = () => tryKill(child, "SIGINT")
    const onSigterm = () => tryKill(child, "SIGTERM")
    const onParentExit = () => tryKill(child)
    const onChildError = (error: Error) => {
      reportSpawnError(stderr, serverEntry, error)
      settle(1)
    }
    const onChildClose = (code: number | null) => settle(code ?? 1)

    const cleanupRuntime = () => {
      for (const cleanup of forwardingCleanups.splice(0)) cleanup()
      parentProcess.off("SIGINT", onSigint)
      parentProcess.off("SIGTERM", onSigterm)
      parentProcess.off("exit", onParentExit)
      child?.off("error", onChildError)
      child?.off("close", onChildClose)
    }

    const complete = (code: number) => {
      if (resolved) return
      resolved = true
      log.off("error", onLogError)
      resolve(code)
    }

    const onLogError = (error: Error) => {
      reportLogError(stderr, paths.logPath, error)
      if (settled) {
        complete(1)
        return
      }
      settle(1, true, true)
    }

    const settle = (code: number, logFailed = false, killChild = false) => {
      if (settled) return
      settled = true
      cleanupRuntime()
      detector.flush()
      if (killChild) tryKill(child)

      if (logFailed || log.destroyed) {
        if (!log.destroyed) log.destroy()
        complete(code)
        return
      }

      try {
        log.end(() => complete(code))
      } catch (error) {
        reportLogError(stderr, paths.logPath, error)
        complete(1)
      }
    }

    log.on("error", onLogError)

    try {
      child = spawn(
        dependencies.execPath ?? process.execPath,
        [serverEntry],
        {
          env: { ...(dependencies.env ?? process.env), ARETE_HOME: paths.rootDir },
          stdio: ["inherit", "pipe", "pipe"],
        },
      )
    } catch (error) {
      reportSpawnError(stderr, serverEntry, error)
      settle(1)
      return
    }

    child.once("error", onChildError)
    child.once("close", onChildClose)
    parentProcess.on("SIGINT", onSigint)
    parentProcess.on("SIGTERM", onSigterm)
    parentProcess.on("exit", onParentExit)
    forwardingCleanups.push(
      forward(child.stdout, stdout, log, detector.push, onLogError),
      forward(child.stderr, stderr, log, undefined, onLogError),
    )
  })
}

function spawnWithPipedOutput(
  command: string,
  args: string[],
  options: SpawnOptions,
): StartChild {
  const child = defaultSpawn(command, args, options)
  if (!child.stdout || !child.stderr) {
    throw new Error("Arete child process output pipes were not created.")
  }
  return child as StartChild
}

function forward(
  source: Readable,
  terminal: NodeJS.WritableStream,
  log: LogStream,
  inspect: ((text: string) => void) | undefined,
  onLogError: (error: Error) => void,
): () => void {
  const onData = (chunk: Buffer | string) => {
    terminal.write(chunk)
    try {
      log.write(chunk)
    } catch (error) {
      onLogError(asError(error))
    }
    inspect?.(chunk.toString())
  }
  source.on("data", onData)
  return () => source.off("data", onData)
}

function createWebUrlDetector(openUrl: (url: string) => void, requestedLimit: number) {
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? requestedLimit
    : DEFAULT_URL_SCAN_BUFFER_LIMIT
  let buffer = ""
  let opened = false

  const inspectLine = (line: string) => {
    if (opened) return
    const match = line.match(/Arete web:\s*(https?:\/\/\S+)/)
    if (!match) return
    opened = true
    openUrl(match[1])
  }

  return {
    push(chunk: string) {
      const input = buffer + chunk
      let lineStart = 0
      let newline = input.indexOf("\n")

      while (newline !== -1) {
        const boundedStart = Math.max(lineStart, newline - limit)
        inspectLine(input.slice(boundedStart, newline).replace(/\r$/, ""))
        lineStart = newline + 1
        newline = input.indexOf("\n", lineStart)
      }

      buffer = input.slice(Math.max(lineStart, input.length - limit))
    },
    flush() {
      inspectLine(buffer)
      buffer = ""
    },
  }
}

function tryKill(child: StartChild | undefined, signal?: NodeJS.Signals): void {
  if (!child) return
  try {
    child.kill(signal)
  } catch {
    // The child may already have exited.
  }
}

function reportSpawnError(
  stderr: NodeJS.WritableStream,
  serverEntry: string,
  error: unknown,
): void {
  stderr.write(`Failed to start Arete server (${serverEntry}): ${errorMessage(error)}\n`)
}

function reportLogError(
  stderr: NodeJS.WritableStream,
  logPath: string,
  error: unknown,
): void {
  stderr.write(`Arete log error (${logPath}): ${errorMessage(error)}\n`)
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
