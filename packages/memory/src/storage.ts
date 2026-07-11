import { getDb } from "@viraha/db"
import { memoryEntries, sessions, messages } from "@viraha/db"
import { eq, and, like, desc, sql } from "drizzle-orm"
import crypto from "crypto"

export class MemoryStore {
  async storeEntry(userId: string, type: string, key: string, content: string, metadata?: Record<string, unknown>) {
    const db = getDb()

    const existing = await db
      .select()
      .from(memoryEntries)
      .where(and(eq(memoryEntries.userId, userId), eq(memoryEntries.type, type), eq(memoryEntries.key, key)))
      .limit(1)

    const now = new Date().toISOString()

    if (existing.length) {
      await db
        .update(memoryEntries)
        .set({ content, metadata: JSON.stringify(metadata ?? {}), updatedAt: now })
        .where(eq(memoryEntries.id, existing[0].id))
      return existing[0].id
    }

    const id = crypto.randomUUID()
    await db.insert(memoryEntries).values({
      id,
      userId,
      type,
      key,
      content,
      metadata: JSON.stringify(metadata ?? {}),
      createdAt: now,
      updatedAt: now,
    })
    return id
  }

  async getEntries(userId: string, type?: string): Promise<Array<{ id: string; type: string; key: string; content: string; metadata: Record<string, unknown>; createdAt: string; updatedAt: string }>> {
    const db = getDb()
    const conditions = [eq(memoryEntries.userId, userId)]
    if (type) conditions.push(eq(memoryEntries.type, type))

    const rows = await db
      .select()
      .from(memoryEntries)
      .where(and(...conditions))
      .orderBy(desc(memoryEntries.updatedAt))

    return rows.map(r => ({
      ...r,
      metadata: JSON.parse(r.metadata ?? "{}"),
      createdAt: r.createdAt ?? new Date().toISOString(),
      updatedAt: r.updatedAt ?? new Date().toISOString(),
    }))
  }

  async deleteEntry(userId: string, type: string, key: string) {
    const db = getDb()
    await db
      .delete(memoryEntries)
      .where(and(eq(memoryEntries.userId, userId), eq(memoryEntries.type, type), eq(memoryEntries.key, key)))
  }

  async searchMessages(userId: string, query: string, limit = 10) {
    const db = getDb()

    const rows = await db
      .select()
      .from(messages)
      .innerJoin(sessions, eq(messages.sessionId, sessions.id))
      .where(and(eq(sessions.userId, userId), like(messages.content!, `%${query}%`)))
      .orderBy(desc(messages.createdAt))
      .limit(limit)

    return rows.map(r => ({
      role: r.messages.role,
      content: r.messages.content,
      createdAt: r.messages.createdAt,
      sessionId: r.messages.sessionId,
    }))
  }

  async getSessionSummaries(userId: string, limit = 20) {
    const db = getDb()
    return await db
      .select({
        id: sessions.id,
        messageCount: sessions.messageCount,
        summary: sessions.summary,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.startedAt))
      .limit(limit)
  }
}


