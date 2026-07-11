// Rough token estimation: ~4 chars per token for English/Chinese mixed
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

export interface TokenBudget {
  total: number
  remaining: number
  allocations: Map<string, number>
}

export function createBudget(maxTokens: number, percentages: Record<string, number>): TokenBudget {
  const allocations = new Map<string, number>()
  let assigned = 0

  for (const [key, pct] of Object.entries(percentages)) {
    const alloc = Math.floor(maxTokens * (pct / 100))
    allocations.set(key, alloc)
    assigned += alloc
  }

  // Buffer remaining tokens
  const buffer = maxTokens - assigned
  return { total: maxTokens, remaining: buffer, allocations }
}

export function enforceBudget(
  content: string,
  maxTokens: number,
  tolerance = 0.1 // allow 10% overage before trimming
): { trimmed: string; tokens: number; truncated: boolean } {
  const tokens = estimateTokens(content)

  if (tokens <= maxTokens * (1 + tolerance)) {
    return { trimmed: content, tokens, truncated: false }
  }

  // Truncate to fit: keep start and end, remove middle.
  const charsPerToken = 3.5
  const maxChars = Math.floor(maxTokens * charsPerToken)
  const keepChars = Math.floor(maxChars * 0.6) // keep 60% from start
  const tailChars = Math.floor(maxChars * 0.3) // keep 30% from end

  const trimmed =
    content.substring(0, keepChars) +
    "\n...[truncated]...\n" +
    content.substring(content.length - tailChars)

  return { trimmed, tokens: estimateTokens(trimmed), truncated: true }
}

