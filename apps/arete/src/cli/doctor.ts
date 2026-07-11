import { randomUUID } from "node:crypto"
import { mkdir, unlink, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import path from "node:path"

import { resolveAretePaths } from "../config/paths.js"
import type { AretePaths } from "../config/paths.js"
import { checkNodeVersion } from "./runtime-check.js"

export interface DoctorCheck {
  id: "node" | "data" | "config" | "logs" | "port"
  ok: boolean
  message?: string
}

export interface DoctorReport {
  ok: boolean
  checks: DoctorCheck[]
}

export interface RunDoctorOptions {
  nodeVersion?: string
  port?: number
  paths?: AretePaths
  ensureWritable?: (directory: string) => Promise<boolean>
  isPortAvailable?: (port: number) => Promise<boolean>
}

export async function runDoctor(options: RunDoctorOptions = {}): Promise<DoctorReport> {
  const nodeVersion = options.nodeVersion ?? process.versions.node
  const port = options.port ?? Number.parseInt(process.env.PORT || "3000", 10)
  const paths = options.paths ?? resolveAretePaths()
  const ensureWritable = options.ensureWritable ?? defaultEnsureWritable
  const isPortAvailable = options.isPortAvailable ?? defaultIsPortAvailable
  const node = checkNodeVersion(nodeVersion)

  const checks: DoctorCheck[] = [
    {
      id: "node",
      ok: node.ok,
      ...(!node.ok ? { message: node.message } : {}),
    },
    await checkDirectory("data", paths.dataDir, ensureWritable),
    await checkDirectory("config", paths.configDir, ensureWritable),
    await checkDirectory("logs", paths.logDir, ensureWritable),
    await checkPort(port, isPortAvailable),
  ]

  return {
    ok: checks.every(check => check.ok),
    checks,
  }
}

async function checkDirectory(
  id: "data" | "config" | "logs",
  directory: string,
  ensureWritable: (directory: string) => Promise<boolean>,
): Promise<DoctorCheck> {
  try {
    const ok = await ensureWritable(directory)
    return {
      id,
      ok,
      ...(!ok ? { message: `Directory is not writable: ${directory}` } : {}),
    }
  } catch (error) {
    return { id, ok: false, message: errorMessage(error) }
  }
}

async function checkPort(
  port: number,
  isPortAvailable: (port: number) => Promise<boolean>,
): Promise<DoctorCheck> {
  try {
    const ok = await isPortAvailable(port)
    return {
      id: "port",
      ok,
      ...(!ok ? { message: `Port 127.0.0.1:${port} is unavailable.` } : {}),
    }
  } catch (error) {
    return { id: "port", ok: false, message: errorMessage(error) }
  }
}

async function defaultEnsureWritable(directory: string): Promise<boolean> {
  const probePath = path.join(directory, `.arete-write-test-${process.pid}-${randomUUID()}`)

  try {
    await mkdir(directory, { recursive: true })
    await writeFile(probePath, "ok", { flag: "wx" })
    await unlink(probePath)
    return true
  } catch {
    try {
      await unlink(probePath)
    } catch {
      // The probe may not have been created.
    }
    return false
  }
}

function defaultIsPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer()
    let settled = false

    const finish = (available: boolean) => {
      if (settled) return
      settled = true
      resolve(available)
    }

    server.once("error", () => finish(false))
    server.listen(port, "127.0.0.1", () => {
      server.close(error => finish(!error))
    })
    server.unref()
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
