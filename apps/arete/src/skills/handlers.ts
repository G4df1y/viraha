import { getDb } from "@viraha/db"
import { trainingSessions, foodLogs } from "@viraha/db"
import { evaluateMathExpression } from "@viraha/core"
import { eq, desc } from "drizzle-orm"
import crypto from "crypto"
import type { SkillHandler } from "@viraha/skills"

export const workoutCoachHandler: SkillHandler = async (input, ctx) => {
  const action = String(input.action ?? "")
  const userId = ctx.userId

  if (!userId) return { content: "No user context available." }

  if (action === "log") {
    const db = getDb()
    const id = crypto.randomUUID()
    await db.insert(trainingSessions).values({
      id, userId, date: new Date().toISOString().split("T")[0],
      exercises: JSON.stringify(input.exercises ?? []), durationMinutes: input.duration as number ?? undefined,
      createdAt: new Date().toISOString(),
    } as any)
    return { content: "Workout logged successfully.", data: { sessionId: id } }
  }

  if (action === "history") {
    const db = getDb()
    const sessions = await db.select().from(trainingSessions)
      .where(eq(trainingSessions.userId, userId))
      .orderBy(desc(trainingSessions.date))
      .limit(5)
    return { content: `Recent workouts: ${sessions.length}`, data: { sessions } }
  }

  return { content: "I can help you log workouts, query exercises, and create training plans. What would you like to do?" }
}

export const nutritionCoachHandler: SkillHandler = async (input, ctx) => {
  const action = String(input.action ?? "")
  const userId = ctx.userId

  if (!userId) return { content: "No user context." }

  if (action === "log") {
    const db = getDb()
    const id = crypto.randomUUID()
    const foods = input.foods as any[] ?? []
    const totals = foods.reduce((acc, f) => ({
      calories: acc.calories + (f.calories ?? 0),
      protein: acc.protein + (f.protein ?? 0),
      carbs: acc.carbs + (f.carbs ?? 0),
      fat: acc.fat + (f.fat ?? 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 })

    await db.insert(foodLogs).values({
      id, userId, date: new Date().toISOString().split("T")[0],
      mealType: String(input.mealType ?? "snack"), foods: JSON.stringify(foods),
      totalCalories: totals.calories, totalProtein: totals.protein,
      totalCarbs: totals.carbs, totalFat: totals.fat,
      createdAt: new Date().toISOString(),
    } as any)
    return { content: `Meal logged: ${Math.round(totals.calories)} calories.`, data: { logId: id } }
  }

  return { content: "I can help you log meals, track macros, and get nutrition advice. What would you like?" }
}

export const progressAnalysisHandler: SkillHandler = async (_input, ctx) => {
  const userId = ctx.userId
  if (!userId) return { content: "No user context." }

  try {
    const db = getDb()
    const sessions = await db.select({ date: trainingSessions.date, ex: trainingSessions.exercises })
      .from(trainingSessions).where(eq(trainingSessions.userId, userId))
      .orderBy(desc(trainingSessions.date)).limit(20)

    const meals = await db.select({ date: foodLogs.date, cal: foodLogs.totalCalories })
      .from(foodLogs).where(eq(foodLogs.userId, userId))
      .orderBy(desc(foodLogs.date)).limit(20)

    const workoutCount = sessions.length
    const mealCount = meals.length

    return {
      content: `Progress summary:\n- Workouts logged: ${workoutCount}\n- Meals logged: ${mealCount}`,
      data: { workouts: workoutCount, meals: mealCount },
    }
  } catch {
    return { content: "Unable to retrieve progress data.", isError: true }
  }
}

export const searchHandler: SkillHandler = async (input) => {
  const query = String(input.query ?? input.expression ?? "")
  if (!query) return { content: "What would you like to search for?" }

  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`)
    const data: any = await res.json()
    const parts: string[] = []
    if (data.AbstractText) parts.push(data.AbstractText)
    if (data.RelatedTopics?.length) {
      data.RelatedTopics.slice(0, 4).forEach((t: any) => {
        if (t.Text) parts.push(t.Text)
        if (t.Topics) t.Topics.slice(0, 2).forEach((st: any) => { if (st.Text) parts.push(st.Text) })
      })
    }
    return { content: parts.length ? parts.join("\n\n") : "No results found." }
  } catch (err: any) {
    return { content: `Search error: ${err.message}`, isError: true }
  }
}

export const calculatorHandler: SkillHandler = async (input) => {
  const expr = String(input.expression ?? input.query ?? "")
  if (!expr) return { content: "Please provide an expression." }
  try {
    const result = evaluateMathExpression(expr)
    return { content: `= ${result}`, data: { result } }
  } catch {
    return { content: `Invalid expression: "${expr}". Use basic math operators.`, isError: true }
  }
}
