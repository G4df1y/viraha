import { getDb } from "@viraha/db"
import { trainingSessions, relationships, events } from "@viraha/db"
import { eq, desc, and, sql } from "drizzle-orm"

export interface TriggerResult {
  type: string
  priority: number
  data: Record<string, unknown>
}

export interface PendingProactiveEvent {
  eventId: string
  trigger: TriggerResult
  message: string
}

const sentStreaks = new Map<string, boolean>()

export class ConditionEvaluator {
  async evaluateAll(userId: string): Promise<TriggerResult | null> {
    const triggers: Array<() => Promise<TriggerResult | null>> = [
      () => this.checkNoTraining(userId),
      () => this.checkConsistencyStreak(userId),
      () => this.checkRelationMilestone(userId),
      () => this.checkWeekStart(userId),
      () => this.checkMealTime(userId),
    ]

    const results = await Promise.all(triggers.map(t => t()))
    const sorted = results.filter(Boolean).sort((a, b) => b!.priority - a!.priority)

    return sorted[0] ?? null
  }

  async getPendingProactive(userId: string): Promise<TriggerResult | null> {
    const pending = await this.getPendingProactiveEvent(userId)
    return pending?.trigger ?? null
  }

  async getPendingProactiveEvent(userId: string): Promise<PendingProactiveEvent | null> {
    const db = getDb()
    const pending = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          eq(events.eventType, "proactive"),
          sql`json_extract(${events.metadata}, '$.delivered') = 0`
        )
      )
      .orderBy(desc(events.createdAt))
      .limit(1)

    if (!pending.length) return null
    const meta = JSON.parse(pending[0].metadata ?? "{}")
    return {
      eventId: pending[0].id,
      trigger: { type: pending[0].title, priority: 5, data: meta },
      message: pending[0].description ?? "",
    }
  }

  async markDelivered(eventId: string) {
    const db = getDb()
    const existing = await db.select({ metadata: events.metadata }).from(events).where(eq(events.id, eventId)).limit(1)
    const prev = existing.length > 0 ? JSON.parse(existing[0].metadata ?? "{}") : {}
    await db
      .update(events)
      .set({ metadata: JSON.stringify({ ...prev, delivered: true }) })
      .where(eq(events.id, eventId))
  }

  private async checkNoTraining(userId: string): Promise<TriggerResult | null> {
    const db = getDb()
    const lastSession = await db
      .select({ date: trainingSessions.date })
      .from(trainingSessions)
      .where(eq(trainingSessions.userId, userId))
      .orderBy(desc(trainingSessions.date))
      .limit(1)

    if (!lastSession.length) {
      return { type: "no_training_never", priority: 4, data: {} }
    }

    const hoursSince = (Date.now() - new Date(lastSession[0].date).getTime()) / 3600000

    if (hoursSince > 120) {
      return { type: "no_training_5_days", priority: 8, data: { hoursSince } }
    }
    if (hoursSince > 72) {
      return { type: "no_training_3_days", priority: 6, data: { hoursSince } }
    }
    return null
  }

  private async checkConsistencyStreak(userId: string): Promise<TriggerResult | null> {
    const db = getDb()
    const sessions = await db
      .select({ date: trainingSessions.date })
      .from(trainingSessions)
      .where(eq(trainingSessions.userId, userId))
      .orderBy(desc(trainingSessions.date))
      .limit(10)

    if (sessions.length < 2) return null

    const dates = [...new Set(sessions.map(s => s.date))].sort().reverse()
    const streak = this.calculateStreak(dates)
    const milestones = [3, 5, 7, 14, 21, 30]

    for (const m of milestones) {
      if (streak >= m) {
        const key = `streak_${m}_${userId}`
        if (!sentStreaks.get(key)) {
          sentStreaks.set(key, true)
          return { type: "streak_milestone", priority: 7, data: { streak: m } }
        }
      }
    }
    return null
  }

  private async checkWeekStart(userId: string): Promise<TriggerResult | null> {
    const now = new Date()
    if (now.getDay() === 1 && now.getHours() >= 8 && now.getHours() <= 10) {
      return { type: "week_start", priority: 3, data: {} }
    }
    return null
  }

  private async checkRelationMilestone(userId: string): Promise<TriggerResult | null> {
    const db = getDb()
    const rel = await db.query.relationships.findFirst({
      where: eq(relationships.userId, userId),
    })
    if (!rel) return null

    const milestones = [2, 5, 10, 15, 20]
    for (const lv of milestones) {
      if (rel.level === lv) {
        return { type: "level_up", priority: 9, data: { level: lv } }
      }
    }
    return null
  }

  private calculateStreak(sortedDates: string[]): number {
    if (!sortedDates.length) return 0
    let streak = 1
    for (let i = 1; i < sortedDates.length; i++) {
      const diffDays = (new Date(sortedDates[i - 1]).getTime() - new Date(sortedDates[i]).getTime()) / 86400000
      if (diffDays <= 2) streak++
      else break
    }
    return streak
  }

  // 饭点 check：早 8-9、午 11-12、晚 17-18 触发，每天每顿最多一次
  private mealSent = new Map<string, boolean>()

  private async checkMealTime(userId: string): Promise<TriggerResult | null> {
    const hour = new Date().getHours()
    const isBreakfast = hour >= 8 && hour < 9
    const isLunch = hour >= 11 && hour < 12
    const isDinner = hour >= 17 && hour < 18

    if (!isBreakfast && !isLunch && !isDinner) return null

    const meal = isBreakfast ? "breakfast" : isLunch ? "lunch" : "dinner"
    const today = new Date().toDateString()
    const key = `${meal}_${today}_${userId}`
    if (this.mealSent.get(key)) return null
    this.mealSent.set(key, true)

    return { type: "meal_check", priority: 2, data: { meal } }
  }
}


