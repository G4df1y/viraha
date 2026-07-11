import { MemoryStore } from "./storage.js"
import type { EmbedProvider } from "@viraha/embedding"

interface ScoredMemory {
  id: string
  type: string
  key: string
  content: string
  metadata: Record<string, unknown>
  score: number
}

export class MemoryRanker {
  private store: MemoryStore
  private accessCounts = new Map<string, number>()
  private embedCache = new Map<string, number[]>()
  private embedProvider?: EmbedProvider

  constructor(store: MemoryStore) {
    this.store = store
  }

  setEmbedProvider(provider: EmbedProvider) {
    this.embedProvider = provider
  }

  async getTopMemories(userId: string, query?: string, limit = 15): Promise<ScoredMemory[]> {
    const all = await this.store.getEntries(userId)
    if (!all.length) return []

    // Compute query embedding if we have a provider and query
    let queryEmbed: number[] | null = null
    if (query && this.embedProvider) {
      try {
        const result = await this.embedProvider.embed([query])
        if (result.length) queryEmbed = result[0].embedding
      } catch { /* fallback to keyword */ }
    }

    const scored: ScoredMemory[] = await Promise.all(all.map(async entry => {
      const meta = entry.metadata
      const importance = (meta.importance as number) ?? 0.5
      const accessed = this.accessCounts.get(entry.id) ?? 0
      const ageDays = (Date.now() - new Date(entry.updatedAt).getTime()) / 86400000
      const recency = Math.exp(-ageDays / 30)

      // Hybrid score: keyword + vector
      let queryScore = query ? this.calculateQueryRelevance(query, entry.content, entry.key) : 0.3
      let vectorScore = 0

      if (queryEmbed && this.embedProvider) {
        try {
          let entryEmbed = this.embedCache.get(entry.id)
          if (!entryEmbed) {
            const result = await this.embedProvider.embed([entry.content.substring(0, 1000)])
            if (result.length) {
              entryEmbed = result[0].embedding
              this.embedCache.set(entry.id, entryEmbed)
            }
          }
          if (entryEmbed) {
            vectorScore = this.cosineSimilarity(queryEmbed, entryEmbed)
          }
        } catch { /* skip vector */ }
      }

      // Combine: 60% keyword/relevance + 40% vector
      const combinedQuery = queryScore * 0.6 + vectorScore * 0.4

      const score =
        importance * 0.35 +
        Math.min(accessed / 10, 1) * 0.1 +
        recency * 0.15 +
        combinedQuery * 0.4

      return { ...entry, score }
    }))

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  }

  recordAccess(entryId: string): void {
    const current = this.accessCounts.get(entryId) ?? 0
    this.accessCounts.set(entryId, current + 1)
  }

  getMemoryContext(userId: string, query?: string, limit?: number): Promise<string> {
    return this.store.getEntries(userId).then(all => {
      if (!all.length) return "No memories yet."

      const scored = all.map(entry => {
        const meta = entry.metadata
        const importance = (meta.importance as number) ?? 0.5
        const ageDays = (Date.now() - new Date(entry.updatedAt).getTime()) / 86400000
        const recency = Math.exp(-ageDays / 30)
        const queryScore = query ? this.calculateQueryRelevance(query, entry.content, entry.key) : 0.3
        const score = importance * 0.4 + recency * 0.2 + queryScore * 0.25
        return { ...entry, score }
      })

      const selected = scored.sort((a, b) => b.score - a.score).slice(0, limit ?? 15)
      return selected.map(e => `[${e.type}] ${e.key}: ${e.content}`).join("\n")
    })
  }

  private calculateQueryRelevance(query: string, content: string, key: string): number {
    const q = query.toLowerCase()
    const text = (content + " " + key).toLowerCase()
    const words = q.split(/\W+/).filter(w => w.length > 2)
    if (!words.length) return 0

    let matches = 0
    for (const word of words) {
      if (text.includes(word)) matches++
    }
    return matches / words.length
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dot += a[i] * b[i]
      magA += a[i] * a[i]
      magB += b[i] * b[i]
    }
    const mag = Math.sqrt(magA) * Math.sqrt(magB)
    return mag === 0 ? 0 : dot / mag
  }
}


