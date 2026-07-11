import { getDb } from "@viraha/db"
import { foodLogs } from "@viraha/db"
import { eq, desc, sum } from "drizzle-orm"
import crypto from "crypto"

export interface FoodEntry {
  name: string
  amount: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface MealSummary {
  meals: number
  totalCalories: number
  totalProtein: number
  totalCarbs: number
  totalFat: number
}

export class NutritionService {
  async logFood(
    userId: string,
    date: string,
    mealType: string,
    foods: FoodEntry[],
  ): Promise<string> {
    const db = getDb()
    const id = crypto.randomUUID()

    const totals = foods.reduce(
      (acc, f) => ({
        calories: acc.calories + f.calories,
        protein: acc.protein + f.protein,
        carbs: acc.carbs + f.carbs,
        fat: acc.fat + f.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )

    await db.insert(foodLogs).values({
      id,
      userId,
      date,
      mealType,
      foods: JSON.stringify(foods),
      totalCalories: totals.calories,
      totalProtein: totals.protein,
      totalCarbs: totals.carbs,
      totalFat: totals.fat,
      createdAt: new Date().toISOString(),
    })

    return id
  }

  async getDailySummary(userId: string, date: string): Promise<MealSummary | null> {
    const db = getDb()
    const logs = await db
      .select()
      .from(foodLogs)
      .where(eq(foodLogs.userId, userId))

    const dayLogs = logs.filter(l => l.date === date)
    if (!dayLogs.length) return null

    return {
      meals: dayLogs.length,
      totalCalories: dayLogs.reduce((s, l) => s + (l.totalCalories ?? 0), 0),
      totalProtein: dayLogs.reduce((s, l) => s + (l.totalProtein ?? 0), 0),
      totalCarbs: dayLogs.reduce((s, l) => s + (l.totalCarbs ?? 0), 0),
      totalFat: dayLogs.reduce((s, l) => s + (l.totalFat ?? 0), 0),
    }
  }

  async getRecentFoods(userId: string, limit = 5) {
    const db = getDb()
    return await db
      .select()
      .from(foodLogs)
      .where(eq(foodLogs.userId, userId))
      .orderBy(desc(foodLogs.createdAt))
      .limit(limit)
  }
}


