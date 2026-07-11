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

interface StartChild {
  stdout: Readable
  stderr: Readable
  once(event: "error", listener: (error: Error) => void): this
  once(event: "close", listener: (code: number | null) => void): this
}

interface LogStream extends Writable {
  end(callback?: () => void): this
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
  await mkdir(paths.logDir, { recursive: true })

  const createWriteStream = dependencies.createWriteStream ?? defaultCreateWriteStream
  const log = createWriteStream(paths.logPath, { flags: "a" })
  const spawn = dependencies.spawn ?? spawnWithPipedOutput
  const stdout = dependencies.stdout ?? process.stdout
  const stderr = dependencies.stderr ?? process.stderr
  const openBrowser = dependencies.openBrowser ?? open
  const detector = createWebUrlDetector(url => {
    void openBrowser(url).catch(error => stderr.write(`${String(error)}\n`))
  })

  let child: StartChild
  try {
    child = spawn(
      dependencies.execPath ?? process.execPath,
      [fileURLToPath(new URL("../index.js", import.meta.url))],
      {
        env: { ...(dependencies.env ?? process.env), ARETE_HOME: paths.rootDir },
        stdio: ["inherit", "pipe", "pipe"],
      },
    )
  } catch {
    await endLog(log)
    return 1
  }

  forward(child.stdout, stdout, log, detector.push)
  forward(child.stderr, stderr, log)

  return new Promise(resolve => {
    let settled = false
    const finish = (code: number) => {
      if (settled) return
      settled = true
      detector.flush()
      log.end(() => resolve(code))
    }

    child.once("error", () => finish(1))
    child.once("close", code => finish(code ?? 1))
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
  inspect?: (text: string) => void,
): void {
  source.on("data", chunk => {
    terminal.write(chunk)
    log.write(chunk)
    inspect?.(chunk.toString())
  })
}

function createWebUrlDetector(openUrl: (url: string) => void) {
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
      buffer += chunk
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ""
      for (const line of lines) inspectLine(line)
    },
    flush() {
      inspectLine(buffer)
      buffer = ""
    },
  }
}

function endLog(log: LogStream): Promise<void> {
  return new Promise(resolve => log.end(resolve))
}
