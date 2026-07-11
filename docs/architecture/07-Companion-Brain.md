# Companion Brain Design

## Current Agent Loop

```
Input → LLM → Reply (with optional tool loop)
```

**Too simple.** No reasoning, no planning, no memory-awareness, no state machine.

## Redesigned Agent Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                     COMPANION BRAIN                               │
│                                                                   │
│  Phase 1: OBSERVE                                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Input: User message + Channel metadata + Context state        │ │
│  │ Output: NormalizedObservation                                 │ │
│  │ Purpose: Understand what happened, not what to do              │ │
│  │ Steps:                                                        │ │
│  │   1. Normalize message (channel-agnostic)                      │ │
│  │   2. Detect message type (question/statement/command/emotion) │ │
│  │   3. Detect emotional tone (sentiment analysis)                │ │
│  │   4. Detect intent (goal check/update/share/problem)          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                  │                                │
│                                  ▼                                │
│  Phase 2: UNDERSTAND                                              │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Input: NormalizedObservation                                  │ │
│  │ Output: Understanding (structured representation)             │ │
│  │ Purpose: Extract meaning, entities, and context               │ │
│  │ Steps:                                                        │ │
│  │   1. Extract entities (exercises, dates, foods, weights)      │ │
│  │   2. Extract relationships between entities                   │ │
│  │   3. Classify conversation type (training/food/goal/chat)     │ │
│  │   4. Determine if user needs: info/plan/motivation/action     │ │
│  │   5. Detect if this references past conversation              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                  │                                │
│                                  ▼                                │
│  Phase 3: RETRIEVE                                                │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Input: Understanding                                          │ │
│  │ Output: RelevantContext                                       │ │
│  │ Purpose: Gather all relevant data for response                │ │
│  │ Steps:                                                        │ │
│  │   1. Query memory engine (by relevance, not recency)          │ │
│  │   2. Query knowledge engine (by semantic match)                │ │
│  │   3. Load profile (if relevant)                                │ │
│  │   4. Load relationship state                                   │ │
│  │   5. Load active goals and progress                            │ │
│  │   6. Load recent conversation history (token-budgeted)        │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                  │                                │
│                                  ▼                                │
│  Phase 4: THINK                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Input: RelevantContext                                        │ │
│  │ Output: Thought (structured reasoning)                        │ │
│  │ Purpose: Reason about the situation before deciding           │ │
│  │ LLM Call: REASONING model (strong, with thinking capability)  │ │
│  │ Steps:                                                        │ │
│  │   1. Identify what user really needs                          │ │
│  │   2. Evaluate against context (profile, goals, history)       │ │
│  │   3. Consider multiple approaches                             │ │
│  │   4. Identify risks or knowledge gaps                         │ │
│  │   5. Decide what information to include in reply              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                  │                                │
│                                  ▼                                │
│  Phase 5: PLAN                                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Input: Thought                                                │ │
│  │ Output: Plan (structured action sequence)                     │ │
│  │ Purpose: Decide what actions to take, in what order           │ │
│  │ Steps:                                                        │ │
│  │   1. List required actions (reply/tool_call/query/update)     │ │
│  │   2. Order actions optimally                                   │ │
│  │   3. Identify parallelizable actions                          │ │
│  │   4. Plan tool calls with expected inputs                     │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                  │                                │
│                                  ▼                                │
│  Phase 6: EXECUTE                                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Input: Plan                                                   │ │
│  │ Output: ExecutionResult                                       │ │
│  │ Purpose: Execute the plan, handling success/failure per step  │ │
│  │ Steps:                                                        │ │
│  │   1. Execute non-LLM actions (tool calls, DB writes)          │ │
│  │   2. If tool fails → retry or fallback                        │ │
│  │   3. Build final LLM prompt from all collected context        │ │
│  │   4. Call GENERATION model (cheaper, faster)                  │ │
│  │   5. Stream response to channel                               │ │
│  │   6. Track token usage and latency                            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                  │                                │
│                                  ▼                                │
│  Phase 7: REFLECT                                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Input: Conversation pair (user + assistant) + ExecutionResult │ │
│  │ Output: ReflectionResult                                      │ │
│  │ Purpose: Learn from the interaction (async)                   │ │
│  │ Steps:                                                        │ │
│  │   1. Extract new facts about user (profile updates)           │ │
│  │   2. Extract emotional state                                  │ │
│  │   3. Evaluate response quality (self-critique)                │ │
│  │   4. Identify learning opportunities                          │ │
│  │   5. Compress conversation if budget exceeded                 │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                  │                                │
│                                  ▼                                │
│  Phase 8: UPDATE                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Input: ReflectionResult                                       │ │
│  │ Output: Events (to event bus)                                 │ │
│  │ Purpose: Persist learnings from the interaction               │ │
│  │ Actions:                                                      │ │
│  │   1. Emit RelationshipChanged (if relationship state changed) │ │
│  │   2. Emit MemoryCreated (if new memories stored)              │ │
│  │   3. Emit GoalUpdated (if progress made)                      │ │
│  │   4. Emit AchievementUnlocked (if applicable)                 │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                  │                                │
│                                  ▼                                │
│                        Return reply to channel                    │
└─────────────────────────────────────────────────────────────────┘
```

## Sequence Diagram

```
User         Channel        ContextBuilder    CompanionBrain      Provider        Engines
 │              │                │                  │                │              │
 │──message────▶│                │                  │                │              │
 │              │──InboundMsg───▶│                  │                │              │
 │              │                │──assemble()─────▶│                │              │
 │              │                │                  │                │              │
 │              │                │                  │──Phase 1──────▶│              │
 │              │                │                  │  OBSERVE       │              │
 │              │                │                  │◀──────────────│              │
 │              │                │                  │                │              │
 │              │                │                  │──Phase 2──────▶│              │
 │              │                │                  │  UNDERSTAND    │              │
 │              │                │                  │◀──────────────│              │
 │              │                │                  │                │              │
 │              │                │                  │──Phase 3──────▶│─────────────▶│
 │              │                │                  │  RETRIEVE      │  query       │
 │              │                │                  │◀──────────────│◀─────────────│
 │              │                │                  │                │              │
 │              │                │                  │──Phase 4──────▶│              │
 │              │                │                  │  THINK         │  (reasoning) │
 │              │                │                  │◀──────────────│              │
 │              │                │                  │                │              │
 │              │                │                  │──Phase 5──────▶│              │
 │              │                │                  │  PLAN          │              │
 │              │                │                  │◀──────────────│              │
 │              │                │                  │                │              │
 │              │                │                  │──Phase 6──────▶│─────────────▶│
 │              │                │                  │  EXECUTE       │  tool calls  │
 │              │                │                  │◀──────────────│◀─────────────│
 │              │                │                  │                │              │
 │              │◀───stream──────│◀─────────────────│                │              │
 │◀──response───│                │                  │                │              │
 │              │                │                  │                │              │
 │              │                │                  │  (async) Phase 7: REFLECT    │
 │              │                │                  │────────────────▶─────────────▶│
 │              │                │                  │                │              │
 │              │                │                  │  Phase 8: UPDATE              │
 │              │                │                  │────────────────▶ Event Bus    │
```

## Model Strategy

| Phase | Model | Rationale |
|-------|-------|-----------|
| Observe | Rule-based + cheap classifier | No LLM needed for sentiment/intent |
| Understand | Cheap model (DeepSeek, Haiku) | Simple extraction task |
| Retrieve | No model | DB query + ranking |
| Think | Strong model (Sonnet, Reasoner) | Complex reasoning required |
| Plan | Cheap model (Haiku, DeepSeek) | Structured output, well-defined |
| Execute | Strong model (Sonnet) | Final response quality matters |
| Reflect | Cheap model (Haiku, DeepSeek) | Background task, doesn't block |

## Migration Path

### Phase 1: Extract Loop from Runtime (P0)
```
runtime.ts → remove tool loop
brain.ts → new module with Observe→Understand→Retrieve→Think→Plan→Execute
Runtime still manages session + event bus
```

### Phase 2: Add Think + Plan (P1)
```
Add explicit reasoning step before LLM call
Add plan structure for tool execution
```

### Phase 3: Add Async Reflection (P1)
```
Move reflection to queue (BullMQ or in-memory)
Non-blocking: response sent before reflection completes
```

### Phase 4: Multi-Model (P2)
```
Add model routing: different models for different phases
Cost optimization via tiered model selection
```
