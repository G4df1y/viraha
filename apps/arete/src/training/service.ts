import { getDb } from "@viraha/db"
import { trainingPlans, trainingSessions, goals } from "@viraha/db"
import { eq, desc } from "drizzle-orm"
import crypto from "crypto"

export class TrainingService {
  async createPlan(userId: string, name: string, splitType: string, daysPerWeek: number): Promise<string> {
    const db = getDb()
    const id = crypto.randomUUID()
    await db.insert(trainingPlans).values({
      id,
      userId,
      name,
      splitType,
      daysPerWeek,
      sessionsPerWeek: daysPerWeek,
      startedAt: new Date().toISOString(),
    })
    return id
  }

  async logSession(userId: string, planId: string | null, date: string, exercises: string, durationMinutes?: number, notes?: string): Promise<string> {
    const db = getDb()
    const id = crypto.randomUUID()
    await db.insert(trainingSessions).values({
      id,
      planId,
      userId,
      date,
      exercises,
      durationMinutes,
      notes,
      createdAt: new Date().toISOString(),
    })
    return id
  }

  async getRecentSessions(userId: string, limit = 10) {
    const db = getDb()
    return await db
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.userId, userId))
      .orderBy(desc(trainingSessions.date))
      .limit(limit)
  }

  async getActivePlan(userId: string) {
    const db = getDb()
    return await db.query.trainingPlans.findFirst({
      where: (p, { eq, and }) => and(eq(p.userId, userId), eq(p.status, "active")),
    })
  }

  async setGoal(userId: string, title: string, category: string, target?: number): Promise<string> {
    const db = getDb()
    const id = crypto.randomUUID()
    await db.insert(goals).values({
      id,
      userId,
      title,
      category,
      target: target ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    return id
  }

  async getGoalSummary(userId: string): Promise<string> {
    const db = getDb()
    const activeGoals = await db
      .select()
      .from(goals)
      .where(eq(goals.userId, userId))

    if (!activeGoals.length) return "No active goals."
    return activeGoals.map(g =>
      `${g.title} (${g.category})${g.target ? ` - ${g.current}/${g.target}` : ""}`
    ).join("\n")
  }
}


