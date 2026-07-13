import { afterEach, beforeEach, describe, expect, it } from "vitest"
import crypto from "crypto"
import fs from "fs"
import os from "os"
import path from "path"
import { ManualClock } from "@viraha/companion-core"
import { closeDb, initDb, migrate } from "@viraha/db"
import { DurableScheduler } from "../src/scheduler.js"

function tempDbPath(): string {
  return path.join(os.tmpdir(), `viraha-scheduler-${crypto.randomUUID()}.db`)
}

describe("DurableScheduler", () => {
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

  it("uses the injected clock for creation and due-time checks", async () => {
    const clock = new ManualClock("2026-07-13T00:00:00.000Z")
    const scheduler = new DurableScheduler({ clock })
    const id = await scheduler.enqueue({
      userId: "u-clock",
      type: "presence",
      runAt: "2026-07-13T00:00:05.000Z",
    })

    expect((await scheduler.getJob(id))?.createdAt).toBe("2026-07-13T00:00:00.000Z")
    expect(await scheduler.claim(1)).toEqual([])

    clock.advance(5000)
    expect((await scheduler.claim(1))[0].id).toBe(id)
  })

  it("claims a due job once and completes it durably", async () => {
    const scheduler = new DurableScheduler()
    const id = await scheduler.enqueue({
      userId: "u1",
      type: "presence",
      payload: { message: "check in" },
      runAt: new Date(Date.now() - 1000),
    })

    const [claimed] = await scheduler.claim(1)
    expect(claimed).toMatchObject({ id, status: "running", attempts: 1 })
    expect(await scheduler.claim(1)).toEqual([])

    await scheduler.complete(id)
    expect(await scheduler.claim(1)).toEqual([])
  })

  it("requeues a failed job for a later retry", async () => {
    const scheduler = new DurableScheduler()
    const id = await scheduler.enqueue({
      userId: "u1",
      type: "presence",
      payload: {},
      runAt: new Date(Date.now() - 1000),
    })

    await scheduler.claim(1)
    await scheduler.fail(id, "temporary outage", new Date(Date.now() - 1))

    const [retry] = await scheduler.claim(1)
    expect(retry).toMatchObject({ id, status: "running", attempts: 2, lastError: "temporary outage" })
  })

  it("claims only jobs owned by a worker type", async () => {
    const scheduler = new DurableScheduler()
    await scheduler.enqueue({ userId: "u1", type: "knowledge-sync", runAt: new Date(Date.now() - 1000) })
    await scheduler.enqueue({ userId: "u1", type: "presence-check", runAt: new Date(Date.now() - 1000) })

    const [presence] = await scheduler.claim(1, new Date(), "presence-check")
    expect(presence.type).toBe("presence-check")

    const [sync] = await scheduler.claim(1, new Date(), "knowledge-sync")
    expect(sync.type).toBe("knowledge-sync")
  })

  it("runs due jobs and records handler failures", async () => {
    const scheduler = new DurableScheduler()
    await scheduler.enqueue({
      userId: "u1",
      type: "presence",
      payload: { message: "hello" },
      runAt: new Date(Date.now() - 1000),
    })
    await scheduler.enqueue({
      userId: "u1",
      type: "sync",
      payload: {},
      runAt: new Date(Date.now() - 1000),
    })

    const seen: string[] = []
    const result = await scheduler.runDue(async job => {
      seen.push(job.type)
      if (job.type === "sync") throw new Error("sync failed")
    })

    expect(seen).toEqual(["presence", "sync"])
    expect(result.completed).toBe(1)
    expect(result.failed).toBe(1)
  })

  // ===== P0.2: persistent proactive service scenarios =====

  it("survives a process restart: jobs written before close are claimable after reopen", async () => {
    const scheduler = new DurableScheduler()
    const id = await scheduler.enqueue({
      userId: "u1",
      type: "presence",
      runAt: new Date(Date.now() - 1000),
    })

    // simulate process restart: close and reopen the SAME db file
    closeDb()
    initDb(dbPath)

    const scheduler2 = new DurableScheduler()
    const [claimed] = await scheduler2.claim(1)
    expect(claimed).toBeDefined()
    expect(claimed.id).toBe(id)
    expect(claimed.status).toBe("running")
  })

  it("reclaims a stale running job after its lease expires and blocks concurrent claims", async () => {
    const scheduler = new DurableScheduler({ leaseMs: 1000 })
    const t0 = new Date("2026-01-01T00:00:00Z")
    await scheduler.enqueue({ userId: "u1", type: "presence", runAt: new Date(t0.getTime() - 1000) })

    const [first] = await scheduler.claim(1, t0)
    expect(first.attempts).toBe(1)
    expect(first.status).toBe("running")

    // a second worker claiming at the same instant gets nothing (job is running, not stale)
    expect(await scheduler.claim(1, t0)).toEqual([])

    // after the lease expires, the stale running job is reclaimed and re-claimed by another worker
    const afterLease = new Date(t0.getTime() + 2000)
    const [reclaimed] = await scheduler.claim(1, afterLease)
    expect(reclaimed).toBeDefined()
    expect(reclaimed.id).toBe(first.id)
    expect(reclaimed.attempts).toBe(2)
  })

  it("applies exponential backoff and permanently fails after max attempts", async () => {
    const scheduler = new DurableScheduler({
      leaseMs: 60_000,
      maxAttempts: 3,
      backoffBaseMs: 10,
      backoffMaxMs: 100,
    })
    const t0 = new Date("2026-01-01T00:00:00Z")
    const id = await scheduler.enqueue({ userId: "u1", type: "presence", runAt: new Date(t0.getTime() - 1000) })

    // attempt 1 fails -> requeued with backoff 10ms (base * 2^0)
    let r = await scheduler.runDue(async () => { throw new Error("boom") }, 10, t0)
    expect(r.failed).toBe(1)
    let job = await scheduler.getJob(id)
    expect(job!.status).toBe("queued")
    expect(job!.attempts).toBe(1)
    expect(job!.lastError).toBe("boom")
    // not due yet at t0 (runAt = t0 + 10ms)
    expect((await scheduler.runDue(async () => {}, 10, t0)).failed).toBe(0)

    // attempt 2 at t0+11ms fails -> requeued with backoff 20ms (base * 2^1)
    const t1 = new Date(t0.getTime() + 11)
    r = await scheduler.runDue(async () => { throw new Error("boom") }, 10, t1)
    expect(r.failed).toBe(1)
    job = await scheduler.getJob(id)
    expect(job!.attempts).toBe(2)

    // attempt 3 at t1+21ms fails -> maxAttempts reached -> permanent failed
    const t2 = new Date(t1.getTime() + 21)
    r = await scheduler.runDue(async () => { throw new Error("boom") }, 10, t2)
    expect(r.failed).toBe(1)
    job = await scheduler.getJob(id)
    expect(job!.status).toBe("failed")
    expect(job!.attempts).toBe(3)

    // no more retries
    expect((await scheduler.runDue(async () => {}, 10, new Date(t2.getTime() + 1000))).failed).toBe(0)
  })

  it("cooldown prevents duplicate same-type jobs for a user within the window", async () => {
    const scheduler = new DurableScheduler()
    const runAt = new Date()

    const first = await scheduler.enqueueWithCooldown(
      { userId: "u1", type: "presence-check", runAt },
      60_000,
    )
    expect(first.deduplicated).toBe(false)

    // same user + type within cooldown -> dedup, returns the existing id
    const second = await scheduler.enqueueWithCooldown(
      { userId: "u1", type: "presence-check", runAt: new Date(runAt.getTime() + 1000) },
      60_000,
    )
    expect(second.deduplicated).toBe(true)
    expect(second.id).toBe(first.id)

    // different user -> not deduped
    const otherUser = await scheduler.enqueueWithCooldown(
      { userId: "u2", type: "presence-check", runAt },
      60_000,
    )
    expect(otherUser.deduplicated).toBe(false)

    // different type for same user -> not deduped
    const otherType = await scheduler.enqueueWithCooldown(
      { userId: "u1", type: "knowledge-sync", runAt },
      60_000,
    )
    expect(otherType.deduplicated).toBe(false)
  })

  it("reports status counts and recent failures for the trace cockpit", async () => {
    const scheduler = new DurableScheduler({ maxAttempts: 1 })
    const failingId = await scheduler.enqueue({
      userId: "u1", type: "presence", runAt: new Date(Date.now() - 1000),
    })
    await scheduler.enqueue({ userId: "u2", type: "presence", runAt: new Date(Date.now() + 9999) })

    await scheduler.runDue(async () => { throw new Error("boom") }, 10)

    const stats = await scheduler.getStats()
    expect(stats.failed).toBe(1)
    expect(stats.queued).toBe(1)
    expect(stats.recentFailures.length).toBe(1)
    expect(stats.recentFailures[0].id).toBe(failingId)
    expect(stats.recentFailures[0].lastError).toBe("boom")
  })
})
