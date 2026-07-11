export type ModelTier = "reasoning" | "generation" | "reflection" | "fast"

export interface ModelRouterConfig {
  reasoning: string   // strong model for thinking/reasoning
  generation: string  // main model for response generation
  reflection: string  // cheap model for background tasks
  fast: string        // cheapest model for simple tasks
}

export class ModelRouter {
  private config: ModelRouterConfig

  constructor(config?: Partial<ModelRouterConfig>) {
    this.config = {
      reasoning: config?.reasoning ?? "deepseek-reasoner",
      generation: config?.generation ?? "deepseek-chat",
      reflection: config?.reflection ?? "deepseek-chat",
      fast: config?.fast ?? "deepseek-chat",
    }
  }

  resolve(tier: ModelTier): string {
    return this.config[tier]
  }

  getConfig(): ModelRouterConfig {
    return { ...this.config }
  }
}

