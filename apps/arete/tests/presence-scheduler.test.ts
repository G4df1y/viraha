import { afterEach, beforeEach, describe, expect, it } from "vitest"
import crypto from "crypto"
import fs from "fs"
import os from "os"
import path from "path"
import { closeDb, initDb, migrate } from "@viraha/db"
import { DurableScheduler } from "@viraha/runtime"
import { runScheduledPresenceChecks } from "../src/presence-scheduler.js"

function tempDbPath(): string {
  return path.join(os.tmpdir(), `arete-presence-scheduler-${crypto.randomUUID()}.db`)
}

describe("runScheduledPresenceChecks", () => {
  let dbPath: string

  beforeEach(async () => {
    dbPath = tempDbPath()
    await migrate(dbPath)
    initDb(dbPath)
  })

  afterEach(() => {
    closeDb()
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.unlinkSync(dbPath + suffix) } catch {}
    }
  })

  it("queues and runs one durable presence check for each active user", async () => {
    const scheduler = new DurableScheduler()
    const checked: string[] = []

    const result = await runScheduledPresenceChecks({
      scheduler,
      listActiveUsers: async () => ["u1", "u2"],
      presence: { checkUser: async userId => { checked.push(userId) } },
    })

    expect(checked).toEqual(["u1", "u2"])
    expect(result).toEqual({ completed: 2, failed: 0 })
  })
})
