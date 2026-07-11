# Memory Architecture Review

## Current Memory System

```
types: long_term | episodic | emotional | reflection
storage: single SQLite table (memory_entries)
search: LIKE '%keyword%' (no FTS5 used by engine, only in MemoryStore.searchMessages)
retrieval: ALL entries → concatenated into prompt
ranking: none
eviction: none
dedup: by (userId, type, key) unique constraint
```

## Scalability Analysis

### At 100 Memories
- Profile: ~2KB text
- Memory summary: ~10KB text
- Within context window ✅
- Reflection cost: ~100 tokens extraction prompt ✅

### At 1,000 Memories
- Memory summary: ~100KB text
- **Exceeds most context windows** ❌
- Full history in prompt = wasted tokens
- Reflection cost: ~500 tokens extraction prompt ⚠️
- **First breakpoint** — must implement ranking + selection

### At 10,000 Memories
- Memory summary: ~1MB text
- **Impossible to include all** ❌❌
- Every turn costs $0.10+ in tokens just for memory
- Response latency: 10-30s due to context processing
- **System breaks** — must implement hybrid search + compression

### At 100,000 Memories
- Even search indexes start degrading
- SQLite single-table scan becomes slow (even with index)
- Memory retrieval becomes the bottleneck
- **Full redesign needed**

---

## Required Algorithms

### 1. Memory Retrieval (P0)

**Current:** `getAllEntries(userId)` → flat array → concatenate

**Required:**

```
User Query
  │
  ▼
Query Understanding
  ├─ Extract entities, intent, time range
  ├─ Classify question type (fact/recent/emotional/procedural)
  │
  ▼
Multi-Stage Retrieval
  ├─ Stage 1: Keyword (FTS5) — cheap, recall-oriented
  │   └─ Returns ~200 candidates
  ├─ Stage 2: Vector (pgvector) — semantic understanding
  │   └─ Returns ~100 candidates
  ├─ Stage 3: Hybrid — weighted combine
  │   └─ Returns ~50 candidates
  └─ Stage 4: Rerank — cross-encoder style
      └─ Returns top 10-20
  │
  ▼
Format for Prompt
  └─ Selected memories → structured text
```

### 2. Memory Ranking (P0)

**Factors for importance scoring:**

```typescript
interface MemoryRank {
  age: number                  // newer = higher, with asymptotic decay
  accessCount: number          // frequently accessed = important
  lastAccessTime: number       // recently accessed = relevant
  emotionalIntensity: number   // highly emotional = sticky
  userExplicit: boolean        // user said "remember this" = max
  relationRelevance: number    // related to current relationship state
  goalRelevance: number        // related to current goal
  conflictCount: number        // contradicted = needs review
}

Score = w1×age + w2×access + w3×emotion + w4×explicit + w5×goal
```

### 3. Memory Compression (P0)

**Hermes 4-Phase Algorithm (TypeScript adaptation):**

```
Phase 1: Prune
  └─ Remove tool results >200 chars
  └─ Remove duplicate events

Phase 2: Split
  └─ Preserve head (first 20% of time window)
  └─ Identify middle for compression
  └─ Protect tail (last 10 interactions)

Phase 3: Summarize
  └─ LLM call with template:
      ## Key Facts
      ## User Changes
      ## Emotional Patterns
      ## Important Events

Phase 4: Assemble
  └─ Head + Summary + Tail
  └─ Estimate compression ratio (target: 80% reduction)
```

### 4. Memory Merging (P1)

**Conflict resolution when user says contradictory things:**

```typescript
// User says "I love running" -> entry A
// User says "I hate cardio"  -> entry B

interface MemoryConflict {
  entries: [MemoryEntry, MemoryEntry]
  resolution: "supersede" | "contextual" | "ask_user"
  resolvedAt?: Date
  resolvedBy?: "llm" | "user" | "time"
}
```

**Strategies:**
- **Supersede:** Newer memory replaces older (for factual changes like weight)
- **Contextual:** Both are valid in different contexts (loves running outdoors, hates treadmill)
- **Ask User:** Conflict too complex — defer to conversation

### 5. Memory Forgetting (P1)

**Not deletion — archival:**

```typescript
interface ForgettingPolicy {
  // Memories below this importance score are archived
  threshold: number  // 0-1
  
  // Archive frequency
  reviewInterval: number  // days
  
  // Archive target
  targetSummary: "weekly" | "monthly" | "quarterly"
}
```

**Algorithm:**
```
Every N sessions:
  1. Score all memories by importance
  2. Low-score memories (below threshold, >30 days old) → archive
  3. Archive compressed into monthly summary
  4. Summary stored as a single memory entry
  5. Original entries moved to archive table
```

### 6. Memory Importance (P1)

**Determined by:**

| Factor | Weight | Source |
|--------|--------|--------|
| User explicitly asked to remember | 1.0 | "Remember that I..." |
| Repeated across multiple sessions | 0.8 | Observed pattern |
| Emotionally charged | 0.7 | Sentiment analysis |
| Related to active goal | 0.6 | Goal engine cross-reference |
| Recently mentioned | 0.5 | Recency bias |
| Contradicts other memories | 0.4 | Needs attention |

### 7. Memory Versioning (P2)

```typescript
interface MemoryVersion {
  entryId: string
  version: number
  content: string
  timestamp: Date
  reason: "created" | "updated" | "merged" | "archived"
  previousContent?: string
}
```

**When user says "I'm now 80kg" after previously saying "I'm 85kg":**
1. Check for existing "weight" memory
2. Create new version
3. Link old version as superseded
4. Record reason: "user_update"

### 8. Hybrid Search Architecture (P1)

```
┌─────────────────────────────────────┐
│           Query Router               │
│  Determines search strategy based    │
│  on query type and urgency           │
└──────────┬──────────────────────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
┌─────────┐ ┌──────────┐
│ FTS5    │ │ Vector   │
│ keyword │ │ semantic │
│ (fast)  │ │ (accurate)│
└────┬────┘ └────┬─────┘
     │           │
     └─────┬─────┘
           ▼
┌─────────────────┐
│   Hybrid Fusion  │
│  RRF (Reciprocal │
│  Rank Fusion)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Reranker       │
│  (LLM or Cohere) │
└────────┬────────┘
         │
         ▼
   Top-K Results
```

---

## SQL Migration Path

### Phase 1: Current (SQLite, working)
```
memory_entries: id, user_id, type, key, content, metadata, timestamps
```

### Phase 2: Add Search Indexes (P0, same SQLite)
```
CREATE INDEX idx_mem_type ON memory_entries(user_id, type, updated_at)
CREATE INDEX idx_mem_key ON memory_entries(user_id, type, key)
-- sqlite-vec for vector (when node-gyp available)
```

### Phase 3: Archive Table (P1, same SQLite)
```
CREATE TABLE memory_archive (LIKE memory_entries);
CREATE TABLE memory_versions (LIKE memory_entries + version_number);
```

### Phase 4: PostgreSQL (P3, when scaling)
```
-- pgvector extension
-- Partition by user_id
-- Materialized views for active memories
```

---

## Summary: Memory Engine Health

| Capability | Current | Needed | Priority |
|-----------|---------|--------|----------|
| Retrieval | Full scan | Hybrid (FTS+Vector+Rerank) | P0 |
| Ranking | None | Multi-factor importance | P0 |
| Compression | None | 4-phase Hermes algorithm | P0 |
| Forgetting | None | Importance-based archival | P1 |
| Merging | Unique key | Conflict resolution | P1 |
| Versioning | None | Temporal version chain | P2 |
| Search | LIKE query | Multi-stage retrieval | P1 |
| Max capacity | ~500 entries | 100K+ entries | P0 (architecture) |
