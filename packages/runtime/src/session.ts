import { getDb } from "@viraha/db"
import { sessions, messages } from "@viraha/db"
import { eq, desc, sql } from "drizzle-orm"
import crypto from "crypto"

export class SessionManager {
  async getOrCreateSession(userId: string, channel: string): Promise<{ id: string; isNew: boolean }> {
    const db = getDb()

    const existing = await db.query.sessions.findFirst({
      where: (s, { eq, and }) => and(eq(s.userId, userId), eq(s.channel, channel)),
      orderBy: (s, { desc }) => [desc(s.startedAt)],
    })

    if (existing && !existing.endedAt) {
      return { id: existing.id, isNew: false }
    }

    const id = crypto.randomUUID()
    await db.insert(sessions).values({
      id,
      userId,
      channel,
      startedAt: new Date().toISOString(),
    })
    return { id, isNew: true }
  }

  async getSessionMessages(sessionId: string, limit = 50): Promise<Array<{ role: string; content: string }>> {
    const db = getDb()
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.createdAt))
      .limit(limit)

    return rows.reverse().map(m => ({
      role: m.role,
      content: m.content ?? "",
    }))
  }

  async storeMessage(sessionId: string, role: string, content: string, opts?: {
    toolCalls?: string
    toolResults?: string
    tokens?: number
  }) {
    const db = getDb()
    const id = crypto.randomUUID()

    await db.insert(messages).values({
      id,
      sessionId,
      role,
      content,
      toolCalls: opts?.toolCalls,
      toolResults: opts?.toolResults,
      tokens: opts?.tokens,
      createdAt: new Date().toISOString(),
    })

    await db
      .update(sessions)
      .set({ messageCount: sql`message_count + 1` })
      .where(eq(sessions.id, sessionId))
  }

  async endSession(sessionId: string) {
    const db = getDb()
    await db
      .update(sessions)
      .set({ endedAt: new Date().toISOString() })
      .where(eq(sessions.id, sessionId))
  }
}


