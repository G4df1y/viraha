# Context Builder Design

## Current State

Context assembly is inline in `runtime.ts` → `buildPromptTiers` callback in `setup.ts`. It's a function, not a module. No token budget awareness, no caching, no dependency injection.

## Target Architecture

ContextBuilder becomes a first-class module with a pipeline architecture:

```
┌────────────────────────────────────────────────────────────────┐
│                     ContextBuilder                               │
│                                                                  │
│  assemble(userId, input) → Context                               │
│                                                                  │
│  Pipeline:                                                        │
│                                                                  │
│  1. SystemPromptCollector                                         │
│     └─ persona → versioned system prompt                          │
│                                                                  │
│  2. ProfileCollector                                              │
│     └─ user profile → cached, timestamped                        │
│                                                                  │
│  3. MemoryCollector                                               │
│     └─ relevant memories → ranked, limited, formatted             │
│                                                                  │
│  4. KnowledgeCollector                                            │
│     └─ query → retrieve → rerank → format                        │
│                                                                  │
│  5. RelationshipCollector                                         │
│     └─ state summary                                             │
│                                                                  │
│  6. WorkflowCollector                                             │
│     └─ active goals + progress                                   │
│                                                                  │
│  7. HistoryCollector                                              │
│     └─ recent messages → token-budgeted                          │
│                                                                  │
│  8. TokenBudgetEnforcer                                          │
│     └─ allocate budget → trim → warn                             │
│                                                                  │
│  9. ContextAssembler                                             │
│     └─ tiers → final prompt string                               │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

---

## ContextBuilder Interface

```typescript
interface ContextBuilderConfig {
  // Token budget allocation (percentages)
  budget: {
    systemPrompt: number    // 15% default
    profile: number         // 5% default
    memories: number        // 20% default
    knowledge: number       // 10% default
    relationship: number    // 5% default
    workflow: number        // 5% default
    history: number         // 40% default
  }
  
  // Cache TTLs
  cacheTTL: {
    profile: number         // 60s
    relationship: number    // 30s
    systemPrompt: number    // 300s
  }
  
  // Collectors (pluggable)
  collectors: ContextCollector[]
}

interface ContextCollector {
  name: string
  priority: number          // execution order
  collect(ctx: CollectorContext): Promise<CollectorResult>
}

interface CollectorContext {
  userId: string
  sessionId: string
  input: TurnInput
  remainingBudget: number   // tokens remaining
}

interface CollectorResult {
  content: string
  tokens: number
  cacheKey?: string
  cacheTTL?: number
}

interface AssembledContext {
  tiers: {
    stable: string[]        // persona, tool defs
    context: string[]       // profile, relationship, workflows
    volatile: string[]      // memories, knowledge
    ephemeral: string[]     // conversation history
  }
  systemPrompt: string
  messages: Array<{ role: string; content: string }>
  tokenUsage: {
    total: number
    byTier: Record<string, number>
    byCollector: Record<string, number>
  }
  warnings: string[]        // "Memory summary truncated to 2000 tokens"
}
```

---

## Collector Pipeline (Execution Order)

```
1. SystemPromptCollector
   Priority: 100 (first)
   Cache: persona version -> system prompt
   Budget: 15%
   
2. RelationshipCollector
   Priority: 90
   Cache: 30s
   Budget: 5%
   
3. ProfileCollector
   Priority: 80
   Cache: 60s
   Budget: 5%
   
4. WorkflowCollector
   Priority: 70
   Cache: 60s
   Budget: 5%
   
5. MemoryCollector
   Priority: 50
   No cache (dynamic)
   Budget: 20%
   └─ Uses MemoryEngine.search(query, limit=10, ranking=importance)
   
6. KnowledgeCollector
   Priority: 40
   No cache
   Budget: 10%
   └─ Uses KnowledgeEngine.search(query, topK=3)
   
7. HistoryCollector
   Priority: 10 (last)
   No cache
   Budget: 40%
   └─ Applies compression if history exceeds budget
```

---

## Token Budget Enforcement Algorithm

```typescript
function enforceBudget(context: AssembledContext, maxTokens: number): AssembledContext {
  let used = 0
  
  // 1. Stable tier — always included, deduct first
  const stableTokens = estimateTokens(context.tiers.stable)
  used += stableTokens
  
  // 2. Context tier — include if budget remains
  let contextTokens = estimateTokens(context.tiers.context)
  if (used + contextTokens > maxTokens * 0.3) {
    contextTokens = compress(context.tiers.context, maxTokens * 0.3 - used)
  }
  used += contextTokens
  
  // 3. Volatile tier — aggressively pruned
  let volatileTokens = estimateTokens(context.tiers.volatile)
  const volatileBudget = maxTokens * 0.35 - used
  if (volatileTokens > volatileBudget) {
    volatileTokens = truncateByRelevance(context.tiers.volatile, volatileBudget)
  }
  used += volatileTokens
  
  // 4. Ephemeral tier — remaining budget
  const historyBudget = maxTokens - used - 500  // 500 token buffer
  context.tiers.ephemeral = trimHistory(context.tiers.ephemeral, historyBudget)
  
  return context
}
```

---

## Flowchart

```
User Input
  │
  ▼
ContextBuilder.assemble(userId, input)
  │
  ├─ 1. SystemPromptCollector
  │     ├─ Check cache (persona:coach, version:2)
  │     ├─ Cache hit? → return cached
  │     └─ Cache miss? → build from persona engine
  │
  ├─ 2. RelationshipCollector
  │     ├─ Check cache key (rel:user-123)
  │     ├─ Cache valid? → return
  │     └─ Expired? → fetch from companion engine
  │
  ├─ 3. ProfileCollector
  │     (same cache pattern)
  │
  ├─ 4. WorkflowCollector
  │     (same cache pattern)
  │
  ├─ 5. MemoryCollector
  │     ├─ Analyze input → extract query terms
  │     ├─ Multi-stage search (keyword → vector → rerank)
  │     ├─ Format top K results
  │     └─ Limit by token budget
  │
  ├─ 6. KnowledgeCollector
  │     ├─ Match input to knowledge domains
  │     ├─ Retrieve relevant chunks
  │     └─ Format with source attribution
  │
  ├─ 7. HistoryCollector
  │     ├─ Load recent N messages
  │     ├─ Estimate token count
  │     ├─ Within budget? → return
  │     └─ Exceeds budget? → compress or truncate
  │
  ├─ 8. TokenBudgetEnforcer
  │     ├─ Sum all collector results
  │     ├─ Check against maxTokens
  │     ├─ Prune volatile tier if over
  │     └─ Warn if severely over
  │
  └─ 9. ContextAssembler
        ├─ Format 4-tier prompt
        ├─ Build message array
        └─ Return AssembledContext
```

---

## Caching Strategy

| Collector | Cache Key | TTL | Invalidation |
|-----------|-----------|-----|-------------|
| SystemPrompt | persona.id + version | 5 min | Persona change |
| Profile | user.id + profile.updatedAt | 60s | Profile DB update event |
| Relationship | user.id + rel.updatedAt | 30s | Relationship DB update event |
| Workflow | user.id + goal.updatedAt | 60s | Goal change event |
| Memories | user.id + query hash | 0 (no cache) | — |
| Knowledge | query hash + pack version | 5 min | Knowledge pack update |
| History | session.id + lastMsgId | 0 (no cache) | — |

---

## Migration Path

### Phase 1: Extract ContextBuilder from Runtime (P0)
```
runtime.ts → remove context assembly
context-builder/ → new module with current logic
```

### Phase 2: Add Token Budget (P0)
```
Add ConfigurableBudget
Add estimateTokens() utility
Add trimHistory() with oldest-first removal
```

### Phase 3: Add Collectors (P1)
```
Implement 7 collectors
Implement caching
Implement relevance-based memory selection
```

### Phase 4: Add Compression (P1)
```
Implement Hermes 4-phase compression
Implement budget enforcement
Implement truncation warnings
```
