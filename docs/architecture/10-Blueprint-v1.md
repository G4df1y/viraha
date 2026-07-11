# CompanionOS v1.0 Blueprint

## Target Architecture

```
鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?                     CompanionOS v1.0                              鈹?鈹?                                                                   鈹?鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹? 鈹?  Pack Layer    鈹? 鈹? Channel Layer  鈹? 鈹?   UI Layer          鈹?鈹?鈹? 鈹?                鈹? 鈹?                鈹? 鈹?                     鈹?鈹?鈹? 鈹?pack-fitness    鈹? 鈹?QQ Adapter      鈹? 鈹?Web Dashboard        鈹?鈹?鈹? 鈹?pack-study      鈹? 鈹?Feishu Adapter  鈹? 鈹?CLI (dev)            鈹?鈹?鈹? 鈹?pack-writing    鈹? 鈹?WeChat Adapter  鈹? 鈹?Mobile (future)      鈹?鈹?鈹? 鈹?pack-creator    鈹? 鈹?Telegram (fut.) 鈹? 鈹?                     鈹?鈹?鈹? 鈹?pack-life       鈹? 鈹?Discord (fut.)  鈹? 鈹?                     鈹?鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹?          鈹?                  鈹?                      鈹?           鈹?鈹?          鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹粹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?           鈹?鈹?                      鈹?                                          鈹?鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈻尖攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹? 鈹?                     Runtime Layer                              鈹?鈹?鈹? 鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹?鈹? 鈹? 鈹?Runtime   鈹?鈹?EventBus 鈹?鈹?Companion鈹?鈹?  Context        鈹?鈹?鈹?鈹? 鈹? 鈹?(session, 鈹?鈹?(typed)  鈹?鈹?  Brain  鈹?鈹?  Builder        鈹?鈹?鈹?鈹? 鈹? 鈹? queue)   鈹?鈹?         鈹?鈹?(8-phase) 鈹?鈹?  (7 collectors) 鈹?鈹?鈹?鈹? 鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹?                      鈹?                                           鈹?鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈻尖攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹? 鈹?                  Engine Layer                                 鈹?鈹?鈹? 鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹?鈹? 鈹? 鈹侻emory鈹?鈹侰ompan鈹?鈹侴rowth鈹?鈹俉orkfl鈹?鈹侹nowle鈹?鈹? Provider  鈹?鈹?鈹?鈹? 鈹? 鈹?rank)鈹?鈹?state鈹?鈹?achie鈹?鈹?goal)鈹?鈹?RAG) 鈹?鈹? (model    鈹?鈹?鈹?鈹? 鈹? 鈹?     鈹?鈹?mach) 鈹?鈹?ve)  鈹?鈹?     鈹?鈹?     鈹?鈹? registry) 鈹?鈹?鈹?鈹? 鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹?                      鈹?                                          鈹?鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈻尖攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹? 鈹?                 Storage Layer                                 鈹?鈹?鈹? 鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?                  鈹?鈹?鈹? 鈹? 鈹? PostgreSQL       鈹? 鈹? Redis            鈹?                 鈹?鈹?鈹? 鈹? 鈹? (users, mems,    鈹? 鈹? (cache, queue,   鈹?                 鈹?鈹?鈹? 鈹? 鈹?  sessions, goals)鈹? 鈹?  rate limit)     鈹?                 鈹?鈹?鈹? 鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?                  鈹?鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

---

## Priority Rankings

### P0 鈥?Must Fix Before Any Feature Work

These are blocking issues that will cause data loss, crashes, or prevent the system from working at all with real users.

| # | Issue | Module | Effort | Risk | Return | Cost of Delay |
|---|-------|--------|--------|------|--------|---------------|
| 1 | **Memory grows unbounded** | memory | 3 days | HIGH | Prevents crash at 500+ mems | Immediate |
| 2 | **Event system unused** | runtime | 2 days | MEDIUM | Foundation for all module communication | Immediate |
| 3 | **Runtime violates DIP** | runtime | 2 days | MEDIUM | Enables testing and modularity | Immediate |
| 4 | **Context assembly inline in runtime** | context | 1 day | LOW | Extract ContextBuilder as separate module | Immediate |
| 5 | **Context has no token budget** | context | 2 days | MEDIUM | Prevents prompt overflow | Immediate |
| 6 | **Reflection blocks response** | memory | 1 day | LOW | Response time currently includes reflection | Immediate |
| 7 | **Tool results untyped** | runtime | 1 day | LOW | Prevents structured error handling | Medium-term |
| 8 | **Single-user only** | db | 2 days | MEDIUM | Foundation for multi-tenancy | Medium-term |

**Total P0 effort: ~14 days**

### P1 鈥?Should Fix in Next Sprint

These are architectural improvements that enable expansion but don't block current usage.

| # | Issue | Module | Effort | Risk | Return |
|---|-------|--------|--------|------|--------|
| 9 | **Relationship Engine redesign** | companion | 3 days | MEDIUM | Transforms companion from "chatbot" to "relationship" |
| 10 | **Companion Brain 8-phase loop** | runtime | 5 days | HIGH | Core differentiator 鈥?required for long-term |
| 11 | **Memory ranking + selection** | memory | 3 days | MEDIUM | Makes memory usable at scale |
| 12 | **Hermes 4-phase compression** | memory | 4 days | MEDIUM | 80% context savings |
| 13 | **Knowledge Engine integration** | context | 2 days | LOW | Currently unused in prompt |
| 14 | **SDK extraction from God package** | sdk | 2 days | LOW | Enables pack ecosystem |
| 15 | **Plugin architecture** | runtime | 5 days | HIGH | Foundation for 100+ packs |
| 16 | **Channel adapter plugin API** | channel | 3 days | MEDIUM | Add channels without new apps |

**Total P1 effort: ~27 days**

### P2 鈥?Future Optimization

These improvements become relevant at 1000+ users or 100+ packs.

| # | Issue | Module | Effort | Risk | Return |
|---|-------|--------|--------|------|--------|
| 17 | **PostgreSQL migration** | db | 3 days | MEDIUM | Required for multi-instance |
| 18 | **Redis caching layer** | infra | 3 days | MEDIUM | 10x read performance |
| 19 | **Multi-tenant row isolation** | db | 2 days | LOW | Required for SaaS |
| 20 | **Event persistence** | event | 2 days | MEDIUM | Event durability |
| 21 | **Model routing (cheap/strong)** | provider | 3 days | MEDIUM | 50% cost reduction |
| 22 | **Memory vector search** | memory | 4 days | HIGH | Semantic understanding |
| 23 | **Knowledge RAG reranking** | knowledge | 2 days | LOW | Better retrieval |
| 24 | **Persona lazy loading** | persona | 1 day | LOW | Memory reduction at 100+ personas |

**Total P2 effort: ~20 days**

### P3 鈥?Don't Fix Now

These are either irrelevant v1 features or premature optimizations.

| # | Issue | Why Low Priority |
|---|-------|-------------------|
| 25 | **Multi-region deployment** | Won't need until 10K+ users |
| 26 | **Kubernetes orchestration** | Overkill for single-server |
| 27 | **Real-time voice support** | New modality, not in scope |
| 28 | **WebRTC / streaming** | No streaming use case |
| 29 | **Full checkpointer** | Session-based state is sufficient |
| 30 | **AutoGen multi-agent** | Single-agent first |
| 31 | **Docker sandbox** | No code execution needed |

**Total P3: ~0 (deferred)**

---

## Implementation Roadmap

### Sprint 1: Foundation Refactor (14 days P0)
```
Week 1:
  Day 1-2: Extract ContextBuilder from Runtime
  Day 3-4: Add token budget enforcement
  Day 5:   Implement Event System with typed events
  
Week 2:
  Day 1-2: Make Runtime depend on interfaces (DIP)
  Day 3:   Make reflection async (non-blocking)
  Day 4:   Add typed tool results
  Day 5:   Add multi-user support (user_id isolation)
```

### Sprint 2: Relationship + Memory (10 days P1)
```
Week 3:
  Day 1-3: Relationship Engine redesign (state machine)
  Day 4-5: Memory ranking algorithm

Week 4:
  Day 1-2: Memory selection (top-K by relevance)
  Day 3-4: Hermes 4-phase compression
  Day 5:   Integration testing
```

### Sprint 3: Companion Brain (10 days P1)
```
Week 5:
  Day 1-2: Observe + Understand phases
  Day 3-4: Retrieve + Think phases
  Day 5:   Plan + Execute phases

Week 6:
  Day 1-2: Async Reflection phase
  Day 3-4: Tool policy system
  Day 5:   Integration testing
```

### Sprint 4: Platformization (10 days P1)
```
Week 7:
  Day 1-2: SDK extraction (independently importable)
  Day 3-5: Plugin architecture (registerTool, registerPack)

Week 8:
  Day 1-2: Knowledge Engine integration in ContextBuilder
  Day 3-4: Channel adapter plugin API
  Day 5:   Documentation + examples
```

---

## Risk Assessment

### High-Risk Items

| Item | Risk | Mitigation |
|------|------|------------|
| Companion Brain 8-phase loop | HIGH 鈥?changes the core loop, may break existing features | Keep backward compat, run in parallel with old loop during transition |
| Plugin architecture | HIGH 鈥?difficult to get right, easy to over-engineer | Start with the simplest possible plugin interface. Evolve. |
| Relationship Engine redesign | MEDIUM 鈥?changes how relationship values are computed | Old values can be migrated with a one-time script |

### Low-Risk Items

| Item | Reason |
|------|--------|
| Extract ContextBuilder | Pure extraction, no behavior change |
| Event System implementation | Adding events doesn't change existing callbacks |
| Token budget enforcement | Backward-compatible default (no limit) |

---

## Success Criteria

| Metric | Current | Sprint 1 | Sprint 4 |
|--------|---------|----------|----------|
| Build status | 鉁?19/19 | 19/19 | 19/19 |
| Test coverage | 0% | 20% | 60% |
| Memory capacity | ~500 | 5000 | 50K |
| Context token waste | 80%+ | 30% | 10% |
| Response time | ~5s | ~5s | ~3s |
| Event coverage | 1 event | 20 events | 40 events |
| Plugin tools | 0 | 0 | 5 |
| Independent SDK modules | 0 | 0 | 7 |

---

## Final Architecture Diagram (Target v1.0)

```
Layer 1: Packs (@companionos/pack-*)
  pack-fitness     pack-study     pack-writing     pack-creator     pack-life
    tools/           tools/          tools/           tools/           tools/
    knowledge/       knowledge/      knowledge/       knowledge/       knowledge/
    personas/        personas/       personas/        personas/        personas/
    ui/              ui/             ui/              ui/              ui/

Layer 2: SDK (@companionos/sdk)
  createCompanion()  MemorySDK  CompanionSDK  PresenceSDK  GrowthSDK  WorkflowSDK

Layer 3: Core (@companionos/core)
  EventBus | Runtime | ContextBuilder | CompanionBrain
  Memory  | Relation | Growth  | Workflow | Knowledge | Persona | Provider
  ChannelAdapters | PluginRegistry | DB

Layer 4: Infrastructure
  PostgreSQL (pgvector) | Redis (cache + queue) | Docker
```

This blueprint turns CompanionOS from a single fitness app into a platform where any digital companion can be built by combining core engines, SDK, and a companion pack.


