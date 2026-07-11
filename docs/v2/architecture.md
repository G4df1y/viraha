# Viraha v2: Autonomous Agent Runtime

## Architecture Overview

```
Current (v1):                          Target (v2):

User → Prompt → LLM → Reply           User → Pipeline → Agent → Reply
           ↑ Tool                         ↑ 12 independent stages
         ChatBot                          ↓ Autonomous Agent
```

v1 is a **Prompt-driven ChatBot**. v2 is a **Decision-first Autonomous Agent**.

## Two-Layer Architecture

```
VIRAHA FRAMEWORK (packages/)
│
├── identity/        → Generic identity model
├── intent/          → Generic intent analysis
├── planner/         → Generic execution planning
├── skills/          → Generic skill system
├── mcp/             → Generic MCP framework
├── reasoning/       → Generic reasoning loop
├── reflection/      → Generic reflection engine
├── runtime/         → Generic pipeline orchestrator
├── provider/        → LLM provider abstraction
├── relationship/    → Generic relationship model
├── memory/          → Generic memory store
├── presence/        → Generic proactive engine
└── ...              → All generic, 0 domain-specific code

ARETE (apps/arete/)
│
├── identity.ts      → "I am Arete, a fitness companion"
├── skills/
│   ├── workout-coach/   → Fitness-specific skill
│   ├── nutrition-coach/ → Nutrition-specific skill
│   └── progress/        → Progress analysis skill
├── training/        → Exercise library, workout plans
├── nutrition/       → Food database, meal tracking
└── ui/              → Web dashboard

THIRD-PARTY (future)
│
├── sophia/          → "I am Sophia, a study companion"
│   └── skills/study-coach/
│
└── techne/          → "I am Techne, a writing companion"
    └── skills/writing-coach/
```

**Key rule:** `packages/` contains zero application-specific code. The word "fitness" never appears in any package. Everything domain-specific lives in `apps/arete/` and is loaded as a **companion pack** at runtime.

---

## System Context (Level 1)

```
[User] → [Channel Adapter] → [Viraha Agent Runtime] → [Channel Adapter] → [User]
                                    │
                    ┌───────────────┼───────────────────┐
                    │               │                   │
              [Memory Store]   [Knowledge]        [Skill Registry]
                    │               │                   │
              [SQLite/PG]     [Vector DB]      [MCP Servers / APIs]
```

---

## Container Diagram (Level 2)

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Viraha Agent Runtime                            │
│                                                                        │
│  Incoming Message                                                      │
│       │                                                                │
│       ▼                                                                │
│  ┌──────────┐                                                          │
│  │ Identity  │── Who am I? What can I do? What are my limits?          │
│  │  Engine   │   Returns: Identity Object (not prompt)                 │
│  └────┬─────┘                                                          │
│       ▼                                                                │
│  ┌──────────┐                                                          │
│  │  Intent   │── What does the user want? What priority?               │
│  │  Engine   │   Returns: Intent Object                                 │
│  └────┬─────┘                                                          │
│       ▼                                                                │
│  ┌──────────┐                                                          │
│  │ Context   │── What context do we need? Gather in parallel:           │
│  │ Collector│   ├─ Memory Router (profile, facts, episodes, goals)     │
│  │           │   ├─ Knowledge Router (which packs, how many chunks)    │
│  │           │   ├─ Skill Router (which skills are relevant)           │
│  │           │   ├─ MCP Router (which MCP servers to call)             │
│  │           │   └─ Web Search (if needed)                             │
│  └────┬─────┘                                                          │
│       ▼                                                                │
│  ┌──────────┐                                                          │
│  │  Planner  │── What's the plan? Multi-step or single response?       │
│  │           │   Returns: Execution Plan (array of steps)              │
│  └────┬─────┘                                                          │
│       ▼                                                                │
│  ┌──────────────┐                                                      │
│  │  Reasoning   │── Execute each plan step:                            │
│  │    Loop      │   Think → Observe → Act → Observe → Think → ...     │
│  │              │   Until plan complete or max iterations              │
│  └────┬─────────┘                                                      │
│       │                                                                 │
│       ├──→ [Skill Executor]  → Run specific skill                      │
│       ├──→ [MCP Client]      → Call external MCP server               │
│       ├──→ [LLM Call]        → Generate/understand/reason              │
│       └──→ [Tool Executor]   → Run atomic tool                         │
│       │                                                                 │
│       ▼                                                                 │
│  ┌──────────────┐                                                      │
│  │  Reflection  │── Async: What did we learn? Update memory?            │
│  │    Engine    │   Relationship change? Skill success/fail?            │
│  └────┬─────────┘                                                      │
│       ▼                                                                │
│  ┌──────────┐                                                          │
│  │ Response  │── Build final response, stream to channel               │
│  │ Builder   │                                                          │
│  └──────────┘                                                          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Module Dependency Graph

```
identity/        (no deps — pure data)
intent/          → identity
context/         → identity, intent, memory, knowledge, skills, mcp
planner/         → context, identity
reasoning/       → planner, skills, mcp, llm
skills/          → registry, manifest
mcp/             → mcp-manager
router/          → memory-router, knowledge-router, skill-router, mcp-router
reflection/      → memory, relationship
response/        → identity
execution/       → skills, mcp, tools, llm
```

**Dependency Inversion**: Every module depends on interfaces (ports), not concrete implementations. The `context/` module depends on `MemoryPort`, not `MemoryEngine`.

---

## Data Flow: Complete Turn

```
Step 1: INCOMING
  Channel Adapter emits UserMessageReceived event
  │
Step 2: IDENTITY
  IdentityEngine.load(agentId) → IdentityObject
  │   { name: "Arete", type: "fitness", persona: "coach",
  │     skills: ["workout-coach", "nutrition-coach", ...],
  │     mcp: ["weather", "calendar", ...],
  │     limits: { maxTokens: 8000, maxSteps: 10 },
  │     longTermGoal: "Help user achieve fitness goals" }
  │
Step 3: INTENT
  IntentEngine.analyze(message, identity) → IntentObject
  │   { type: "query" | "command" | "plan" | "reflection" | "social",
  │     priority: "low" | "normal" | "high" | "urgent",
  │     needsSearch: boolean,
  │     needsMemory: boolean,
  │     needsKnowledge: boolean,
  │     needsPlanning: boolean,
  │     needsTools: string[],
  │     entities: { exercises?: [], foods?: [], dates?: [] },
  │     sentiment: "positive" | "neutral" | "negative",
  │     urgency: 1-10 }
  │
Step 4: CONTEXT COLLECTION (parallel)
  ContextCollector.collect(identity, intent) → Context
  │   ├── MemoryRouter.getProfile(userId)
  │   ├── MemoryRouter.getFacts(userId, intent.entities)
  │   ├── MemoryRouter.getRecentEpisodes(userId, limit=5)
  │   ├── MemoryRouter.getActiveGoals(userId)
  │   ├── KnowledgeRouter.query(intent, packs=["fitness"])
  │   ├── SkillRouter.findRelevant(intent) → Skill[]
  │   ├── MCPRouter.findRelevant(intent) → MCPServer[]
  │   └── WebSearch (if intent.needsSearch)
  │
Step 5: PLANNING
  Planner.plan(intent, context) → ExecutionPlan
  │   { steps: [
  │       { type: "skill" | "mcp" | "llm" | "tool" | "search",
  │         name: "workout-coach",
  │         input: { ... },
  │         dependsOn: [] },
  │       ...
  │     ],
  │     maxSteps: 5,
  │     fallback: "I'm not sure how to help with that." }
  │
Step 6: REASONING LOOP
  ReasoningLoop.execute(plan) → ExecutionResult
  │   for each step in plan:
  │     1. THINK: LLM call ("What should I do for this step?")
  │     2. OBSERVE: Check available data
  │     3. ACT: Execute skill / call MCP / run tool / call LLM
  │     4. OBSERVE: Check result
  │     → Continue until plan complete
  │     → If step fails: retry or fallback
  │
Step 7: REFLECTION (async, non-blocking)
  ReflectionEngine.reflect(executionResult) → ReflectionObject
  │   { learned: string[],
  │     memoryUpdates: MemoryDelta[],
  │     relationshipDelta: { trust: ±N, intimacy: ±N },
  │     skillFeedback: { skill: "workout-coach", success: true },
  │     plannerFeedback: { planAccurate: true } }
  │   └─→ Apply to MemoryStore
  │   └─→ Apply to RelationshipEngine
  │   └─→ Apply to SkillRegistry (update stats)
  │
Step 8: RESPONSE
  ResponseBuilder.build(executionResult, identity) → string
  │   └─→ Stream to channel
```

---

## Directory Structure (Target)

```
viraha/
├── packages/
│   ├── core/              → Types, ports, interfaces (no runtime code)
│   ├── db/                → Database layer (SQLite/PG)
│   │
│   ├── identity/          → 🔄 NEW — Identity Engine
│   │   ├── src/
│   │   │   ├── engine.ts     → IdentityEngine (load/save/update)
│   │   │   ├── types.ts      → IdentityObject, Capability, Limit
│   │   │   └── index.ts
│   │
│   ├── intent/            → 🔄 NEW — Intent Engine
│   │   ├── src/
│   │   │   ├── engine.ts     → IntentEngine (analyze/classify)
│   │   │   ├── types.ts      → IntentObject
│   │   │   └── index.ts
│   │
│   ├── context/           → 🔄 NEW — Context Collector (replaces old context/)
│   │   ├── src/
│   │   │   ├── collector.ts  → ContextCollector (orchestrates routers)
│   │   │   ├── memory-router.ts  → Which memories to fetch
│   │   │   ├── knowledge-router.ts → Which knowledge to query
│   │   │   ├── skill-router.ts    → Which skills are relevant
│   │   │   ├── mcp-router.ts      → Which MCP servers to use
│   │   │   └── index.ts
│   │
│   ├── planner/           → 🔄 NEW — Planner Engine
│   │   ├── src/
│   │   │   ├── engine.ts     → Planner (plan/validate/optimize)
│   │   │   ├── types.ts      → ExecutionPlan, PlanStep
│   │   │   └── index.ts
│   │
│   ├── reasoning/         → 🔄 NEW — Reasoning Loop
│   │   ├── src/
│   │   │   ├── loop.ts       → ReasoningLoop (think→observe→act)
│   │   │   └── index.ts
│   │
│   ├── skills/            → 🔄 NEW — Skill System (replaces ad-hoc tools)
│   │   ├── src/
│   │   │   ├── registry.ts   → SkillRegistry (register/find/load)
│   │   │   ├── executor.ts   → SkillExecutor (run/retry/fallback)
│   │   │   ├── manifest.ts   → SkillManifest interface
│   │   │   └── index.ts
│   │   └── builtin/       → Built-in skills
│   │       ├── workout-coach/   → Training plans, logging
│   │       ├── nutrition-coach/ → Meal tracking, macros
│   │       ├── progress-analysis/ → Charts, trends
│   │       └── search/          → Web search
│   │
│   ├── mcp/               → 🔄 NEW — MCP Framework
│   │   ├── src/
│   │   │   ├── manager.ts    → MCPManager (discovery/connect/cache)
│   │   │   ├── client.ts     → MCPClient (execute tool)
│   │   │   └── index.ts
│   │
│   ├── reflection/        → 🔄 NEW — Reflection Engine
│   │   ├── src/
│   │   │   ├── engine.ts     → ReflectionEngine (analyze/learn)
│   │   │   └── index.ts
│   │
│   ├── execution/         → 🔄 NEW — Execution Engine
│   │   ├── src/
│   │   │   ├── engine.ts     → ExecutionEngine (run plan steps)
│   │   │   └── index.ts
│   │
│   ├── response/          → 🔄 NEW — Response Builder
│   │   ├── src/
│   │   │   ├── builder.ts    → ResponseBuilder (format/stream)
│   │   │   └── index.ts
│   │
│   ├── runtime/           → 🔄 REWRITE — Agent Runtime (new pipeline)
│   │   ├── src/
│   │   │   ├── pipeline.ts   → Main pipeline (orchestrates all engines)
│   │   │   ├── event-bus.ts  → EventBus (kept)
│   │   │   └── index.ts
│   │
│   ├── provider/          → KEEP — LLM provider abstraction
│   ├── rag/               → RENAME from knowledge/ — RAG engine
│   ├── relationship/      → KEEP — Relationship engine
│   ├── presence/          → KEEP — Proactive scheduling
│   ├── growth/            → KEEP — Achievements
│   └── sdk/               → UPDATE — New SDK reflecting v2 API
│
├── apps/
│   └── arete/             → UPDATE — Uses new runtime
│
└── skills/                → 🔄 NEW — Skill packages (installable)
    ├── workout-coach/     → Skill: workout planning & logging
    ├── nutrition-coach/   → Skill: meal tracking & nutrition advice
    └── search/            → Skill: web search
```

---

## Identity Object

```typescript
interface IdentityObject {
  // Core
  agentId: string
  name: string                    // "Arete"
  type: "companion" | "assistant" | "coach" | "agent"
  version: string                 // "2.0.0"
  
  // Description
  description: string             // "Official Fitness Companion"
  backstory: string               // "I was built on Viraha..."
  
  // Capabilities
  capabilities: Capability[]      // What I can do
  skills: string[]                // Installed skills
  mcpServers: string[]            // Connected MCP servers
  
  // Limits
  limits: {
    maxConcurrency: number
    maxPlanSteps: number
    maxTokensPerTurn: number
    maxReflectionDepth: number
  }
  
  // Long-term
  longTermGoal: string            // "Help user achieve fitness"
  coreValues: string[]            // ["consistency > intensity", ...]
  boundaries: Boundary[]          // Topics to avoid
  
  // Persona
  personaId: string
  persona: {                      // Snapshot, not prompt
    name: string
    traits: string[]
    style: string
    catchphrases?: string[]
    humorLevel: number            // 1-10
    formality: number             // 1-10
    empathyLevel: number          // 1-10
  }
  
  // Active
  activePersonaId: string
  activeSkills: string[]
  activeMCPs: string[]
}
```

---

## Intent Object

```typescript
interface IntentObject {
  type: IntentType
    // "query" | "command" | "plan" | "analyze" | "social" |
    // "reflect" | "schedule" | "learn" | "unknown"
  
  priority: "low" | "normal" | "high" | "urgent"
  urgency: number             // 1-10
  
  // Requirements
  needsMemory: boolean
  needsKnowledge: boolean
  needsSearch: boolean
  needsPlanning: boolean
  needsTools: string[]        // Specific tools needed
  needsSkills: string[]       // Specific skills needed
  needsMCP: string[]          // Specific MCP servers
  
  // Extracted
  entities: {
    exercises?: string[]
    foods?: string[]
    dates?: string[]
    goals?: string[]
    metrics?: string[]          // weight, reps, etc.
  }
  
  // Sentiment
  sentiment: "positive" | "neutral" | "negative" | "frustrated"
  emotion?: string              // "motivated", "tired", "guilty", etc.
  
  // Raw
  rawMessage: string
  confidence: number            // 0-1, how confident the engine is
}
```

---

## Execution Plan

```typescript
interface ExecutionPlan {
  steps: PlanStep[]
  maxSteps: number
  parallelGroups: number[][]      // Steps that can run in parallel
  
  fallbackMessage: string         // If plan fails entirely
  estimatedTokens: number
}

type StepType = "skill" | "mcp" | "llm" | "tool" | "search" | "memory_read" | "memory_write"

interface PlanStep {
  id: string
  type: StepType
  name: string                    // Skill name, MCP tool, etc.
  input: Record<string, unknown>
  
  dependsOn: string[]             // Step IDs this depends on
  
  retryCount: number
  timeoutMs: number
  
  fallback?: PlanStep             // Alternative step on failure
  
  onSuccess?: string              // Event to emit
  onFailure?: string              // Event to emit
}
```

---

## Skill Manifest

```typescript
interface SkillManifest {
  id: string                      // "workout-coach"
  name: string                    // "Workout Coach"
  version: string                 // "1.0.0"
  description: string
  
  author?: string
  license?: string
  
  // Dependencies
  dependencies: {
    skills?: string[]
    mcp?: string[]
    tools?: string[]
  }
  
  // Triggers: when is this skill activated?
  triggers: {
    intentTypes: IntentType[]
    keywords: string[]
    entities: string[]
  }
  
  // Capabilities
  capabilities: {
    input: Record<string, unknown>  // JSON Schema
    output: Record<string, unknown> // JSON Schema
    examples: Array<{ query: string; response: string }>
  }
  
  // Limits
  limits: {
    maxInputLength?: number
    maxRuntime?: number
    needsUserConfirmation?: boolean
  }
}
```

---

## Event Flow

```
1. UserMessageReceived          → Pipeline starts
2. IdentityLoaded               → Identity ready
3. IntentAnalyzed               → Intent ready
4. ContextCollecting            → Gathering context
5. ContextCollected             → Context ready
6. PlanCreated                  → Execution plan ready
7. StepExecuting                → Running plan step N
8. StepCompleted                → Step N done
9. ToolCalled                   → Tool was invoked
10. SkillExecuted               → Skill completed
11. MCPCalled                   → MCP server called
12. ReasoningCycle              → Think→Observe→Act cycle
13. PlanComplete                → All steps done
14. Reflecting                  → Async reflection started
15. ReflectionComplete          → Reflection done
16. AgentResponseSent           → Response sent to channel
17. ErrorOccurred               → Pipeline error
```

---

## Migration Plan

### Phase 1: Foundation (1 week)
1. Create `packages/identity/` — IdentityObject, IdentityEngine
2. Create `packages/intent/` — IntentObject, IntentEngine (LLM-based classifier)
3. Create `packages/planner/` — ExecutionPlan, Planner
4. Define all interfaces in `packages/core/`

### Phase 2: Pipeline (1 week)
5. Rewrite `packages/runtime/pipeline.ts` — New 8-stage pipeline
6. Replace old `runtime.runTurn()` with new pipeline
7. Wire Identity → Intent → Planner → Execution → Response flow

### Phase 3: Context + Reasoning (1 week)
8. Build `packages/context/` — MemoryRouter, KnowledgeRouter, ContextCollector
9. Build `packages/reasoning/` — ReasoningLoop (Think→Observe→Act)
10. Build `packages/reflection/` — ReflectionEngine

### Phase 4: Skills + MCP (1 week)
11. Build `packages/skills/` — SkillRegistry, SkillExecutor, SkillManifest
12. Build `packages/mcp/` — MCPManager, MCPClient
13. Migrate existing tools to Skill manifests

### Phase 5: Integration (1 week)
14. Update `apps/arete/` to use new runtime
15. Update SDK
16. Remove old context builder, old tool handler
17. End-to-end testing

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pipeline vs Graph | **Pipeline with parallel stages** | Simpler to debug, easier to extend, each stage is a function |
| Identity vs Prompt | **Identity Object** | Agent can introspect itself, not rely on prompt injection |
| Intent vs Blind LLM | **Intent Engine first** | Prevents LLM from generating responses before understanding |
| Planner vs ReAct | **Explicit Planner** | Multi-step plans are debuggable, observable, optimizable |
| Skills vs Tools | **Skills as first-class** | Skills have manifests, versions, dependencies—tools don't |
| MCP vs Direct API | **MCP Manager** | Standardized discovery, auth, retry, caching |
| Reflection vs Forget | **Async Reflection** | Non-blocking, learn from every interaction |
| Reasoning Loop vs Single LLM | **Think→Observe→Act** | True autonomous behavior, not just prompt engineering |
