import type { ToolDefinition } from "@viraha/provider"
import { TrainingService } from "./service.js"
import { findExercises } from "./exercises.js"

export interface ToolContext {
  userId: string
  training: TrainingService
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>

export interface RegisteredTool {
  definition: ToolDefinition
  handler: ToolHandler
}

export function createTrainingTools(): RegisteredTool[] {
  return [
    {
      definition: {
        name: "log_training_session",
        description: "Log a completed training session with exercises, sets, reps, and weights",
        inputSchema: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date of session (YYYY-MM-DD)" },
            duration_minutes: { type: "number", description: "Session duration in minutes" },
            exercises: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  sets: { type: "number" },
                  reps: { type: "number" },
                  weight_kg: { type: "number" },
                },
              },
            },
            notes: { type: "string" },
          },
          required: ["date", "exercises"],
        },
      },
      handler: async (args, ctx) => {
        const plan = await ctx.training.getActivePlan(ctx.userId)
        const planId = plan?.id ?? null
        const sessionId = await ctx.training.logSession(
          ctx.userId,
          planId,
          args.date as string,
          JSON.stringify(args.exercises),
          args.duration_minutes as number | undefined,
          args.notes as string | undefined,
        )
        return `Session logged (${sessionId}) with ${(args.exercises as Array<unknown>).length} exercises.`
      },
    },
    {
      definition: {
        name: "query_exercises",
        description: "Search the exercise library by muscle group, equipment, or difficulty",
        inputSchema: {
          type: "object",
          properties: {
            muscle_group: {
              type: "string",
              enum: ["chest", "back", "legs", "shoulders", "arms", "core", "cardio"],
              description: "Target muscle group",
            },
            equipment: {
              type: "string",
              enum: ["bodyweight", "dumbbells", "barbell", "cable", "machine"],
              description: "Available equipment",
            },
            difficulty: {
              type: "string",
              enum: ["beginner", "intermediate", "advanced"],
              description: "Skill level",
            },
          },
        },
      },
      handler: async (args, _ctx) => {
        const results = findExercises({
          muscleGroup: args.muscle_group as string | undefined,
          equipment: args.equipment as string | undefined,
          difficulty: args.difficulty as string | undefined,
        })

        if (results.length === 0) return "No exercises found for those criteria."

        const grouped = results.slice(0, 15).map(e =>
          `- ${e.name} (${e.difficulty}, ${e.equipment}): ${e.primaryMuscles.join(", ")}`
        ).join("\n")

        return `Exercises found (${results.length}):\n${grouped}`
      },
    },
    {
      definition: {
        name: "create_training_plan",
        description: "Create a new training plan with specified split type",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Plan name" },
            split_type: {
              type: "string",
              enum: ["ppl", "upper_lower", "phul", "phat", "full_body"],
              description: "Training split type",
            },
            days_per_week: { type: "number", description: "Training days per week" },
          },
          required: ["name", "split_type", "days_per_week"],
        },
      },
      handler: async (args, ctx) => {
        const planId = await ctx.training.createPlan(
          ctx.userId,
          args.name as string,
          args.split_type as string,
          args.days_per_week as number,
        )
        return `Training plan created (${planId}): ${args.name} (${args.split_type}, ${args.days_per_week}x/week)`
      },
    },
    {
      definition: {
        name: "get_recent_workouts",
        description: "Get the user's recent training sessions",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Number of recent sessions to show (default 5)" },
          },
        },
      },
      handler: async (args, ctx) => {
        const sessions = await ctx.training.getRecentSessions(ctx.userId, (args.limit as number) ?? 5)
        if (sessions.length === 0) return "No training sessions logged yet."

        return sessions.map(s =>
          `${s.date} - ${s.name ?? "Workout"} (${s.durationMinutes ?? "?"}min)`
        ).join("\n")
      },
    },
    {
      definition: {
        name: "set_fitness_goal",
        description: "Set a new fitness goal for the user",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Goal title (e.g. Lose 5kg, Bench 80kg)" },
            category: {
              type: "string",
              enum: ["fat_loss", "muscle_gain", "strength", "endurance", "habit"],
              description: "Goal category",
            },
            target: { type: "number", description: "Target value (kg, reps, etc.)" },
          },
          required: ["title", "category"],
        },
      },
      handler: async (args, ctx) => {
        const goalId = await ctx.training.setGoal(
          ctx.userId,
          args.title as string,
          args.category as string,
          args.target as number | undefined,
        )
        return `Goal set: ${args.title} (id: ${goalId})`
      },
    },
  ]
}


