/**
 * JournalEngine —— 日记引擎
 *
 * 职责：
 * 1. 用户写日记（存储 + 关联情绪标签）
 * 2. Arete 共写日记（生成陪伴视角的回应/补充，记录"共同经历"）
 * 3. 读取日记（按日期/按用户）
 * 4. 输出近期日记摘要，喂回 pipeline 作为"共同经历记忆"
 */
import { getDb } from "@viraha/db"
import { diaryEntries } from "@viraha/db"
import { eq, desc, and, gte, lte } from "drizzle-orm"
import type { LLMProvider } from "@viraha/provider"
import type { JournalEntry, AreteJournalRequest } from "./types.js"

export class JournalEngine {
  /**
   * 用户写日记
   */
  async writeUserEntry(
    userId: string,
    content: string,
    moodTags?: string,
    date?: string,
  ): Promise<JournalEntry> {
    const db = getDb()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const entryDate = date ?? now.substring(0, 10)
    await db.insert(diaryEntries).values({
      id,
      userId,
      date: entryDate,
      content,
      moodTags: moodTags ?? null,
      generatedBy: "user",
      createdAt: now,
    })
    return { id, userId, date: entryDate, content, moodTags, generatedBy: "user", createdAt: now }
  }

  /**
   * Arete 共写日记 —— 基于用户当天内容生成陪伴视角的回应。
   * 这不是"总结"，是 Arete 作为伙伴写下的一段话，记入"共同经历"。
   */
  async writeAreteEntry(
    req: AreteJournalRequest,
    llm: LLMProvider,
    model: string,
  ): Promise<JournalEntry> {
    const prompt = this.buildAreteJournalPrompt(req)
    const result = await llm.chat({
      model,
      messages: [
        {
          role: "system",
          content: "你是 Arete，用户的朋友。用第一人称写一段简短的日记回应（100-200字），像朋友在日记本上写下的批注。不要说教，不要总结，就是陪伴。用中文。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      maxTokens: 300,
    })

    const content = result.content ?? ""
    const db = getDb()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await db.insert(diaryEntries).values({
      id,
      userId: req.userId,
      date: req.date,
      content,
      moodTags: req.moodSummary ?? null,
      generatedBy: "arete",
      createdAt: now,
    })
    return { id, userId: req.userId, date: req.date, content, moodTags: req.moodSummary, generatedBy: "arete", createdAt: now }
  }

  /** 获取某天的所有日记（用户 + Arete） */
  async getByDate(userId: string, date: string): Promise<JournalEntry[]> {
    const db = getDb()
    const rows = await db.query.diaryEntries.findMany({
      where: and(eq(diaryEntries.userId, userId), eq(diaryEntries.date, date)),
      orderBy: diaryEntries.createdAt,
    })
    return rows.map(this.mapRow)
  }

  /** 获取近期日记（默认 7 天） */
  async getRecent(userId: string, days = 7): Promise<JournalEntry[]> {
    const db = getDb()
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)
    const rows = await db.query.diaryEntries.findMany({
      where: and(eq(diaryEntries.userId, userId), gte(diaryEntries.date, from)),
      orderBy: desc(diaryEntries.createdAt),
      limit: 30,
    })
    return rows.map(this.mapRow)
  }

  /** 生成近期日记摘要，注入 prompt 作为"共同经历记忆" */
  async buildJournalContext(userId: string): Promise<string> {
    const recent = await this.getRecent(userId, 7)
    if (recent.length === 0) return ""

    const lines = recent.map(e => {
      const who = e.generatedBy === "user" ? "用户" : "Arete"
      const mood = e.moodTags ? `[${e.moodTags}]` : ""
      return `${e.date} ${who}${mood}: ${e.content.substring(0, 120)}${e.content.length > 120 ? "..." : ""}`
    })

    return `## 近期共同日记\n${lines.join("\n")}\n\n这是你们最近的共同经历。在对话中自然地引用，不要生硬复述。`
  }

  private buildAreteJournalPrompt(req: AreteJournalRequest): string {
    const parts: string[] = [`日期：${req.date}`]
    if (req.userEntry) parts.push(`用户今天写的：\n${req.userEntry}`)
    if (req.moodSummary) parts.push(`用户今天情绪：${req.moodSummary}`)
    if (!req.userEntry) parts.push("用户今天没写日记。作为朋友，写一段你想跟 TA 说的话。")
    return parts.join("\n\n")
  }

  private mapRow(r: typeof diaryEntries.$inferSelect): JournalEntry {
    return {
      id: r.id,
      userId: r.userId,
      date: r.date,
      content: r.content,
      moodTags: r.moodTags ?? undefined,
      generatedBy: r.generatedBy as "user" | "arete",
      createdAt: r.createdAt,
    }
  }
}
