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
})
