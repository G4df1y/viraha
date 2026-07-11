import type { ContextCollector, ContextBuilderConfig, CollectorContext, CollectorResult } from "./types.js"
import { estimateTokens, createBudget, enforceBudget } from "./token-budget.js"

const DEFAULT_CONFIG: ContextBuilderConfig = {
  maxTokens: 24000,
  budget: {
    systemPrompt: 15,
    profile: 5,
    memories: 20,
    knowledge: 10,
    relationship: 5,
    workflow: 5,
    history: 40,
  },
}

export class ContextBuilder {
  private collectors: ContextCollector[] = []
  private config: ContextBuilderConfig
  private cache = new Map<string, { result: CollectorResult; expiresAt: number }>()

  constructor(config?: Partial<ContextBuilderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config, budget: { ...DEFAULT_CONFIG.budget, ...config?.budget } }
  }

  addCollector(collector: ContextCollector): void {
    this.collectors.push(collector)
    this.collectors.sort((a, b) => b.priority - a.priority)
  }

  async assemble(userId: string, sessionId: string, input: string): Promise<{
    tiers: { stable: string[]; context: string[]; volatile: string[]; ephemeral: string[] }
    systemPrompt: string
    tokenUsage: { total: number; bySource: Record<string, number> }
  }> {
    const budget = createBudget(this.config.maxTokens, this.config.budget)
    const ctx: CollectorContext = {
      userId,
      sessionId,
      input,
      remainingBudget: budget.remaining,
    }

    const results: { collector: string; result: CollectorResult }[] = []
    const tiers: { stable: string[]; context: string[]; volatile: string[]; ephemeral: string[] } = {
      stable: [], context: [], volatile: [], ephemeral: [],
    }

    for (const collector of this.collectors) {
      const cacheKey = `${collector.name}:${userId}`
      const cached = this.cache.get(cacheKey)
      let result: CollectorResult

      if (cached && cached.expiresAt > Date.now()) {
        result = cached.result
      } else {
        result = await collector.collect(ctx)
        if (result.cacheKey) {
          this.cache.set(cacheKey, { result, expiresAt: Date.now() + 60000 })
        }
      }

      results.push({ collector: collector.name, result })
      const tier = this.getTierForCollector(collector.name) as keyof typeof tiers | null
      if (tier && result.content) {
        tiers[tier].push(result.content)
      }
    }

    // Enforce token budget: trim volatile and ephemeral tiers if over limit.
    const stableText = tiers.stable.join("\n\n")
    const contextText = tiers.context.join("\n\n")
    let volatileText = tiers.volatile.join("\n\n")
    let ephemeralText = tiers.ephemeral.join("\n\n")

    const totalTokens = estimateTokens(stableText) + estimateTokens(contextText) + estimateTokens(volatileText) + estimateTokens(ephemeralText)

    if (totalTokens > this.config.maxTokens) {
      // First, trim volatile tier
      const volatileBudget = Math.floor(this.config.maxTokens * (this.config.budget.memories / 100))
      const trimmedVolatile = enforceBudget(volatileText, volatileBudget)
      volatileText = trimmedVolatile.trimmed

      // If still over, trim history
      const remaining = this.config.maxTokens - estimateTokens(stableText) - estimateTokens(contextText) - estimateTokens(volatileText)
      if (estimateTokens(ephemeralText) > remaining) {
        const trimmedEphemeral = enforceBudget(ephemeralText, remaining)
        ephemeralText = trimmedEphemeral.trimmed
      }
    }

    const systemPrompt = [stableText, contextText, volatileText].join("\n\n")

    const bySource: Record<string, number> = {}
    for (const r of results) {
      bySource[r.collector] = r.result.tokens
    }

    return {
      tiers: {
        stable: [stableText],
        context: [contextText],
        volatile: [volatileText],
        ephemeral: [ephemeralText],
      },
      systemPrompt,
      tokenUsage: { total: estimateTokens(systemPrompt), bySource },
    }
  }

  invalidateCache(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.endsWith(`:${userId}`)) this.cache.delete(key)
    }
  }

  private getTierForCollector(name: string): "stable" | "context" | "volatile" | "ephemeral" | null {
    const map: Record<string, "stable" | "context" | "volatile" | "ephemeral"> = {
      system_prompt: "stable",
      persona: "stable",
      profile: "context",
      relationship: "context",
      workflow: "context",
      memories: "volatile",
      knowledge: "volatile",
      history: "ephemeral",
    }
    return map[name] ?? null
  }
}

