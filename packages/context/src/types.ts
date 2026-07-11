export interface CollectorContext {
  userId: string
  sessionId: string
  input: string
  remainingBudget: number
}

export interface CollectorResult {
  content: string
  tokens: number
  cacheKey?: string
}

export interface ContextCollector {
  name: string
  priority: number
  collect(ctx: CollectorContext): Promise<CollectorResult>
}

export interface ContextBuilderConfig {
  maxTokens: number
  budget: {
    systemPrompt: number
    profile: number
    memories: number
    knowledge: number
    relationship: number
    workflow: number
    history: number
  }
}

