import { getDb, sessions } from "@viraha/db"
import { messages } from "@viraha/db"
import { eq, desc } from "drizzle-orm"
import type { LLMProvider } from "@viraha/provider"

const PRUNE_THRESHOLD = 200
const PROTECT_HEAD = 4    // first 4 exchanges
const PROTECT_TAIL = 20   // last 20 messages
const SUMMARY_BUDGET = 0.20  // 20% of content tokens

interface MessageRecord {
  id: string
  sessionId: string
  role: string
  content: string | null
  toolCalls: string | null
  toolResults: string | null
  createdAt: string
}

export class SessionCompressor {
  async compressSession(
    sessionId: string,
    llm: LLMProvider,
    model: string
  ): Promise<void> {
    const db = getDb()
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.createdAt))

    if (rows.length < 30) return // don't compress small sessions

    // Phase 1: Prune old tool results
    const pruned = rows.map(r => ({
      ...r,
      content: r.content && r.content.length > PRUNE_THRESHOLD
        ? "[Tool output truncated]"
        : r.content,
    }))

    // Phase 2: Determine boundaries
    const head = pruned.slice(0, PROTECT_HEAD)
    const tail = pruned.slice(-PROTECT_TAIL)
    const middle = pruned.slice(PROTECT_HEAD, pruned.length - PROTECT_TAIL)

    if (middle.length < 5) return // not enough to compress

    // Phase 3: Generate structured summary
    const summary = await this.generateSummary(middle, llm, model)

    // Phase 4: Store summary in session record
    await db
      .update(sessions)
      .set({ summary })
      .where(eq(sessions.id, sessionId))
  }

  private async generateSummary(
    messages: MessageRecord[],
    llm: LLMProvider,
    model: string
  ): Promise<string> {
    const conversationText = messages
      .map(m => `[${m.role}]: ${(m.content ?? "").substring(0, 500)}`)
      .join("\n")

    const prompt = `Summarize this conversation segment. Focus on:

## Key Facts
## User's Current State (mood, energy, goals mentioned)
## Decisions Made
## Plans Set
## Topics Discussed

Conversation:
${conversationText.substring(0, 3000)}

Summary:`

    try {
      const result = await llm.chat({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        maxTokens: 500,
      })
      return result.content
    } catch {
      return `[Session compressed: ${messages.length} messages summarized]`
    }
  }

  async shouldCompress(sessionId: string, threshold = 50): Promise<boolean> {
    const db = getDb()
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .limit(threshold + 1)
    return rows.length >= threshold
  }
}


