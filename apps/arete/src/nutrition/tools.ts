import type { ToolDefinition } from "@viraha/provider"
import { NutritionService } from "./service.js"
import { searchFoods } from "./foods.js"

export interface ToolContext {
  userId: string
  nutrition: NutritionService
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>

export interface RegisteredTool {
  definition: ToolDefinition
  handler: ToolHandler
}

export function createNutritionTools(): RegisteredTool[] {
  return [
    {
      definition: {
        name: "log_food",
        description: "Log a meal with foods eaten, including estimated calories and macros",
        inputSchema: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date (YYYY-MM-DD)" },
            meal_type: {
              type: "string",
              enum: ["breakfast", "lunch", "dinner", "snack"],
              description: "Which meal",
            },
            foods: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Food name" },
                  amount: { type: "string", description: "Portion description" },
                  calories: { type: "number" },
                  protein: { type: "number", description: "Protein in grams" },
                  carbs: { type: "number", description: "Carbs in grams" },
                  fat: { type: "number", description: "Fat in grams" },
                },
              },
              description: "List of foods eaten in this meal",
            },
          },
          required: ["date", "meal_type", "foods"],
        },
      },
      handler: async (args, ctx) => {
        const logId = await ctx.nutrition.logFood(
          ctx.userId,
          args.date as string,
          args.meal_type as string,
          args.foods as any[],
        )
        return `Meal logged (${logId}): ${args.meal_type} with ${(args.foods as any[]).length} items.`
      },
    },
    {
      definition: {
        name: "search_food",
        description: "Search the food database for nutrition info of a specific food",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Food name to search" },
          },
          required: ["query"],
        },
      },
      handler: async (args, _ctx) => {
        const results = searchFoods(args.query as string)
        if (!results.length) return "No foods found. Describe the food and I'll estimate."

        return results.map(f =>
          `${f.name} (${f.portion}): ${f.calories}cal, P${f.protein}g C${f.carbs}g F${f.fat}g`
        ).join("\n")
      },
    },
    {
      definition: {
        name: "get_daily_nutrition",
        description: "Get the nutrition summary for a specific day",
        inputSchema: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date (YYYY-MM-DD)" },
          },
          required: ["date"],
        },
      },
      handler: async (args, ctx) => {
        const summary = await ctx.nutrition.getDailySummary(
          ctx.userId,
          args.date as string,
        )
        if (!summary) return "No food logged for this date."

        return [
          `Daily Nutrition (${args.date})`,
          `Calories: ${summary.totalCalories.toFixed(0)}`,
          `Protein: ${summary.totalProtein.toFixed(0)}g`,
          `Carbs: ${summary.totalCarbs.toFixed(0)}g`,
          `Fat: ${summary.totalFat.toFixed(0)}g`,
          `Meals logged: ${summary.meals}`,
        ].join("\n")
      },
    },
  ]
}


