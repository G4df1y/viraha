import { afterEach, beforeEach, describe, expect, it } from "vitest"
import os from "os"
import path from "path"
import fs from "fs"
import crypto from "crypto"

import { AgentPipeline, EventBus, EventStore, redactSecrets } from "@viraha/runtime"
import type { ChatChunk, ChatParams, ChatResponse, LLMProvider } from "@viraha/provider"
import { closeDb, initDb, migrate } from "@viraha/db"
import { MemoryEngine } from "@viraha/memory"
import { CompanionEngine } from "@viraha/relationship"
import { ChannelHub } from "@viraha/channels"

import { ARETE_IDENTITY } from "../src/identity.js"
import { createAreteApp } from "../src/web.js"
import { deleteUserData, exportUserData } from "../src/data-privacy.js"

function tempDbPath(): string {
  return path.join(os.tmpdir(), `arete-privacy-${crypto.randomUUID()}.db`)
}

function mockLlm(reply = "OK"): LLMProvider {
  return {
    name: "mock",
    async chat(_p: ChatParams): Promise<ChatResponse> {
      return { content: reply, finishReason: "stop", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } }
    },
    async *chatStream(): AsyncIterable<ChatChunk> {},
  }
}

function cookie(id: string): Record<string, string> {
  return { Cookie: `viraha_web_id=${id}` }
}

describe("P0.3 — privacy & data boundaries", () => {
  let dbPath: string
  let memory: MemoryEngine
  let companion: CompanionEngine
  let eventStore: EventStore
  let events: EventBus
  let hub: ChannelHub
  let app: ReturnType<typeof createAreteApp>

  beforeEach(async () => {
    dbPath = tempDbPath()
    await migrate(dbPath)
    initDb(dbPath)

    memory = new MemoryEngine()
    companion = new CompanionEngine()
    eventStore = new EventStore()
    events = new EventBus()
    events.useStore(eventStore)
    hub = new ChannelHub()

    const pipeline = new AgentPipeline({
      identity: ARETE_IDENTITY,
      model: "mock",
      llm: mockLlm("Let's get to work."),
      memory,
      companion,
      events,
    })

    app = createAreteApp(pipeline, undefined, undefined, hub, events, eventStore, undefined, undefined, undefined, memory, companion)
  })

  afterEach(() => {
    closeDb()
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.unlinkSync(dbPath + suffix) } catch {}
    }
  })

  it("a user chatting stores events under their own identity", async () => {
    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie("user-a") },
      body: JSON.stringify({ message: "plan a workout" }),
    })
    expect(res.status).toBe(200)

    const idRes = await app.request("/api/identity", { headers: cookie("user-a") })
    const { userId } = (await idRes.json()) as { userId: string }

    const evRes = await app.request("/api/events", { headers: cookie("user-a") })
    const body = (await evRes.json()) as { events: Array<{ type: string; userId?: string }> }
    expect(body.events.length).toBeGreaterThan(0)
    for (const e of body.events) {
      // every event returned belongs to the requesting user
      expect(e.userId).toBe(userId)
    }
  })

  it("user B cannot see user A's events (cross-user isolation)", async () => {
    // user A chats -> events stored
    await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie("user-a") },
      body: JSON.stringify({ message: "hi from A" }),
    })

    // user B requests events -> should see none of A's
    const res = await app.request("/api/events", { headers: cookie("user-b") })
    const body = (await res.json()) as { events: Array<{ type: string }> }
    expect(body.events.length).toBe(0)
  })

  it("blocks IDOR: passing ?userId=<other> does not leak another user's events", async () => {
    // user A chats
    await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie("user-a") },
      body: JSON.stringify({ message: "secret plan for A" }),
    })
    // learn A's userId
    const aId = ((await (await app.request("/api/identity", { headers: cookie("user-a") })).json()) as { userId: string }).userId

    // user B tries to fetch A's events by guessing A's userId
    const res = await app.request(`/api/events?userId=${encodeURIComponent(aId)}`, { headers: cookie("user-b") })
    const body = (await res.json()) as { events: Array<{ type: string }> }
    expect(body.events.length).toBe(0)
  })

  it("exportUserData returns the user's profile, memories, relationship and events as JSON", async () => {
    // user A chats so events + relationship interaction exist
    await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie("user-a") },
      body: JSON.stringify({ message: "hello" }),
    })
    const aId = ((await (await app.request("/api/identity", { headers: cookie("user-a") })).json()) as { userId: string }).userId

    const data = await exportUserData(memory, companion, eventStore, aId)
    expect(data).toHaveProperty("userId", aId)
    expect(data).toHaveProperty("profile")
    expect(data).toHaveProperty("memories")
    expect(data).toHaveProperty("relationship")
    expect(data).toHaveProperty("events")
    expect(Array.isArray(data.events)).toBe(true)
    expect(data.events.length).toBeGreaterThan(0)
  })

  it("GET /api/data/export returns the current user's data, not other users'", async () => {
    await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie("user-a") },
      body: JSON.stringify({ message: "A's data" }),
    })
    const aId = ((await (await app.request("/api/identity", { headers: cookie("user-a") })).json()) as { userId: string }).userId

    // user B exports -> should not contain A's events
    const res = await app.request("/api/data/export", { headers: cookie("user-b") })
    expect(res.status).toBe(200)
    const data = (await res.json()) as { userId: string; events: unknown[] }
    expect(data.userId).not.toBe(aId)
    expect(data.events.length).toBe(0)
  })

  it("DELETE /api/data removes the user's data; re-querying returns nothing", async () => {
    await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie("user-a") },
      body: JSON.stringify({ message: "to be deleted" }),
    })
    const aId = ((await (await app.request("/api/identity", { headers: cookie("user-a") })).json()) as { userId: string }).userId

    const delRes = await app.request("/api/data", { method: "DELETE", headers: cookie("user-a") })
    expect(delRes.status).toBe(200)

    // direct delete check on the store
    const remaining = await eventStore.query({ userId: aId })
    expect(remaining.length).toBe(0)

    // api also returns nothing now
    const evRes = await app.request("/api/events", { headers: cookie("user-a") })
    const body = (await evRes.json()) as { events: unknown[] }
    expect(body.events.length).toBe(0)
  })

  it("deleting user A's data does not touch user B's data", async () => {
    await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie("user-a") },
      body: JSON.stringify({ message: "A" }),
    })
    await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie("user-b") },
      body: JSON.stringify({ message: "B" }),
    })
    const bId = ((await (await app.request("/api/identity", { headers: cookie("user-b") })).json()) as { userId: string }).userId

    // A deletes their data
    await app.request("/api/data", { method: "DELETE", headers: cookie("user-a") })

    // B's events still intact
    const bEvents = await eventStore.query({ userId: bId })
    expect(bEvents.length).toBeGreaterThan(0)
  })

  it("deleteUserData is a no-op-safe call for an unknown user", async () => {
    await expect(deleteUserData("does-not-exist")).resolves.not.toThrow()
  })
})

describe("redactSecrets — log / trace sanitization", () => {
  it("redacts DeepSeek / Anthropic-style API keys", () => {
    const out = redactSecrets("error: call with key sk-abc123def456 failed")
    expect(out).not.toContain("sk-abc123def456")
    expect(out).toMatch(/sk-\[?redacted/i)
  })

  it("redacts Bearer tokens and Authorization headers", () => {
    const out = redactSecrets('Authorization: Bearer eyJhbGciOiJIUzI1')
    expect(out).not.toContain("eyJhbGciOiJIUzI1")
  })

  it("redacts the web identity cookie and channel signatures", () => {
    const out = redactSecrets("viraha_web_id=11111111-2222-3333-4444-555555555555; x-lark-signature: abcDEF123=")
    expect(out).not.toContain("11111111-2222-3333-4444-555555555555")
    expect(out).not.toContain("abcDEF123=")
  })

  it("leaves ordinary user text intact", () => {
    const out = redactSecrets("Plan a 30 minute workout for fat loss")
    expect(out).toBe("Plan a 30 minute workout for fat loss")
  })
})
