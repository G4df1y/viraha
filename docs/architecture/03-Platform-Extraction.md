# Platform Extraction Report

## Analysis: What's Fitness-Specific vs Truly Generic

### Module Audit

| Module | Currently | Real Reusability | Verdict |
|--------|-----------|-----------------|---------|
| core/types.ts | Generic types + some fitness types | ~70% generic, 30% fitness-specific | **Split** 鈥?extract generic types |
| db/schema.ts | 15 tables mixed | 11 generic, 4 fitness | **Split** 鈥?separate fitness tables |
| provider/ | Fully generic | 100% | **Keep** |
| runtime/ | Fully generic | 100% | **Keep** |
| memory/ | Generic + reflection prompt is fitness-tuned | 90% generic | **Keep**, parameterize reflection prompt |
| companion/ | Fully generic (relationship model) | 100% | **Keep** |
| presence/ | Conditions check training_sessions | 70% generic, 30% fitness-coupled | **Refactor** 鈥?make conditions pluggable |
| growth/ | Achievements reference training | 80% generic, 20% fitness | **Refactor** 鈥?make achievements configurable |
| workflow/ | Weekly review is generic | 100% | **Keep** |
| persona/ | Fully generic | 100% | **Keep** |
| knowledge/ | Fitness-specific knowledge packs | Engine: 100% generic, Packs: 100% fitness | **Keep** engine, **move** packs |
| channel-adapters/ | Fully generic | 100% | **Keep** |
| sdk/ | Fully generic | 100% | **Keep** |

### Fitness-Specific Code (Must Extract)

**36 files / ~1200 lines are Fitness-specific:**

```
apps/fitness-companion/
鈹溾攢鈹€ training/          ~300 lines 鈥?exercise lib, training service, tools
鈹溾攢鈹€ nutrition/         ~220 lines 鈥?food db, nutrition service, tools
鈹溾攢鈹€ web/               ~310 lines 鈥?UI that references training + nutrition APIs
鈹溾攢鈹€ cli.ts             ~50 lines 鈥?CLI interface
鈹溾攢鈹€ setup.ts           ~170 lines 鈥?wires fitness tools into runtime
鈹溾攢鈹€ index.ts           ~30 lines 鈥?entry point
鈹溾攢鈹€ index-web.ts       ~20 lines 鈥?web entry point

knowledge-packs/fitness-pack/
鈹溾攢鈹€ exercises.json     ~200 lines 鈥?50 exercises
鈹溾攢鈹€ foods.json         ~300 lines 鈥?65 foods
鈹溾攢鈹€ training.md        ~100 lines 鈥?training knowledge
鈹溾攢鈹€ nutrition.md       ~100 lines 鈥?nutrition knowledge
鈹溾攢鈹€ recovery.md        ~80 lines  鈥?recovery knowledge
鈹斺攢鈹€ psychology.md      ~100 lines 鈥?psychology knowledge

persona-packs/coach/   (empty)

apps/qq-bot/
apps/feishu-bot/
apps/wechat-bot/       ~500 lines total 鈥?generic adapters, zero fitness coupling
```

### Generic Core (Must Keep)

**~3000 lines of generic infrastructure:**

```
packages/core/         ~230 lines
packages/db/           ~240 lines
packages/provider/     ~400 lines
packages/runtime/      ~270 lines
packages/memory/       ~300 lines
packages/companion/    ~130 lines
packages/presence/     ~250 lines
packages/growth/       ~200 lines
packages/workflow/     ~100 lines
packages/persona/      ~90 lines
packages/knowledge/    ~170 lines
packages/channel/      ~40 lines
packages/sdk/          ~170 lines
```

---

## Three-Layer Structure Design

### Layer 1: CompanionOS Core

```
@companionos/core
鈹溾攢鈹€ types/              鈫?Generic types only (Message, User, Memory, Event)
鈹溾攢鈹€ provider/           鈫?LLM Provider abstraction
鈹溾攢鈹€ runtime/            鈫?Event Bus, Session, Queue, Context
鈹溾攢鈹€ memory/             鈫?Profile, Store, Reflection (generic)
鈹溾攢鈹€ companion/          鈫?Relationship Engine
鈹溾攢鈹€ presence/           鈫?Proactive Engine (pluggable conditions)
鈹溾攢鈹€ growth/             鈫?Achievement Engine (pluggable checks)
鈹溾攢鈹€ workflow/           鈫?Goal + Review Engine
鈹溾攢鈹€ persona/            鈫?Personality Engine
鈹溾攢鈹€ knowledge/          鈫?RAG Engine (no domain content)
鈹溾攢鈹€ event/              鈫?Event System (NEW)
鈹溾攢鈹€ context/            鈫?Context Builder (NEW, extracted from runtime)
鈹斺攢鈹€ channel/            鈫?Adapter interfaces
```

**Zero dependencies on any domain.** This layer should compile without any knowledge pack or persona pack.

### Layer 2: CompanionOS SDK

```
@companionos/sdk
鈹溾攢鈹€ createCompanion()   鈫?Factory function
鈹溾攢鈹€ MemorySDK           鈫?Public memory API
鈹溾攢鈹€ CompanionSDK        鈫?Public relationship API
鈹溾攢鈹€ PresenceSDK         鈫?Public presence API
鈹溾攢鈹€ GrowthSDK           鈫?Public growth API
鈹溾攢鈹€ WorkflowSDK         鈫?Public workflow API
鈹斺攢鈹€ ProviderSDK         鈫?Provider management API
```

**Each SDK is independently importable.** Consumer should be able to do:
```typescript
import { MemorySDK } from "@companionos/sdk/memory"
// without importing companion/growth/workflow
```

### Layer 3: Companion Packs

```
@companionos/pack-fitness       鈫?Current fitness-companion app
鈹溾攢鈹€ training/                   鈫?Fitness-specific tools + service
鈹溾攢鈹€ nutrition/                  鈫?Nutrition-specific tools + service
鈹溾攢鈹€ knowledge/                  鈫?Knowledge packs (training.md, etc.)
鈹溾攢鈹€ personas/                   鈫?Coach persona
鈹斺攢鈹€ ui/                         鈫?Fitness Web UI

@companionos/pack-study         鈫?Future
@companionos/pack-writing       鈫?Future
@companionos/pack-creator       鈫?Future
@companionos/pack-life          鈫?Future
```

**Each pack is a standalone npm package** that depends only on `@companionos/sdk`.

---

## Specific Actions

### 100% Generic (move to core, no changes needed)
```
packages/provider
packages/runtime (except context assembly)
packages/companion
packages/persona
packages/channel-adapters
packages/core/types (generic part)
```

### 80% Generic (refactor to accept domain-specific configuration)
```
packages/memory 鈥?reflection prompt should be injectable
packages/presence 鈥?conditions should be plugin-based
packages/growth 鈥?achievements should be loaded from config
packages/workflow 鈥?review templates should be configurable
packages/knowledge 鈥?file paths passed at init time
```

### Split (extract generic, leave domain)
```
packages/core/types 鈫?split generic vs fitness types
packages/db/schema 鈫?split core tables vs domain tables
apps/fitness-companion 鈫?split generic bootstrap vs fitness wiring
```

### Delete
```
packages/scheduler 鈥?empty, dead code
apps/fitness-companion/dist/ 鈥?test artifacts
apps/fitness-companion/src/test-*.ts 鈥?test files (already removed?)
```

### Move
```
knowledge-packs/fitness-pack/ 鈫?companionos-pack-fitness
persona-packs/coach/ 鈫?companionos-pack-fitness/personas/
apps/fitness-companion/src/training/ 鈫?companionos-pack-fitness
apps/fitness-companion/src/nutrition/ 鈫?companionos-pack-fitness
```

### Rename
```
@viraha/core         鈫?@companionos/core
@viraha/db           鈫?@companionos/core/db (internal)
@viraha/provider     鈫?@companionos/core/provider
@viraha/runtime      鈫?@companionos/core/runtime
@viraha/memory       鈫?@companionos/core/memory
@viraha/companion    鈫?@companionos/core/companion
@viraha/presence     鈫?@companionos/core/presence
@viraha/growth       鈫?@companionos/core/growth
@viraha/workflow     鈫?@companionos/core/workflow
@viraha/persona      鈫?@companionos/core/persona
@viraha/knowledge    鈫?@companionos/core/knowledge
@viraha/sdk          鈫?@companionos/sdk
@viraha/fitness-companion 鈫?@companionos/pack-fitness
```

---

## Platform Readiness Score

| Criteria | Current Score | Target Score | Gap |
|----------|-------------|-------------|-----|
| Generic core isolated | 30% | 100% | Sport-specific code mixed |
| Plugin architecture | 0% | 80% | No plugin system |
| Event-driven | 5% | 90% | Events almost unused |
| SDK independence | 10% | 90% | Fat SDK imports everything |
| Pack isolation | 0% | 90% | Fitness code tied to runtime |
| Configuration-driven | 20% | 80% | Hardcoded tool registrations |
| Documented APIs | 0% | 70% | No API docs |


