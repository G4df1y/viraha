import type { MemoryPort, CompanionPort, ContextPort, TurnInput } from "@viraha/core"
import type { MemoryEngine } from "@viraha/memory"
import type { CompanionEngine } from "@viraha/relationship"

export function createMemoryPort(memory: MemoryEngine): MemoryPort {
  return {
    getOrCreateUser: (extId, channel, name) => memory.profile.getOrCreateUser(extId, channel, name),
    getProfileSummary: (userId) => memory.getProfileSummary(userId),
    getMemorySummary: (userId) => memory.getMemorySummary(userId),
    getProfile: (userId) => memory.profile.getProfile(userId),
    storeMemory: (userId, type, key, content) =>
      memory.store.storeEntry(userId, type, key, content),
  }
}

export function createCompanionPort(companion: CompanionEngine): CompanionPort {
  return {
    getRelationshipState: (userId) => companion.relationship.getOrCreate(userId),
    getRelationshipSummary: (state) => companion.relationship.getRelationshipSummary(state),
    recordInteraction: (userId) => companion.relationship.recordInteraction(userId),
    addXp: (userId, amount) => companion.relationship.addXp(userId, amount),
  }
}

export function createContextPort(
  persona: string[],
  opts?: { knowledge?: (userId: string, input: string) => Promise<string> }
): ContextPort {
  return {
    assemble: async (userId, sessionId, input) => {
      return {
        tiers: { stable: persona, context: [], volatile: [], ephemeral: [] },
        systemPrompt: persona.join("\n"),
        tokenUsage: { total: 0, bySource: {} },
      }
    },
  }
}



