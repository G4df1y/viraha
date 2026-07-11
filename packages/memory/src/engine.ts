import { ProfileManager } from "./profile.js"
import { MemoryStore } from "./storage.js"
import { MemoryRanker } from "./ranking.js"

export class MemoryEngine {
  public profile = new ProfileManager()
  public store = new MemoryStore()
  public ranker = new MemoryRanker(this.store)

  async getProfileSummary(userId: string): Promise<string> {
    const profile = await this.profile.getProfile(userId)
    if (!profile) return "No profile data."

    const parts: string[] = []
    if (profile.goal) parts.push(`Goal: ${profile.goal}`)
    if (profile.experience) parts.push(`Experience: ${profile.experience}`)
    if (profile.age) parts.push(`Age: ${profile.age}`)
    if (profile.heightCm && profile.weightKg) parts.push(`Height: ${profile.heightCm}cm, Weight: ${profile.weightKg}kg`)
    if (profile.availableMinutes) parts.push(`Available time: ${profile.availableMinutes} minutes`)

    const equipment = profile.equipment as string[]
    if (equipment.length) parts.push(`Equipment: ${equipment.join(", ")}`)

    const injuries = profile.injuries as string[]
    if (injuries.length) parts.push(`Injuries/limitations: ${injuries.join(", ")}`)

    const preferences = profile.preferences as Record<string, unknown>
    if (Object.keys(preferences).length) {
      parts.push(`Preferences: ${JSON.stringify(preferences)}`)
    }

    return parts.length ? parts.join("\n") : "No profile data."
  }

  async getMemorySummary(userId: string, query?: string, limit?: number): Promise<string> {
    return this.ranker.getMemoryContext(userId, query, limit)
  }

  async buildMemoryContext(userId: string, query?: string): Promise<string> {
    const profile = await this.getProfileSummary(userId)
    const top = await this.ranker.getTopMemories(userId, query, 15)
    const memories = top.map(e => `[${e.type}] ${e.key}: ${e.content}`).join("\n") || "No memories yet."

    return [
      "=== USER PROFILE ===",
      profile,
      "",
      "=== RELEVANT MEMORIES ===",
      memories,
    ].join("\n")
  }
}

