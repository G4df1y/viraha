import { getDb, eventStore } from "@viraha/db"
import type { EventEnvelope, EventType } from "@viraha/core"
import crypto from "crypto"
import { and, desc, eq } from "drizzle-orm"
import { redactPayload } from "./log-redactor.js"

export class EventStore {
  async persist(event: EventEnvelope): Promise<void> {
    try {
      const db = getDb()
      // Redact secrets before they reach storage so a trace can never leak a
      // Provider API key, cookie, or channel signature.
      const safePayload = redactPayload(event.payload)
      await db.insert(eventStore).values({
        id: event.id,
        type: event.type,
        source: event.source,
        userId: event.metadata.userId ?? null,
        sessionId: event.metadata.sessionId ?? null,
        correlationId: event.correlationId,
        payload: JSON.stringify(safePayload),
        priority: event.metadata.priority,
        createdAt: event.timestamp,
      })
    } catch (err) {
      console.error("[EventStore] Persist failed:", err instanceof Error ? err.message : err)
    }
  }

  /**
   * Delete every event belonging to a user. Used by the data-deletion API so a
   * user can erase their own trace history. Returns the number of deleted rows.
   */
  async deleteByUser(userId: string): Promise<number> {
    const db = getDb()
    const result = await db.delete(eventStore).where(eq(eventStore.userId, userId))
    return (result as unknown as { changes?: number }).changes ?? 0
  }

  async query(filter?: {
    type?: string
    userId?: string
    sessionId?: string
    correlationId?: string
    limit?: number
  }): Promise<EventEnvelope[]> {
    const db = getDb()
    const filters = []

    if (filter?.type) filters.push(eq(eventStore.type, filter.type))
    if (filter?.userId) filters.push(eq(eventStore.userId, filter.userId))
    if (filter?.sessionId) filters.push(eq(eventStore.sessionId, filter.sessionId))
    if (filter?.correlationId) filters.push(eq(eventStore.correlationId, filter.correlationId))

    let query = db
      .select()
      .from(eventStore)
      .$dynamic()

    if (filters.length > 0) query = query.where(and(...filters))

    const rows = await query
      .orderBy(desc(eventStore.createdAt))
      .limit(filter?.limit ?? 100)

    return rows.reverse().map(r => ({
      id: r.id,
      type: r.type as EventType,
      source: r.source,
      correlationId: r.correlationId,
      timestamp: r.createdAt,
      payload: JSON.parse(r.payload ?? "{}"),
      metadata: {
        userId: r.userId ?? undefined,
        sessionId: r.sessionId ?? undefined,
        priority: r.priority as EventEnvelope["metadata"]["priority"],
      },
    }))
  }
}


