# Architecture Audit Report

## C4 Context Diagram (Current)

```
[User] 鈫?[Channel Adapters] 鈫?[Runtime] 鈫?[Engines] 鈫?[Provider] 鈫?[LLM]
                                          鈫?[Memory] 鈫?[SQLite]
```

### Level 1: System Context

```
CompanionOS (Current)
鈹溾攢鈹€ Channel Layer: QQ / Feishu / WeChat / Web / CLI
鈹溾攢鈹€ App Layer: Fitness Companion only
鈹溾攢鈹€ Engine Layer: 14 packages (core/provider/runtime/memory/companion/...)
鈹斺攢鈹€ Storage Layer: SQLite via @libsql/client
```

### Level 2: Container Diagram

```
Web UI (Hono)      CLI (readline)      QQ Bot (WS)     Feishu Bot (Hono)
      鈹?                  鈹?                鈹?               鈹?      鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹粹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹粹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?                      鈹?              鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈻尖攢鈹€鈹€鈹€鈹€鈹€鈹?              鈹?  Runtime    鈹?              鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?              鈹? 鈹?EventBus鈹? 鈹?              鈹? 鈹?Session 鈹? 鈹?              鈹? 鈹?Queue   鈹? 鈹?              鈹? 鈹?Context 鈹? 鈹?              鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?              鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹?                      鈹?      鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹尖攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?      鈹?              鈹?                  鈹?  鈹屸攢鈹€鈹€鈻尖攢鈹€鈹€鈹?   鈹屸攢鈹€鈹€鈹€鈹€鈹€鈻尖攢鈹€鈹€鈹€鈹€鈹€鈹?   鈹屸攢鈹€鈹€鈹€鈹€鈹€鈻尖攢鈹€鈹€鈹?  鈹侻emory  鈹?   鈹? Companion  鈹?   鈹?Provider 鈹?  鈹侾rofile 鈹?   鈹?Relationship鈹?   鈹?Anthropic鈹?  鈹?Store   鈹?   鈹? Growth     鈹?   鈹?DeepSeek 鈹?  鈹俁eflect 鈹?   鈹? Workflow   鈹?   鈹?Registry 鈹?  鈹斺攢鈹€鈹€鈹攢鈹€鈹€鈹?   鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹?   鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?      鈹?              鈹?  鈹屸攢鈹€鈹€鈻尖攢鈹€鈹€鈹?   鈹屸攢鈹€鈹€鈹€鈹€鈹€鈻尖攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹?SQLite 鈹?   鈹? Knowledge  鈹?  鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹?   鈹? + Persona   鈹?               鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

---

## Package Dependency Graph

```
@viraha/core        (no deps 鈥?pure types)
@viraha/db          鈫?core
@viraha/provider    鈫?core
@viraha/runtime     鈫?core, db, provider, memory, companion  鈫?OVER-COUPLED
@viraha/memory      鈫?core, db, provider
@viraha/companion   鈫?core, db
@viraha/presence    鈫?core, db
@viraha/growth      鈫?core, db
@viraha/knowledge   鈫?core, db, provider
@viraha/persona     鈫?core
@viraha/workflow    鈫?core, db, provider
@viraha/channel     鈫?core
@viraha/scheduler   鈫?core
@viraha/sdk         鈫?ALL  鈫?FAT BULLET
```

### Critical Issues

1. **@viraha/runtime depends on @viraha/memory and @viraha/companion** 鈥?violates Clean Architecture. Runtime should depend on interfaces, not implementations.

2. **@viraha/sdk depends on EVERYTHING** 鈥?creates a circular dependency risk and makes SDK a God Package.

3. **No event-driven boundaries** 鈥?packages import each other directly. There's no event-based communication between engines.

4. **@viraha/scheduler is empty** 鈥?dead code.

---

## Event Flow (Current State)

**There is no event system.** The EventBus in runtime.ts is a bare Pub/Sub with 0 subscribers:

```typescript
// runtime.ts line 61 鈥?THE ONLY emit
this.events.emit("turn:complete", { userId, sessionId, reply: result.content })
```

No engine listens to events. All communication is direct method calls:
- `memory.profile.getProfile()` 鈥?direct call from runtime
- `companion.relationship.getOrCreate()` 鈥?direct call from runtime
- `reflection.reflect()` 鈥?direct call from onAfterTurn callback

**Verdict: Event system is non-existent.** Adding proper event-driven architecture is P0.

---

## Runtime Lifecycle (Current)

```
start(config)
  鈹斺攢 store config
runTurn(externalId, input)
  鈹溾攢 resolve provider
  鈹溾攢 ensureUser 鈫?direct call to memory
  鈹溾攢 getOrCreateSession 鈫?direct call to sessions
  鈹溾攢 onBeforeTurn callback 鈫?direct call to companion
  鈹溾攢 buildPromptTiers 鈫?direct call to memory + companion
  鈹溾攢 getSessionMessages 鈫?DB query
  鈹溾攢 assemble prompt
  鈹溾攢 provider.chat(messages, tools)  鈹€鈹€ tool loop 鈹€鈹€ max 5 iterations
  鈹?  鈹斺攢 handleToolCall callback
  鈹溾攢 storeMessage 鈫?DB insert (x2)
  鈹溾攢 onAfterTurn callback 鈫?direct calls to companion + reflection
  鈹斺攢 emit "turn:complete"
```

### Problems

1. **Tool loop is hardcoded at max 5 iterations** 鈥?should be configurable
2. **onBeforeTurn and onAfterTurn are callbacks** 鈥?should be events
3. **Runtime directly calls memory and companion** 鈥?should depend on abstractions
4. **Context assembly is inline in runTurn** 鈥?should be a separate pipeline
5. **No error boundary** 鈥?an exception in any step crashes the entire turn

---

## Message Pipeline (Current)

```
User Input
  鈹?  鈻?Channel Adapter 鈹€鈹€ normalize to InboundMessage
  鈹?  鈻?Runtime.runTurn()
  鈹溾攢 1. Resolve Provider
  鈹溾攢 2. Ensure User
  鈹溾攢 3. Get/Create Session
  鈹溾攢 4. Load History
  鈹溾攢 5. Build Prompt Tiers
  鈹溾攢 6. Assemble System Prompt
  鈹溾攢 7. Build Message Array (system + history + user)
  鈹溾攢 8. LLM Call (with tool definitions)
  鈹?     鈹溾攢 8a. If tool call 鈫?execute 鈫?append result 鈫?goto 8
  鈹?     鈹斺攢 8b. No tool call 鈫?done
  鈹溾攢 9. Store Messages
  鈹溾攢 10. Callbacks (reflection, relationship)
  鈹斺攢 11. Return reply
```

### Issues

1. **Steps 4-10 are all in one monolithic function** 鈥?violates SRP
2. **No middleware/interceptor pattern** 鈥?cannot inject behavior between steps
3. **Context assembly and LLM call are tightly coupled** 鈥?cannot test independently
4. **No message normalization after channel adapter** 鈥?each adapter parses differently

---

## Memory Lifecycle (Current)

```
User sends profile info
  鈹?  鈻?LLM conversation (profile info mentioned in dialogue)
  鈹?  鈻?ReflectionEngine.reflect() [fire & forget]
  鈹溾攢 call LLM with extraction prompt
  鈹溾攢 parse JSON result
  鈹溾攢 applyProfile() 鈫?direct DB write
  鈹溾攢 applyFacts() 鈫?direct DB write
  鈹斺攢 applyEmotion() 鈫?direct DB write
  鈹?  鈻?Next turn 鈫?MemoryEngine.buildMemoryContext()
  鈹溾攢 getProfileSummary() 鈫?DB read
  鈹斺攢 getMemorySummary() 鈫?DB read
  鈹?  鈻?Injected into volatile tier of system prompt
```

### Critical Problems

1. **Reflection is synchronous fire-and-forget** 鈥?if reflection takes too long, it blocks the next turn
2. **No memory retrieval ranking** 鈥?ALL memories are injected, no relevance filtering
3. **No memory eviction** 鈥?memory_entries table grows unbounded
4. **No deduplication** 鈥?multiple reflections can create duplicate entries
5. **Reflection uses the SAME model as conversation** 鈥?expensive, should use cheaper model
6. **Extraction prompt is hardcoded** 鈥?not configurable per knowledge domain
7. **No importance scoring** 鈥?all memories treated equally
8. **No vector search** 鈥?pure keyword FTS5, no semantic understanding
9. **At 10,000 memories**, the memory summary will blow the context window

---

## Context Lifecycle (Current)

```
buildPromptTiers(userId)
  鈹溾攢 getProfileSummary() 鈫?DB query
  鈹溾攢 getMemorySummary() 鈫?ALL entries from DB
  鈹溾攢 getOrCreate() 鈫?relationship state
  鈹溾攢 getRelationshipSummary() 鈫?format
  鈹斺攢 getGoalSummary() 鈫?DB query

Stable: [system prompt, persona, tool defs]
Context: [profile summary]
Volatile: [memories, relationship, goals]
Ephemeral: [] 鈫?ALWAYS EMPTY
```

### Problems

1. **Ephemeral tier is always empty** 鈥?defeats the purpose of 4-tier design
2. **No knowledge injection** 鈥?knowledge engine is never called
3. **No relevant memory filtering** 鈥?ALL memories included, no relevance
4. **Context assembly has no token budget awareness** 鈥?will overflow with many memories
5. **Profile and memories are fetched every turn** 鈥?no caching
6. **No message limit enforcement** 鈥?full history included without truncation

---

## Tool Lifecycle (Current)

```
Runtime.runTurn()
  鈹溾攢 tools: trainingTools + nutritionTools
  鈹溾攢 passed to provider.chat({ tools })
  鈹?  鈻?LLM decides to call a tool
  鈹?  鈻?Runtime.handleToolCall(name, args, userId)
  鈹溾攢 find tool by name
  鈹斺攢 tool.handler(args, { userId, training, nutrition })
      鈹?      鈻?  result string 鈫?added to message array
  鈹?  鈻?Loop back to LLM (max 5 iterations)
```

### Problems

1. **Tool context is a union type with `as any` casts** 鈥?type unsafe
2. **Tool discovery is linear search** 鈥?O(n) per tool call
3. **No tool permissions** 鈥?any tool can be called by the LLM
4. **No tool call tracking** 鈥?cannot audit which tools were called when
5. **Tool results are always strings** 鈥?no structured result type
6. **No tool retry** 鈥?if tool fails, the error goes to LLM as-is
7. **Tool registration is hardcoded in setup.ts** 鈥?not extensible from outside

---

## Prompt Lifecycle (Current)

```
4-tier Prompt Assembly
  鈹?Stable:  Persona + Tool Instructions + Coach Personality
Context: Profile Summary
Volatile: Memory Summary + Relationship + Goals
Ephemeral: (empty)
  鈹?  鈻?Joined with "\n" separators
  鈹?  鈻?Concat with: [system prompt] + [history messages] + [user input]
  鈹?  鈻?Sent to LLM
```

### Problems

1. **4 tiers are not cacheable** 鈥?Stable tier changes rarely but is rebuilt every turn
2. **No token budget tracking** 鈥?no mechanism to limit context window usage
3. **Ephemeral tier unused** 鈥?planned for conversation history but never populated
4. **No compression** 鈥?when history exceeds token limit, there's no summarization
5. **No relevance-aware truncation** 鈥?oldest messages are dropped, not least relevant
6. **Persona prompt is a flat array of strings** 鈥?not structured or versioned

---

## SOLID Violations

### Single Responsibility (S)

| File | Violation |
|------|-----------|
| `runtime/src/runtime.ts` | runTurn() does: user resolution, session, context assembly, LLM call, tool loop, message storage, callbacks, event emit |
| `setup.ts` | Wires DB, providers, runtime, tools, handlers, presence 鈥?should be separate bootstrap |
| `memory/src/reflection.ts` | extract, parse, apply profile/facts/emotion in one class |

### Open/Closed (O)

| Issue | Detail |
|-------|--------|
| Tool system requires modifying setup.ts | Adding new tools = edit setup.ts, not extend |
| Provider registry is enum-like | Adding new provider = edit registry.ts |
| Channel adapters have no plugin API | Must create new app to add a channel |

### Liskov Substitution (L)

| Issue | Detail |
|-------|--------|
| LLMProvider interface has optional `embed?` | Consumers must check existence 鈥?breaks polymorphism |
| ToolContext uses `as any` type casts | Training and nutrition tools have incompatible context types |

### Interface Segregation (I)

| Issue | Detail |
|-------|--------|
| SDK imports ALL engines | Consumer may only need chat + memory, but forced to import companion/growth/workflow |
| ChannelAdapter has single `start(handler)` | Doesn't distinguish between push (WS) and pull (HTTP) adapters |

### Dependency Inversion (D)

| Issue | Detail |
|-------|--------|
| Runtime depends on concrete MemoryEngine | Should depend on `MemoryPort` interface |
| Runtime depends on concrete CompanionEngine | Should depend on `CompanionPort` interface |
| Apps import engines directly | Should import from SDK or adapter interfaces |

---

## Hidden Bug Risks

| Risk | Location | Severity |
|------|----------|----------|
| `initDb()` is a singleton 鈥?calling with different paths creates errors | `packages/db/src/client.ts` | HIGH 鈥?will silently use wrong database |
| `applyEmotion` stores JSON as memory content but content is `TEXT NOT NULL` with no validation | `memory/src/reflection.ts:135` | MEDIUM 鈥?SQLite binding errors (seen in testing) |
| `calculateStreak` assumes dates are sorted descending | `presence/src/conditions.ts:114` | MEDIUM 鈥?if DB returns wrong order, streak is wrong |
| Tool loop has no timeout 鈥?hung tool could block forever | `runtime/src/runtime.ts:61` | HIGH 鈥?can freeze the agent |
| `storeMessage` uses `sql\`message_count + 1\`` with `as any` | `runtime/src/session.ts:65` | MEDIUM 鈥?type bypass |
| No transaction boundaries for multi-step writes | `runtime/src/runtime.ts:57-58` | MEDIUM 鈥?partial writes on crash |
| Memory context grows unbounded 鈥?`getMemorySummary` loads ALL entries | `memory/src/engine.ts:27` | CRITICAL 鈥?will OOM at scale |
| `searchFoods` node_modules lookup path is relative | `nutrition/foods.ts:13` | MEDIUM 鈥?breaks when running from different CWD |

---

## Future Expansion Blockers

| Area | Blocker | Why |
|------|---------|-----|
| 100+ Personas | `PersonaEngine` stores all prompts in memory | 100 persona files 脳 30KB = 3MB 鈥?fine, but no lazy loading |
| 100+ Knowledge Packs | `KnowledgeLoader` loads all chunks into memory | 100 packs 脳 100 chunks 脳 2KB = 20MB 鈥?will work but no streaming |
| 100+ Tools | Linear search in tool handler is O(n) | 100 tools is fine, but 1000+ needs a HashMap |
| 10M+ Memories | No pagination, ranking, or eviction | Will crash at ~50K entries |
| Multi-region Deployment | SQLite cannot scale horizontally | PostgreSQL migration needed |
| Plugin Ecosystem | No plugin system or dependency injection | Every new package = edit setup.ts |
| Real-time Voice | No streaming provider support | Provider layer has no streaming-first design |
| Multi-User SaaS | No tenant isolation | Users share same SQLite database |

---

## Summary: Key Findings

### Must Fix (P0)
1. Event system is non-functional 鈥?0 subscribers, 1 emit
2. Runtime violates DIP 鈥?depends on concrete engines
3. Memory grows unbounded 鈥?no eviction, ranking, or pagination
4. Context assembly has no token budget 鈥?will OOM
5. Reflection blocks the agent response 鈥?fire-and-forget with no queue
6. Tool results are untyped strings 鈥?audit and retry absent

### Should Fix (P1)
7. Provider has no streaming-first API 鈥?streaming is an afterthought
8. Ephemeral prompt tier is unused
9. Channel adapters have no plugin architecture
10. setup.ts is a God object

### Future Concern (P2)
11. SQLite limits to single-process usage
12. No event-driven module communication
13. Knowledge RAG has no reranking
14. Persona system is flat file-based

### Acceptable (P3)
15. Monorepo structure with pnpm workspaces
16. Basic types in @viraha/core
17. DB schema with 15 tables
18. Basic CLI interface

