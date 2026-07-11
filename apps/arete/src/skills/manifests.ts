import type { SkillManifest, SkillHandler } from "@viraha/skills"

export const workoutCoachManifest: SkillManifest = {
  id: "workout-coach",
  name: "Workout Coach",
  version: "1.0.0",
  description: "Log a workout session (action=\"log\" with exercises array) or query recent workout history (action=\"history\"). Call this when the user wants to record, save, or review training sessions.",
  triggers: {
    intentTypes: ["command", "query", "plan", "analyze"],
    keywords: ["workout", "train", "exercise", "bench", "squat", "deadlift", "gym", "reps", "sets", "muscle"],
    entities: ["exercises", "workout"],
  },
  capabilities: {
    input: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["log", "history"], description: "What to do: \"log\" to record a workout, \"history\" to list recent workouts" },
        exercises: { type: "array", items: { type: "object", properties: { name: { type: "string" }, sets: { type: "number" }, reps: { type: "number" }, weight: { type: "number" } } }, description: "Exercises performed (for action=\"log\")" },
        duration: { type: "number", description: "Duration in minutes (for action=\"log\")" },
      },
      required: ["action"],
    },
    output: { type: "object", properties: { result: { type: "string" } } },
    examples: [
      { query: "Log my workout: bench press 3x10 @ 60kg", response: "Logged!" },
      { query: "What exercises for chest?", response: "Here are some chest exercises..." },
    ],
  },
  dependencies: {},
  limits: { maxRuntime: 3 },
}

export const nutritionCoachManifest: SkillManifest = {
  id: "nutrition-coach",
  name: "Nutrition Coach",
  version: "1.0.0",
  description: "Log a meal to the food diary (action=\"log\" with foods array and mealType). Call this when the user wants to record, save, or log what they ate (breakfast/lunch/dinner/snack).",
  triggers: {
    intentTypes: ["command", "query", "analyze"],
    keywords: ["eat", "food", "meal", "diet", "calorie", "protein", "nutrition", "macro", "breakfast", "lunch", "dinner", "snack"],
    entities: ["foods", "meal"],
  },
  capabilities: {
    input: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["log"], description: "Use \"log\" to record a meal" },
        mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"], description: "Which meal this is" },
        foods: {
          type: "array",
          items: { type: "object", properties: { name: { type: "string" }, calories: { type: "number" }, protein: { type: "number" }, carbs: { type: "number" }, fat: { type: "number" } } },
          description: "Foods eaten, each with name and optional macro values",
        },
      },
      required: ["action", "mealType", "foods"],
    },
    output: { type: "object", properties: { result: { type: "string" } } },
    examples: [
      { query: "I ate chicken and rice for lunch", response: "Logged! That's about 500 calories." },
      { query: "How much protein do I need?", response: "About 160g per day at your weight." },
    ],
  },
  dependencies: {},
  limits: { maxRuntime: 3 },
}

export const progressAnalysisManifest: SkillManifest = {
  id: "progress-analysis",
  name: "Progress Analysis",
  version: "1.0.0",
  description: "Analyze training trends, nutrition patterns, and overall progress",
  triggers: {
    intentTypes: ["analyze", "query", "reflect"],
    keywords: ["progress", "trend", "analysis", "compare", "plateau", "stuck", "no progress", "improve", "how am i doing"],
    entities: [],
  },
  capabilities: {
    input: { type: "object", properties: { action: { type: "string" } } },
    output: { type: "object", properties: { result: { type: "string" } } },
    examples: [
      { query: "Why am I not making progress?", response: "Let me check your recent training and nutrition..." },
    ],
  },
  dependencies: { skills: ["workout-coach", "nutrition-coach"] },
  limits: { maxRuntime: 5 },
}

export const searchManifest: SkillManifest = {
  id: "search",
  name: "Web Search",
  version: "1.0.0",
  description: "Search the internet for current information",
  triggers: {
    intentTypes: ["query", "learn"],
    keywords: ["search", "find", "look up", "google", "what is", "who is", "latest", "news", "weather", "today"],
    entities: [],
  },
  capabilities: {
    input: { type: "object", properties: { query: { type: "string" } } },
    output: { type: "object", properties: { result: { type: "string" } } },
    examples: [
      { query: "Search for latest fitness research", response: "Here's what I found..." },
    ],
  },
  dependencies: {},
  limits: { maxRuntime: 2 },
}

export const calculatorManifest: SkillManifest = {
  id: "calculator",
  name: "Calculator",
  version: "1.0.0",
  description: "Perform mathematical calculations",
  triggers: {
    intentTypes: ["query"],
    keywords: ["calculate", "math", "plus", "minus", "times", "divided", "percentage", "convert", "what is"],
    entities: [],
  },
  capabilities: {
    input: { type: "object", properties: { expression: { type: "string" } } },
    output: { type: "object", properties: { result: { type: "string" } } },
    examples: [
      { query: "What's 15% of 200?", response: "30" },
    ],
  },
  dependencies: {},
  limits: { maxRuntime: 1 },
}
