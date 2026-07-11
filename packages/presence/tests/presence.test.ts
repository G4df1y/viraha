import { describe, it, expect, beforeEach, afterEach } from "vitest"
import os from "os"
import path from "path"
import fs from "fs"
import crypto from "crypto"
import { eq } from "drizzle-orm"

import { migrate, initDb, closeDb, getDb } from "@viraha/db"
import { users, events } from "@viraha/db"
import { PresenceEngine } from "../src/engine.js"

function tempDbPath(): string {
  return path.join(os.tmpdir(), `presence-test-${crypto.randomUUID()}.db`)
}

describe("PresenceEngine delivery", () => {
  let dbPath: string
  let userId: string

  beforeEach(async () => {
    dbPath = tempDbPath()
    await migrate(dbPath)
    initDb(dbPath)
    userId = crypto.randomUUID()
    const db = getDb()
    await db.insert(users).values({
      id: userId,
      externalId: `ext-${userId}`,
      channel: "test",
      name: "Test User",
      createdAt: new Date().toISOString(),
    })
  })

  afterEach(() => {
    closeDb()
    try { fs.unlinkSync(dbPath) } catch {}
    try { fs.unlinkSync(dbPath + "-wal") } catch {}
    try { fs.unlinkSync(dbPath + "-shm") } catch {}
  })

  it("keeps proactive event pending when sender throws", async () => {
    const engine = new PresenceEngine()
    let senderCalls = 0
    engine.setSender(async () => {
      senderCalls++
      throw new Error("downstream down")
    })

    await engine.checkUser(userId)

    expect(senderCalls).toBe(1)

    const db = getDb()
    const rows = await db.select().from(events).where(eq(events.userId, userId))
    expect(rows.length).toBe(1)
    const meta = JSON.parse(rows[0].metadata ?? "{}")
    expect(meta.delivered).toBe(false)
  })

  it("retries the existing pending event instead of creating a duplicate", async () => {
    const engine = new PresenceEngine()
    let senderCalls = 0
    engine.setSender(async () => {
      senderCalls++
      if (senderCalls === 1) throw new Error("temporary outage")
    })

    await engine.checkUser(userId)
    await engine.checkUser(userId)

    expect(senderCalls).toBe(2)
    const db = getDb()
    const rows = await db.select().from(events).where(eq(events.userId, userId))
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0].metadata ?? "{}").delivered).toBe(true)
  })
})
