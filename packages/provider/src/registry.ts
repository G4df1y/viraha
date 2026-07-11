import type { LLMProvider, ModelInfo } from "./types.js"

interface ModelEntry {
  model: string
  providerName: string
  priority: number  // lower = higher priority
}

interface ProviderHealth {
  consecutiveFailures: number
  lastFailureAt: number | null
  circuitOpen: boolean
  circuitOpenUntil: number | null
}

export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>()
  private models: ModelEntry[] = []
  private health = new Map<string, ProviderHealth>()
  private readonly circuitBreakerThreshold = 3
  private readonly circuitResetMs = 60000

  register(providerName: string, provider: LLMProvider, models: string[], priority = 100) {
    this.providers.set(providerName, provider)
    for (const model of models) {
      this.models.push({ model, providerName, priority })
      this.health.set(`${providerName}:${model}`, {
        consecutiveFailures: 0, lastFailureAt: null,
        circuitOpen: false, circuitOpenUntil: null,
      })
    }
    this.models.sort((a, b) => a.priority - b.priority)
  }

  resolve(model: string): LLMProvider {
    const entries = this.models.filter(m => m.model === model)
    if (!entries.length) {
      throw new Error(`Unknown model: ${model}. Available: ${this.listModels().map(m => m.id).join(", ")}`)
    }

    for (const entry of entries) {
      const health = this.health.get(`${entry.providerName}:${model}`)
      if (health?.circuitOpen) {
        if (health.circuitOpenUntil && Date.now() > health.circuitOpenUntil) {
          health.circuitOpen = false
          health.consecutiveFailures = 0
        } else {
          continue
        }
      }

      const provider = this.providers.get(entry.providerName)
      if (provider) return provider
    }

    // All providers are circuit-broken — try the first one anyway
    const fallback = this.providers.get(entries[0].providerName)
    if (fallback) return fallback
    throw new Error(`No provider available for model: ${model}`)
  }

  async chatWithFallback(
    model: string,
    params: Parameters<LLMProvider["chat"]>[0],
  ): Promise<ReturnType<LLMProvider["chat"]>> {
    const entries = this.models.filter(m => m.model === model)
    if (!entries.length) throw new Error(`Unknown model: ${model}`)

    const errors: string[] = []

    for (const entry of entries) {
      const healthKey = `${entry.providerName}:${model}`
      const health = this.health.get(healthKey)

      if (health?.circuitOpen) {
        if (health.circuitOpenUntil && Date.now() > health.circuitOpenUntil) {
          health.circuitOpen = false
          health.consecutiveFailures = 0
        } else {
          errors.push(`${entry.providerName}: circuit open`)
          continue
        }
      }

      const provider = this.providers.get(entry.providerName)
      if (!provider) {
        errors.push(`${entry.providerName}: not registered`)
        continue
      }

      try {
        const result = await provider.chat(params)
        if (health) {
          health.consecutiveFailures = 0
          health.lastFailureAt = null
        }
        return result
      } catch (err: any) {
        errors.push(`${entry.providerName}: ${err.message}`)
        if (health) {
          health.consecutiveFailures++
          health.lastFailureAt = Date.now()
          if (health.consecutiveFailures >= this.circuitBreakerThreshold) {
            health.circuitOpen = true
            health.circuitOpenUntil = Date.now() + this.circuitResetMs
            console.warn(`[Provider] Circuit opened for ${entry.providerName}:${model} for ${this.circuitResetMs}ms`)
          }
        }
      }
    }

    throw new Error(`All providers failed for ${model}: ${errors.join("; ")}`)
  }

  recordFailure(model: string, providerName?: string) {
    const entries = providerName
      ? this.models.filter(m => m.model === model && m.providerName === providerName)
      : this.models.filter(m => m.model === model)

    for (const entry of entries) {
      const healthKey = `${entry.providerName}:${model}`
      const health = this.health.get(healthKey)
      if (health) {
        health.consecutiveFailures++
        health.lastFailureAt = Date.now()
        if (health.consecutiveFailures >= this.circuitBreakerThreshold) {
          health.circuitOpen = true
          health.circuitOpenUntil = Date.now() + this.circuitResetMs
        }
      }
    }
  }

  getHealth(): Array<{ provider: string; model: string; healthy: boolean; failures: number }> {
    const result: Array<{ provider: string; model: string; healthy: boolean; failures: number }> = []
    for (const entry of this.models) {
      const health = this.health.get(`${entry.providerName}:${entry.model}`)
      result.push({
        provider: entry.providerName,
        model: entry.model,
        healthy: !health?.circuitOpen,
        failures: health?.consecutiveFailures ?? 0,
      })
    }
    return result
  }

  listModels(): ModelInfo[] {
    const seen = new Set<string>()
    const result: ModelInfo[] = []
    for (const entry of this.models) {
      if (!seen.has(entry.model)) {
        seen.add(entry.model)
        result.push({
          id: entry.model,
          provider: entry.providerName,
          capabilities: ["chat"],
          contextWindow: 128000,
        })
      }
    }
    return result
  }

  hasModel(model: string): boolean {
    return this.models.some(m => m.model === model)
  }

  list(): Array<{ name: string }> {
    return [...this.providers.values()].map(p => ({ name: p.name }))
  }
}
