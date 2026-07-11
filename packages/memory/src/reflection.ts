import type { LLMProvider } from "@viraha/provider"
import { z } from "zod"
import { ProfileManager } from "./profile.js"
import { MemoryStore } from "./storage.js"

const EXTRACTION_PROMPT = `You are a memory extraction system for a fitness companion. 
Given the conversation below, extract structured information about the user.

Return ONLY a valid JSON object with these fields (null if not found):

{
  "profile": {
    "age": number | null,
    "heightCm": number | null,
    "weightKg": number | null,
    "goal": string | null,
    "experience": string | null,
    "equipment": string[] | null,
    "injuries": string[] | null,
    "availableMinutes": number | null
  },
  "facts": [
    { "key": "unique_key_name", "content": "what to remember about the user" }
  ],
  "emotion": {
    "mood": "happy" | "sad" | "frustrated" | "tired" | "motivated" | "neutral" | null,
    "intensity": number (1-10) | null,
    "context": string | null
  }
}

Rules:
- Only extract EXPLICITLY stated information. Do not guess.
- Facts should be concise, specific, and useful for future conversations.
- For profile, only include fields where the user explicitly provided new data.
- If nothing new was learned, set all fields to null.`

export interface ExtractionResult {
  profile: {
    age?: number | null
    heightCm?: number | null
    weightKg?: number | null
    goal?: string | null
    experience?: string | null
    equipment?: string[] | null
    injuries?: string[] | null
    availableMinutes?: number | null
  }
  facts: Array<{ key: string; content: string }>
  emotion: {
    mood: string | null
    intensity: number | null
    context: string | null
  }
}

const extractionSchema = z.object({
  profile: z.object({
    age: z.number().nullable().optional(),
    heightCm: z.number().nullable().optional(),
    weightKg: z.number().nullable().optional(),
    goal: z.string().nullable().optional(),
    experience: z.string().nullable().optional(),
    equipment: z.array(z.string()).nullable().optional(),
    injuries: z.array(z.string()).nullable().optional(),
    availableMinutes: z.number().nullable().optional(),
  }).optional().default({}),
  facts: z.array(z.object({
    key: z.string(),
    content: z.union([z.string(), z.unknown()]),
  })).optional().default([]),
  emotion: z.object({
    mood: z.string().nullable().optional(),
    intensity: z.number().nullable().optional(),
    context: z.string().nullable().optional(),
  }).optional().default({}),
})

export class ReflectionEngine {
  private profile: ProfileManager
  private store: MemoryStore

  constructor(profile: ProfileManager, store: MemoryStore) {
    this.profile = profile
    this.store = store
  }

  async reflect(
    userId: string,
    userMessage: string,
    assistantReply: string,
    llm: LLMProvider,
    model: string,
  ): Promise<void> {
    try {
      const result = await this.extract(userMessage, assistantReply, llm, model)
      if (!result) return

      try { await this.applyProfile(userId, result.profile) } catch (e: any) { console.error("[Reflection] profile:", e.message) }
      try { await this.applyFacts(userId, result.facts) } catch (e: any) { console.error("[Reflection] facts:", e.message) }
      try { await this.applyEmotion(userId, result.emotion) } catch (e: any) { console.error("[Reflection] emotion:", e.message) }
    } catch (err) {
      console.error("[Reflection] Error:", err instanceof Error ? err.message : err)
    }
  }

  private async extract(
    userMessage: string,
    assistantReply: string,
    llm: LLMProvider,
    model: string,
  ): Promise<ExtractionResult | null> {
    const conversation = [
      `USER: ${userMessage}`,
      `ASSISTANT: ${assistantReply}`,
    ].join("\n")

    const response = await llm.chat({
      model,
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: conversation },
      ],
      temperature: 0.1,
      maxTokens: 1000,
    })

    const jsonStr = this.extractJson(response.content)
    if (!jsonStr) return null

    try {
      return extractionSchema.parse(JSON.parse(jsonStr)) as ExtractionResult
    } catch (e) {
      console.error("[Reflection] schema validation failed:", e instanceof Error ? e.message : e)
      return null
    }
  }

  private extractJson(text: string): string | null {
    const match = text.match(/\{[\s\S]*\}/)
    return match ? match[0] : null
  }

  private async applyProfile(userId: string, profileData: ExtractionResult["profile"]): Promise<void> {
    const updates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(profileData)) {
      if (value !== null && value !== undefined) {
        // Array fields (equipment, injuries) need JSON encoding
        updates[key] = Array.isArray(value) ? JSON.stringify(value) : value
      }
    }
    if (Object.keys(updates).length > 0) {
      await this.profile.updateProfile(userId, updates)
    }
  }

  private async applyFacts(userId: string, facts: ExtractionResult["facts"]): Promise<void> {
    if (!facts || facts.length === 0) return

    for (const fact of facts) {
      if (fact.key && fact.content) {
        const content = typeof fact.content === "string" ? fact.content : JSON.stringify(fact.content)
        await this.store.storeEntry(userId, "long_term", fact.key, content)
      }
    }
  }

  private async applyEmotion(userId: string, emotion: ExtractionResult["emotion"]): Promise<void> {
    if (!emotion || !emotion.mood) return
    if (emotion.mood === "neutral" && !emotion.context) return

    await this.store.storeEntry(userId, "emotional", `mood_${Date.now()}`, JSON.stringify({
      mood: emotion.mood,
      intensity: emotion.intensity ?? 5,
      context: emotion.context ?? "from conversation",
    }))
  }
}


