# Five-Year Scalability Report

## Current Architecture Limits

### Storage
| Resource | Current Limit | 5-Year Target | Gap |
|----------|--------------|---------------|-----|
| Users | 1 (single-user) | 100K+ | **Massive** — no tenant isolation |
| Conversations per user | Unlimited (SQLite) | 10K+ | OK with indexes |
| Memories per user | 500 (prompt limit) | 100K+ | **Critical** — no ranking/eviction |
| Knowledge chunks | 100 (memory) | 10K+ (100 packs) | OK with lazy loading |
| Concurrent sessions | 1 | 10K+ | **Critical** — no connection pooling |

### Performance
| Scenario | Current | Target | Issue |
|----------|---------|--------|-------|
| 1 user, 1 turn | ~5s | <2s | LLM latency, no streaming |
| 10 concurrent | N/A | <3s | No connection pool, single SQLite |
| 100 concurrent | N/A | <5s | SQLite WAL bottleneck |
| 1000+ concurrent | N/A | <10s | Need PostgreSQL + read replicas |

### Code Architecture
| Concern | Current | Required at Scale |
|---------|---------|-------------------|
| Package coupling | High | Low (event-driven) |
| Plugin system | None | Required for 100+ packs |
| Configuration | Hardcoded | Dynamic per-tenant |
| Monitoring | None | Required |
| Multi-tenant | Single DB | Separate DBs or row-level isolation |

---

## Scaling Scenarios

### Scenario A: 100 Users, 1 Instance (Year 1)
**Feasible?** Yes, with P0 fixes.
- SQLite is fine for 100 users (each with <1000 memories)
- Single process handles 100 users (each <1 request/minute)
- Required changes: multi-user support, memory ranking

### Scenario B: 10K Users, 3 Instances (Year 2-3)
**Feasible?** With significant refactoring.
- PostgreSQL migration required (SQLite max ~10 concurrent writers)
- Read replicas for memory/knowledge queries
- Connection pooling (PgBouncer)
- Session affinity for stateful connections
- Required changes: DB migration, connection pool, stateless runtime

### Scenario C: 100K+ Users, Global (Year 5)
**Feasible?** Only with full redesign.
- Sharded PostgreSQL (by user_id hash)
- Redis for session state and rate limiting
- CDN for knowledge packs
- Multi-region deployment (EU data residency)
- Required changes: sharding, CDN, global event bus
- **This is where CompanionOS becomes a true platform**

---

## Scaling Roadblocks

### Roadblock 1: SQLite Single-Writer (P0—P3 depending on scale)
**At 100 users:** Fine. SQLite handles this.
**At 10K users:** WAL mode helps, but concurrent writes bottleneck.
**Fix:** Swap to PostgreSQL when needed (Drizzle makes this easy).

### Roadblock 2: Monolithic Runtime (P0)
**Issue:** Runtime.runTurn() does everything — session, context, LLM, tools, storage.
**At 100 users:** Fine.
**At 10K users:** Cannot horizontally scale because state is in-memory.
**Fix:** Extract ContextBuilder, make Runtime stateless.

### Roadblock 3: In-Memory Knowledge Packs (P1)
**Issue:** KnowledgeLoader.loadPack() loads all chunks into memory.
**At 100 packs (10K chunks):** ~20MB — fine.
**At 1000 packs (100K chunks):** ~200MB — potentially problematic.
**Fix:** Lazy loading + LRU cache for knowledge chunks.

### Roadblock 4: Single Event Bus (P1)
**Issue:** EventBus is in-process, no persistence.
**At 100 users:** Fine.
**At 10K users:** Events lost on crash, no replay.
**Fix:** Add event persistence (event store table) + optional message queue (RabbitMQ/Redis Streams).

### Roadblock 5: No Caching Layer (P1)
**Issue:** Profile, memories, relationship fetched from DB every turn.
**At 100 users:** DB handles this.
**At 10K users:** DB becomes bottleneck.
**Fix:** Add Redis cache for hot data (profile, relationship, active memories).

### Roadblock 6: No Multi-Tenancy (P0)
**Issue:** Zero tenant isolation. All data in same tables.
**At 100 users:** Tenants share same DB, differentiation by user_id FK.
**At 10K users:** User isolation needed for data privacy.
**Fix:** Row-level security (PostgreSQL RLS) or tenant_id column on every table.

---

## Pack Scalability

### 100+ Knowledge Packs
**Storage:** 100 packs × 50KB average = 5MB. Trivial.
**Search:** Sequential scan of 100 packs × 100 chunks = 10K chunks. Keyword search O(n) is fine. Vector search needs index.
**Verdict:** Architecture holds. No changes needed.

### 100+ Persona Packs
**Storage:** 100 personas × 5KB = 500KB. Trivial.
**Loading:** All in memory. Fine.
**Discovery:** PersonaEngine.list() O(n). Fine.
**Verdict:** Architecture holds.

### 100+ Workflow Packs
**Storage:** 100 workflows × 20KB = 2MB. Trivial.
**Execution:** Workflows are LLM-driven, not code-driven. No performance concern.
**Verdict:** Architecture holds.

### 100+ Channel Adapters
**Storage:** 100 adapters × 2KB = 200KB. Trivial.
**Loading:** Each adapter is a separate process. 100 processes = fine on a server.
**Discovery:** Adapter registry. O(1) lookup.
**Verdict:** Architecture holds if we have a plugin system. Currently would need to create 100 apps.

### 100+ Tool Definitions
**Storage:** 100 tools × 2KB = 200KB. Trivial.
**Retrieval:** Linear search O(100) = fine.
**Policy:** Need multi-layer policy gates (by channel, by persona, by user tier).
**Verdict:** Tool policy system needed, but performance is fine.

---

## Infrastructure Evolution

```
Year 1: Single Server
┌──────────────────────┐
│  Node.js Process      │
│  ├── SQLite (file)    │
│  └── In-memory cache  │
└──────────────────────┘
Scale: 0-1K users
Cost: $10-50/month

Year 2-3: Multi-Service
┌──────────────────────┐
│  Load Balancer        │
│  ├── Node.js Instance 1
│  ├── Node.js Instance 2
│  └── Node.js Instance 3
│  PostgreSQL (Primary)  │
│  ├── PostgreSQL (Replica)
│  └── Redis (Cache + Queue)
└──────────────────────┘
Scale: 1K-10K users
Cost: $200-1000/month

Year 4-5: Global Platform
┌──────────────────────────────────────┐
│  Global Load Balancer                  │
│  ├── Region 1: EU                      │
│  │   ├── K8s Cluster (10+ pods)        │
│  │   ├── PostgreSQL Shard 1            │
│  │   └── Redis Cluster                 │
│  ├── Region 2: US                      │
│  │   ├── K8s Cluster                   │
│  │   ├── PostgreSQL Shard 2            │
│  │   └── Redis Cluster                 │
│  ├── Region 3: Asia                    │
│  │   └── ...                           │
│  └── Global Event Bus (Kafka)          │
└──────────────────────────────────────┘
Scale: 10K-100K+ users
Cost: $5K-50K/month
```

## Summary: What Breaks, When

| Component | Breaks At | Why | Fix |
|-----------|-----------|-----|-----|
| Memory context | ~500 memories | Prompt overflow | Ranking + selection (P0) |
| SQLite writes | ~10 concurrent | Single-writer lock | PostgreSQL (P2) |
| Monolithic Runtime | ~50 users | Cannot parallelize | Stateless runtime (P1) |
| In-process EventBus | ~100 users | No persistence | Event store (P1) |
| No caching | ~500 users | DB bottleneck | Redis cache (P1) |
| No tenant isolation | ~1 user | Not designed | Row-level security (P1) |
| No plugin system | ~10 packs | Manual registration | Plugin registry (P1) |
| Knowledge in memory | ~1000 packs | Memory pressure | LRU cache (P2) |

**Bottom line:** The architecture is fine for Year 1 (1-100 users) with P0 fixes. Year 2+ requires significant infrastructure investment but no fundamental architecture changes.
