import { getDb } from "@viraha/db"
import { relationships } from "@viraha/db"
import { eq } from "drizzle-orm"
import type { RelationshipState } from "@viraha/core"

export class RelationshipManager {
  private cache = new Map<string, RelationshipState>()

  async getOrCreate(userId: string): Promise<RelationshipState> {
    const cached = this.cache.get(userId)
    if (cached) return cached

    const db = getDb()
    let row = await db.query.relationships.findFirst({
      where: eq(relationships.userId, userId),
    })

    if (!row) {
      const now = new Date().toISOString()
      await db.insert(relationships).values({
        userId,
        createdAt: now,
        updatedAt: now,
      })
      row = (await db.query.relationships.findFirst({
        where: eq(relationships.userId, userId),
      }))!
    }

    const state: RelationshipState = {
      userId: row.userId,
      score: row.score,
      trust: row.trust,
      intimacy: row.intimacy,
      initiative: row.initiative,
      attachment: row.attachment,
      level: row.level,
      currentXp: row.currentXp,
      xpToNext: row.xpToNext,
      decayRate: row.decayRate,
      lastInteractionAt: row.lastInteractionAt ? new Date(row.lastInteractionAt) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }

    this.cache.set(userId, state)
    return state
  }

  async recordInteraction(userId: string) {
    const state = await this.getOrCreate(userId)
    const now = new Date()

    const decay = this.calculateDecay(state)

    const updates: Partial<RelationshipState> = {
      score: Math.max(0, state.score + 1 - decay),
      trust: Math.min(100, state.trust + 0.5),
      lastInteractionAt: now,
      updatedAt: now,
    }

    await this.applyUpdates(userId, updates)
    this.cache.delete(userId)
  }

  async addXp(userId: string, amount: number): Promise<{ leveledUp: boolean; newLevel: number }> {
    const state = await this.getOrCreate(userId)
    let newXp = state.currentXp + amount
    let newLevel = state.level
    let leveledUp = false

    while (newXp >= state.xpToNext) {
      newXp -= state.xpToNext
      newLevel++
      leveledUp = true
    }

    await this.applyUpdates(userId, {
      currentXp: newXp,
      level: newLevel,
      xpToNext: Math.floor(state.xpToNext * 1.3),
      updatedAt: new Date(),
    })

    this.cache.delete(userId)
    return { leveledUp, newLevel }
  }

  async adjustTrust(userId: string, delta: number) {
    const state = await this.getOrCreate(userId)
    const newTrust = Math.max(0, Math.min(100, state.trust + delta))
    await this.applyUpdates(userId, { trust: newTrust, updatedAt: new Date() })
    this.cache.delete(userId)
  }

  getTitle(level: number): string {
    if (level === 1) return "Acquaintance"
    if (level <= 2) return "Training Partner"
    if (level <= 4) return "Coach"
    if (level <= 6) return "Mentor"
    if (level <= 8) return "Trusted Companion"
    return "Lifetime Partner"
  }

  private calculateDecay(state: RelationshipState): number {
    if (!state.lastInteractionAt) return 0

    const hoursSince = (Date.now() - state.lastInteractionAt.getTime()) / 3600000
    if (hoursSince < 24) return 0

    const daysSince = hoursSince / 24
    const baseDecay = state.decayRate * daysSince
    const attachmentBuff = state.attachment / 100 * 0.5

    return Math.max(0, Math.min(5, baseDecay * (1 - attachmentBuff)))
  }

  private async applyUpdates(userId: string, updates: Partial<RelationshipState>) {
    const db = getDb()
    const data: Record<string, unknown> = { ...updates }
    if (data.lastInteractionAt) data.lastInteractionAt = (data.lastInteractionAt as Date).toISOString()
    if (data.updatedAt) data.updatedAt = (data.updatedAt as Date).toISOString()

    await db
      .update(relationships)
      .set(data as Partial<typeof relationships.$inferInsert>)
      .where(eq(relationships.userId, userId))
  }

  getRelationshipSummary(state: RelationshipState): string {
    return [
      `Relationship: ${state.score}/1000`,
      `Trust: ${state.trust}/100`,
      `Level: ${state.level} (${this.getTitle(state.level)})`,
      `XP: ${state.currentXp}/${state.xpToNext}`,
    ].join("\n")
  }
}


