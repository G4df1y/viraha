# Framework Comparison

## Overview

Analysis of 6 agent frameworks against CompanionOS requirements.

---

## 1. OpenClaw

### Architecture

```
Gateway (WS Server) → Agent Runtime → LLM Providers
                  ↘ Channel Adapters → 20+ platforms
```

### Key Design Patterns

| Pattern | Description | Applicable |
|---------|-------------|------------|
| **Gateway Event Bus** | WebSocket server multiplexes typed events | Direct reuse |
| **Provider Registry** | Static model catalog with capability mapping | Direct reuse (already partially done) |
| **Lane-aware Queue** | Per-session FIFO + global concurrency cap | Already implemented |
| **Channel Adapters** | Plugin-based, 20+ platforms | Architecture only, not code |
| **File-based Workspace** | AGENTS.md/SOUL.md as system prompt | Not suitable for DB-backed companion |
| **Plugin SDK** | registerTool/registerProvider/registerChannel | Need to build |
| **Multi-layer Tool Policy** | Allow/deny/channel/model gates | Need to build |

### Borrow: Gateway Event Bus pattern
OpenClaw's WebSocket Gateway multiplexing typed events is the correct pattern for CompanionOS's Event System. Each event type maps to a specific module concern.

### Skip: File-based workspace injection
Hermes-style AGENTS.md files work for coding agents but not for personalized companions where data lives in a database.

---

## 2. Hermes

### Architecture

```
Agent → ContextEngine → LLM → Tool → Session Store
                      ↘ Background Review → Memory/Skills
```

### Key Design Patterns

| Pattern | Description | Applicable |
|---------|-------------|------------|
| **Curated Memory** | MEMORY.md + USER.md with char limits | Direct reuse (core concept) |
| **Background Self-Review** | After-turn LLM review to consolidate | Direct reuse (already partially done) |
| **4-Phase Context Compression** | Prune → Split → Summarize → Assemble | Must implement — current gap |
| **FTS5 Session Search** | Full-text search over session history | Already implemented |
| **Prompt Assembly Tiers** | Stable/Context/Volatile/Ephemeral | Already implemented but broken |
| **Token-boundary Protection** | Preserve head + tail, summarize middle | Must implement |
| **Skill Management** | Agent-managed skill CRUD via tool | Adapt to Knowledge Packs |
| **External Memory Providers** | Plugable memory backends (8 plugins) | Future — P2 |

### Borrow: Context Compression Algorithm
Hermes's 4-phase compression (prune → split → summarize → assemble) with structured templates is exactly what CompanionOS needs. The template format:

```
## Goal
## Constraints & Preferences
## Progress (Done / In Progress / Blocked)
## Key Decisions
## Relevant Files
## Next Steps
```

We should adapt this to companion context:
```
## User Profile Changes
## Key Events Since Last Summary
## Current Goals & Progress
## Emotional State
## Relevant Memories
```

### Borrow: Memory Char Limits with Overflow
Hermes enforces per-file char limits and returns overflow errors — the agent must consolidate. This prevents unbounded memory growth better than any algorithm.

### Skip: FTS5 Session Search
CompanionOS already has this. But needs upgrade to hybrid search (vector + keyword).

---

## 3. LangGraph

### Architecture

```
StateGraph(nodes + edges) → Checkpointer (DB) → Store (cross-thread)
```

### Key Design Patterns

| Pattern | Description | Applicable |
|---------|-------------|------------|
| **StateGraph** | Nodes + edges as state machine | Companion Brain design — NOT agent workflow |
| **Checkpointer** | Full state snapshots per super-step | Overkill — session store is sufficient |
| **Store** | Cross-thread key-value with semantic search | Relevant — Store = Long-term Memory |
| **Reducer Functions** | Controlled state updates (overwrite/append/merge) | Must implement for Memory merging |
| **RemoveMessage** | Message deletion/trimming in thread | Adapt for context window management |
| **Subgraphs** | Composable sub-graphs with isolated state | Future multi-agent companion design |
| **Interrupts** | Dynamic pause/resume for HITL | Useful for goal confirmation flows |

### Borrow: Reducer Pattern for State Updates
LangGraph's reducer pattern (`Annotated[list, operator.add]`) is ideal for memory updates — new facts merge with existing, conflicts are resolved by LLM, and deletion is explicit.

### Borrow: Store Namespacing
LangGraph's `Store.put(("user_id", "memories"), key, value)` pattern with hierarchical namespaces is cleaner than CompanionOS's flat `memory_entries` table.

### Skip: Full Checkpointer
Full state snapshots per turn are overkill for a companion. Session-based state is sufficient.

---

## 4. Mastra

### Architecture

```
Agent → Workflow (steps) → Tools → Storage
     ↘ Observational Memory → Observer Agent → Reflector Agent
```

### Key Design Patterns

| Pattern | Description | Applicable |
|---------|-------------|------------|
| **Observational Memory** | Two background agents: Observer (compress) → Reflector (patterns) | Adapt to CompanionOS |
| **Token-tiered Model Selection** | Cheaper model for small contexts, stronger for large | Must implement for cost optimization |
| **Async Buffering** | Observations computed in background, no agent pause | Must implement — reflection should not block |
| **Extractors** | Schema-validated data extraction from observations | Adapt — structured extraction from conversation |
| **Temporal Gap Markers** | Inserted when conversation resumes after ≥10min | Useful for presence/context |
| **Prompt Cache Optimization** | Stable prefix design for Anthropic prompt caching | Direct reuse |

### Borrow: Observer/Reflector Two-Tier Design
Mastra's OM pattern is better than CompanionOS's flat reflection:

```
Observer: After each turn, compress conversation into dense notes (fast, cheap model)
Reflector: When threshold reached, condense observations into cross-session patterns (stronger model)
```

This solves the problem of blocking the agent with slow reflection.

### Skip: Workflow Steps
Mastra's `createWorkflow()` + `createStep()` is useful for deterministic business logic but over-engineering for companion conversations.

---

## 5. OpenHands

### Architecture

```
Agent → Event Stream → LLM → Tool → Observation → Event Log
                    ↘ Condenser (rolling window)
```

### Key Design Patterns

| Pattern | Description | Applicable |
|---------|-------------|------------|
| **Event Sourcing** | Append-only event log with typed events | Must implement for audit and replay |
| **Condenser System** | LLM-based history compression at threshold | Adapt for context window management |
| **Rolling Window** | Keep head + summarize middle + keep tail | Direct reuse |
| **Action→Observation** | Strict typed Action/Observation pattern | Adapt for Tool system |
| **Security Analyzer** | LLM-based risk assessment before tool call | Must implement for multi-user |
| **Stuck Detection** | Sliding window on repeated patterns | Must implement for production |

### Borrow: Event Sourcing
OpenHands's typed event hierarchy is the correct foundation for CompanionOS's Event System:

```
Event
├── LLMConvertibleEvent
│   ├── MessageEvent
│   ├── ActionEvent
│   └── ObservationEvent
└── InternalEvent
    ├── CondensationRequest
    ├── Condensation
    └── PauseEvent
```

### Borrow: Condenser Rolling Window
The keep-head/summarize-middle/keep-tail pattern is more practical than full compression.

### Skip: Sandbox System
OpenHands's Docker/SSH sandboxes are unnecessary for a companion.

---

## 6. AutoGen

### Architecture

```
Agent → GroupChat → Agent → Tool → Result
     ↕ Agent → Tool → Result
```

### Key Design Patterns

| Pattern | Description | Applicable |
|---------|-------------|------------|
| **Multi-Agent Conversation** | Agents communicate through GroupChat | Future — multi-companion |
| **Agent Specialization** | Each agent has a role | Future — persona as agent specialization |
| **Handoff Patterns** | Agent delegates to another agent | Future — sub-companions |
| **Termination Conditions** | Conversation end detection | Useful for presence decisions |

### Skip: Everything for v1
AutoGen is oriented toward multi-agent collaboration. CompanionOS v1 is single-agent. Revisit for v2.

---

## Cross-Framework Pattern Matrix

| Pattern | OpenClaw | Hermes | LangGraph | Mastra | OpenHands | AutoGen | CompanionOS Priority |
|---------|----------|--------|-----------|--------|-----------|---------|---------------------|
| Event Bus | ✅ Gateway | ❌ | ❌ | ❌ | ✅ Event Log | ❌ | **P0 — build** |
| Context Compression | ❌ | ✅ 4-phase | ❌ | ✅ Observer | ✅ Condenser | ❌ | **P0 — build** |
| Memory Ranking | ❌ | ✅ Char limits | ✅ Store | ✅ Extractors | ❌ | ❌ | **P0 — build** |
| Tool Policy | ✅ Multi-layer | ❌ | ❌ | ❌ | ✅ Security Analyzer | ❌ | **P1 — build** |
| Plugin System | ✅ SDK | ❌ | ❌ | ❌ | ❌ | ❌ | **P1 — build** |
| State Machine | ❌ | ❌ | ✅ StateGraph | ❌ | ❌ | ✅ GroupChat | **P1 — adapt** |
| Streaming First | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **P2 — need** |

---

## Conclusion

### Directly Reuse (architectural pattern):
1. OpenClaw: Gateway Event Bus + Lane Queue
2. Hermes: 4-phase compression + Curated Memory + Background Review
3. Mastra: Observer/Reflector two-tier + Async Buffering
4. OpenHands: Event Sourcing + Rolling Window Condenser

### Must Build From Scratch:
1. Relationship Engine State Machine
2. Companion Brain (Observe→Understand→Retrieve→Think→Plan→Reply→Reflect)
3. Emotional Memory (not present in any framework)
4. Multi-tenant Storage Layer
