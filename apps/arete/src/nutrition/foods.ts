import fs from "fs"
import path from "path"

export interface FoodItem {
  name: string
  portion: string
  calories: number
  protein: number
  carbs: number
  fat: number
  category: string
}

let _cache: FoodItem[] | null = null

export function getFoodDatabase(): FoodItem[] {
  if (_cache) return _cache

  const jsonPath = path.join(process.cwd(), "..", "..", "knowledge-packs", "fitness-pack", "foods.json")
  _cache = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as FoodItem[]
  return _cache
}

export function searchFoods(query: string): FoodItem[] {
  const q = query.toLowerCase()
  return getFoodDatabase().filter(f =>
    f.name.toLowerCase().includes(q) || f.category.includes(q)
  ).slice(0, 10)
}

export function estimateCalories(mealDescription: string): FoodItem[] {
  const words = mealDescription.toLowerCase().split(/\s+/)
  return getFoodDatabase().filter(f => {
    const name = f.name.toLowerCase()
    return words.some(w => name.includes(w) || f.category === w)
  }).slice(0, 10)
}

