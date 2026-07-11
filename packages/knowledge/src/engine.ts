import { KnowledgeLoader, type KnowledgeChunk } from "./loader.js"
import type { EmbedProvider } from "@viraha/embedding"

export interface KnowledgeQuery {
  query: string
  packName?: string
  maxResults?: number
}

export class KnowledgeEngine {
  private loader = new KnowledgeLoader()
  private embeddingCache = new Map<string, number[]>()

  loadPack(packPath: string, packName: string) {
    return this.loader.loadPack(packPath, packName)
  }

  listPacks(): string[] {
    return this.loader.listPacks()
  }

  async search(query: KnowledgeQuery, embedProvider?: EmbedProvider): Promise<KnowledgeChunk[]> {
    const { query: queryText, packName, maxResults = 3 } = query
    const allChunks = packName
      ? this.loader.getChunks(packName)
      : this.loader.listPacks().flatMap(p => this.loader.getChunks(p))

    if (allChunks.length === 0) return []

    // Try semantic search if embedding provider is available
    if (embedProvider) {
      try {
        return await this.semanticSearch(queryText, allChunks, embedProvider, maxResults)
      } catch {
        // Fall through to keyword search
      }
    }

    // Fallback: keyword search with relevance scoring
    return this.keywordSearch(queryText, allChunks, maxResults)
  }

  async buildKnowledgeContext(userId: string, query: string, embedProvider?: EmbedProvider): Promise<string> {
    const results = await this.search({ query, maxResults: 4 }, embedProvider)
    if (results.length === 0) return ""

    const sections = results.map(r =>
      `## ${r.heading} (from ${r.sourceFile.replace(".md", "")})\n${r.content}`
    )

    return [
      "=== RELEVANT KNOWLEDGE ===",
      ...sections,
      "=========================",
    ].join("\n\n")
  }

  private async semanticSearch(query: string, chunks: KnowledgeChunk[], provider: EmbedProvider, maxResults: number): Promise<KnowledgeChunk[]> {
    const queryEmbed = await provider.embed([query])
    if (!queryEmbed.length) return this.keywordSearch(query, chunks, maxResults)

    const qVec = queryEmbed[0].embedding

    const scored = await Promise.all(
      chunks.map(async (chunk) => {
        let cacheKey = `${chunk.packName}:${chunk.sourceFile}:${chunk.heading}`
        let chunkEmbed = this.embeddingCache.get(cacheKey)

        if (!chunkEmbed) {
          try {
            const result = await provider.embed([chunk.content.substring(0, 2000)])
            if (result.length) {
              chunkEmbed = result[0].embedding
              this.embeddingCache.set(cacheKey, chunkEmbed)
            }
          } catch {
            return { chunk, score: this.calculateKeywordScore(query, chunk) }
          }
        }

        const score = chunkEmbed ? this.cosineSimilarity(qVec, chunkEmbed) : this.calculateKeywordScore(query, chunk)
        return { chunk, score }
      })
    )

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(s => s.chunk)
  }

  private keywordSearch(query: string, chunks: KnowledgeChunk[], maxResults: number): KnowledgeChunk[] {
    const scored = chunks.map(chunk => ({
      chunk,
      score: this.calculateKeywordScore(query, chunk),
    }))

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(s => s.chunk)
  }

  private calculateKeywordScore(query: string, chunk: KnowledgeChunk): number {
    const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 2)
    if (queryWords.length === 0) return 0

    let score = 0
    const content = (chunk.content + " " + chunk.heading).toLowerCase()

    for (const word of queryWords) {
      if (chunk.keywords.includes(word)) score += 2
      if (content.includes(word)) score += 1
    }

    // Bonus for heading match
    if (chunk.heading.toLowerCase().includes(query.toLowerCase())) score += 5

    return score / queryWords.length
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


