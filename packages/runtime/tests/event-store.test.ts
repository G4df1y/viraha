import { afterEach, beforeEach, describe, expect, it } from "vitest"
import os from "os"
import path from "path"
import fs from "fs"
import crypto from "crypto"

import { closeDb, initDb, migrate } from "@viraha/db"
import type { EventEnvelope, EventType } from "@viraha/core"
import { EventStore } from "../src/event-store.js"

describe("EventStore", () => {
  let dbPath: string

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `viraha-event-store-${crypto.randomUUID()}.db`)
    await migrate(dbPath)
    initDb(dbPath)
  })

  afterEach(() => {
    closeDb()
    try { fs.unlinkSync(dbPath) } catch {}
    try { fs.unlinkSync(dbPath + "-wal") } catch {}
    try { fs.unlinkSync(dbPath + "-shm") } catch {}
  })

  it("applies filters before limit", async () => {
    const store = new EventStore()

    await store.persist(event("1", "UserMessageReceived", "user-a", "c1"))
    await store.persist(event("2", "AgentResponseSent", "user-a", "c1"))

    const rows = await store.query({ type: "AgentResponseSent", limit: 1 })

    expect(rows.map(row => row.type)).toEqual(["AgentResponseSent"])
  })

  it("queries a single correlation timeline", async () => {
    const store = new EventStore()

    await store.persist(event("1", "UserMessageReceived", "user-a", "c1"))
    await store.persist(event("2", "UserMessageReceived", "user-b", "c2"))
    await store.persist(event("3", "AgentResponseSent", "user-b", "c2"))

    const rows = await store.query({ correlationId: "c2" })

    expect(rows.map(row => row.id)).toEqual(["2", "3"])
  })

  it("returns the most recent events in chronological order", async () => {
    const store = new EventStore()

    await store.persist(event("1", "UserMessageReceived", "user-a", "c1"))
    await store.persist(event("2", "AgentThinking", "user-a", "c1"))
    await store.persist(event("3", "AgentResponseSent", "user-a", "c1"))

    const rows = await store.query({ limit: 2 })

    expect(rows.map(row => row.id)).toEqual(["2", "3"])
  })
})

function event(id: string, type: EventType, userId: string, correlationId: string): EventEnvelope {
  return {
    id,
    type,
    source: "test",
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, Number(id))).toISOString(),
    correlationId,
    payload: { id },
    metadata: { userId, priority: "normal" },
  }
}
