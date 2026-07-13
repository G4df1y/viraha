import { mkdtemp, readdir, rm } from "node:fs/promises"
import { createServer } from "node:net"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import type { AretePaths } from "../src/config/paths.js"
import { runDoctor } from "../src/cli/doctor.js"

const paths: AretePaths = {
  rootDir: "/srv/arete",
  dataDir: "/srv/arete/data",
  configDir: "/srv/arete/config",
  logDir: "/srv/arete/logs",
  dbPath: "/srv/arete/data/arete.db",
  logPath: "/srv/arete/logs/arete.log",
}

describe("runDoctor", () => {
  it("reports an unsupported Node.js version without throwing", async () => {
    const report = await runDoctor({
      nodeVersion: "24.1.0",
      port: 3000,
      paths,
      ensureWritable: async () => true,
      isPortAvailable: async () => true,
    })

    expect(report.ok).toBe(false)
    expect(report.checks[0]).toMatchObject({ id: "node", ok: false })
  })

  it("passes when every runtime requirement is available", async () => {
    const report = await runDoctor({
      nodeVersion: "22.18.0",
      port: 3000,
      paths,
      ensureWritable: async () => true,
      isPortAvailable: async () => true,
    })

    expect(report.ok).toBe(true)
    expect(report.checks.map(check => check.id)).toEqual([
      "node",
      "data",
      "config",
      "logs",
      "port",
    ])
  })

  it("reports an occupied port", async () => {
    const report = await runDoctor({
      nodeVersion: "22.18.0",
      port: 3000,
      paths,
      ensureWritable: async () => true,
      isPortAvailable: async () => false,
    })

    expect(report.ok).toBe(false)
    expect(report.checks.at(-1)).toMatchObject({ id: "port", ok: false })
  })

  it("uses PORT from the environment when no port option is provided", async () => {
    const previousPort = process.env.PORT
    let checkedPort: number | undefined
    process.env.PORT = "4312"

    try {
      await runDoctor({
        nodeVersion: "22.18.0",
        paths,
        ensureWritable: async () => true,
        isPortAvailable: async port => {
          checkedPort = port
          return true
        },
      })
    } finally {
      if (previousPort === undefined) {
        delete process.env.PORT
      } else {
        process.env.PORT = previousPort
      }
    }

    expect(checkedPort).toBe(4312)
  })

  it("prefers an explicit port option over PORT from the environment", async () => {
    const previousPort = process.env.PORT
    let checkedPort: number | undefined
    process.env.PORT = "4312"

    try {
      await runDoctor({
        nodeVersion: "22.18.0",
        port: 4313,
        paths,
        ensureWritable: async () => true,
        isPortAvailable: async port => {
          checkedPort = port
          return true
        },
      })
    } finally {
      if (previousPort === undefined) {
        delete process.env.PORT
      } else {
        process.env.PORT = previousPort
      }
    }

    expect(checkedPort).toBe(4313)
  })

  it("checks real directories and removes write probes", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "arete-doctor-"))
    const runtimePaths = createTestPaths(rootDir)

    try {
      const report = await runDoctor({
        port: 0,
        paths: runtimePaths,
      })

      expect(report.checks.slice(1, 4)).toEqual([
        { id: "data", ok: true },
        { id: "config", ok: true },
        { id: "logs", ok: true },
      ])

      for (const directory of [runtimePaths.dataDir, runtimePaths.configDir, runtimePaths.logDir]) {
        const entries = await readdir(directory)
        expect(entries.filter(entry => entry.includes("write-test"))).toEqual([])
      }
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("detects a real occupied port and sees it available after close", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "arete-doctor-port-"))
    const runtimePaths = createTestPaths(rootDir)
    const server = createServer()

    try {
      await listenOnRandomPort(server)
      const port = (server.address() as AddressInfo).port

      const occupied = await runDoctor({ port, paths: runtimePaths })
      expect(occupied.checks.at(-1)).toMatchObject({ id: "port", ok: false })

      await closeServer(server)

      const available = await runDoctor({ port, paths: runtimePaths })
      expect(available.checks.at(-1)).toMatchObject({ id: "port", ok: true })
    } finally {
      if (server.listening) await closeServer(server)
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("reports an invalid port without throwing", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "arete-doctor-invalid-port-"))

    try {
      const report = await runDoctor({
        port: -1,
        paths: createTestPaths(rootDir),
      })

      expect(report.checks.at(-1)).toMatchObject({ id: "port", ok: false })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})

function createTestPaths(rootDir: string): AretePaths {
  const dataDir = path.join(rootDir, "data")
  const configDir = path.join(rootDir, "config")
  const logDir = path.join(rootDir, "logs")

  return {
    rootDir,
    dataDir,
    configDir,
    logDir,
    dbPath: path.join(dataDir, "arete.db"),
    logPath: path.join(logDir, "arete.log"),
  }
}

function listenOnRandomPort(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once("error", onError)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError)
      resolve()
    })
  })
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
}
