# Viraha Core Time And Capability Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Time and Capability first-class, portable Viraha Core contracts, then prove them through deterministic runtime scheduling and one permissioned Capability invocation inside the existing AgentPipeline.

**Architecture:** `@viraha/companion-core` becomes the canonical portable home for new Time and Capability contracts because it already serves the mobile client without Node APIs. The existing Node `@viraha/runtime` consumes those contracts through an injected Clock and a new CapabilityRuntime while legacy `@viraha/core`, `@viraha/skills`, plugins, and tools remain compatibility layers during migration.

**Tech Stack:** TypeScript 5.7/6.0 compatible syntax, Node.js 22, pnpm 11.7.0, Vitest 3, existing `@viraha/companion-core`, `@viraha/runtime`, `@viraha/provider`, and SQLite-backed scheduler tests.

---

## Scope And Follow-On Plans

This is the first independently testable slice of the approved Viraha constitution. It deliberately implements the shared contracts before redesigning the mobile UI.

Included:

- Portable Instant, Clock, duration, and deterministic ManualClock semantics.
- Clock injection into Scheduler, EventBus, and AgentPipeline.
- Portable Capability manifests, four permission kinds, grants, expiry, revocation, and observations.
- An in-memory CapabilityRuntime that proves install, grant, invoke, observe, revoke, and failure behavior.
- AgentPipeline integration with one permissioned Capability call and first-class audit events.
- Developer documentation for the initial programmatic API.

Excluded and assigned to later plans:

1. Current Moment and Viraha Control Layer mobile UI.
2. SQLite persistence for Capability grants and observations.
3. `viraha create/dev/test/sign/publish` developer CLI and independent Registry distribution.
4. Untrusted code sandboxing and dynamic side-loading.
5. Capability composition, rollback packages, Store UX, voice, image, Bridge, and continuous-presence workers.
6. Compatibility migration of the legacy Runtime facade to the injected Clock.
7. Full migration or removal of legacy `@viraha/core`, `@viraha/skills`, PluginRegistry, fitness types, XP, and relationship levels.

The Capability contract is foundational in this plan; the breadth of concrete capabilities is intentionally deferred.

## Execution Prerequisites

- Work in `D:\viraha\.worktrees\arete-studio`.
- Prefix every terminal command with `D:\tools\rtk\rtk.exe`.
- Run pnpm under the configured Node 22 toolchain:

```powershell
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm <args>"
```

- Preserve unrelated untracked `docs/research/` and `output/` content.
- Use TDD for each task and do not mix the mobile Current Moment redesign into this branch.

## File Map

**Portable Time domain**

- Create `packages/companion-core/src/time.ts`: Instant, Clock, ManualClock, comparison, and duration semantics.
- Create `packages/companion-core/tests/time.test.ts`: wall-clock correction, monotonic time, ordering, and invalid input tests.
- Modify `packages/companion-core/src/index.ts`: export Time contracts.

**Portable Capability domain**

- Create `packages/companion-core/src/capability.ts`: manifest, permission, grant, decision, observation, and validation contracts.
- Create `packages/companion-core/tests/capability.test.ts`: validation, expiry, revocation, and once-grant tests.
- Modify `packages/companion-core/src/index.ts`: export Capability contracts.

**Node runtime adapters**

- Create `packages/runtime/src/node-clock.ts`: Node wall and monotonic Clock adapter.
- Create `packages/runtime/src/capability-runtime.ts`: installation, grants, invocation, observations, and Provider tool exposure.
- Create `packages/runtime/tests/capability-runtime.test.ts`: complete in-memory lifecycle tests.
- Create `packages/runtime/tests/pipeline-capabilities.test.ts`: real AgentPipeline Capability integration.
- Modify `packages/runtime/src/scheduler.ts`: injected Clock for all implicit current-time reads.
- Modify `packages/runtime/src/event-bus.ts`: injected Clock for receive and duration metrics.
- Modify `packages/runtime/src/pipeline.ts`: injected Clock and CapabilityRuntime integration.
- Modify `packages/runtime/src/index.ts`: export new runtime modules.
- Modify `packages/runtime/package.json`: depend on `@viraha/companion-core`.
- Modify `packages/runtime/tests/pipeline-events.test.ts`: deterministic event identity and timestamp coverage.

**Legacy event compatibility**

- Modify `packages/core/src/types.ts`: add first-class Capability lifecycle event names to EventType.
- Modify `packages/core/tests/types.test.ts`: include new event names.

**Developer documentation**

- Create `docs/developers/capability-foundation.md`: explain the initial supported contract and its intentional limits.
- Modify `pnpm-lock.yaml`: record the new workspace dependency.

---

### Task 1: Add Portable Time Semantics

**Files:**
- Create: `packages/companion-core/src/time.ts`
- Create: `packages/companion-core/tests/time.test.ts`
- Modify: `packages/companion-core/src/index.ts`

- [ ] **Step 1: Write the failing Time tests**

```ts
// packages/companion-core/tests/time.test.ts
import { describe, expect, it } from "vitest";

import {
  ManualClock,
  compareInstants,
  createInstant,
  durationBetween,
} from "../src/index.js";

describe("Time", () => {
  it("creates a normalized instant with source provenance", () => {
    expect(createInstant("2026-07-13T08:00:00+08:00", "device")).toEqual({
      iso: "2026-07-13T00:00:00.000Z",
      epochMs: 1783900800000,
      source: "device",
    });
  });

  it("rejects an invalid instant", () => {
    expect(() => createInstant("not-a-time", "device")).toThrow(
      "Instant must be a valid ISO-8601 date-time",
    );
  });

  it("keeps wall-clock correction separate from monotonic elapsed time", () => {
    const clock = new ManualClock("2026-07-13T00:00:00.000Z");
    clock.advance(5_000);
    expect(clock.now().iso).toBe("2026-07-13T00:00:05.000Z");
    expect(clock.monotonicMs()).toBe(5_000);

    clock.setWallTime("2026-07-12T23:59:00.000Z");
    expect(clock.now().iso).toBe("2026-07-12T23:59:00.000Z");
    expect(clock.monotonicMs()).toBe(5_000);
  });

  it("compares instants and rejects negative duration", () => {
    const start = createInstant("2026-07-13T00:00:00.000Z", "test");
    const end = createInstant("2026-07-13T00:00:10.000Z", "test");
    expect(compareInstants(start, end)).toBe(-1);
    expect(durationBetween(start, end)).toBe(10_000);
    expect(() => durationBetween(end, start)).toThrow(
      "Duration cannot end before it starts",
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```powershell
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/companion-core test -- time.test.ts"
```

Expected: FAIL because `ManualClock`, `createInstant`, `compareInstants`, and `durationBetween` are not exported.

- [ ] **Step 3: Implement the portable Time module**

```ts
// packages/companion-core/src/time.ts
export type ClockSource = "device" | "server" | "test";

export interface Instant {
  iso: string;
  epochMs: number;
  source: ClockSource;
}

export interface Clock {
  now(): Instant;
  monotonicMs(): number;
}

export function createInstant(
  input: string | number,
  source: ClockSource,
): Instant {
  const epochMs = typeof input === "number" ? input : Date.parse(input);
  if (!Number.isFinite(epochMs)) {
    throw new Error("Instant must be a valid ISO-8601 date-time");
  }
  return { iso: new Date(epochMs).toISOString(), epochMs, source };
}

export function compareInstants(left: Instant, right: Instant): -1 | 0 | 1 {
  if (left.epochMs < right.epochMs) return -1;
  if (left.epochMs > right.epochMs) return 1;
  return 0;
}

export function durationBetween(start: Instant, end: Instant): number {
  const duration = end.epochMs - start.epochMs;
  if (duration < 0) throw new Error("Duration cannot end before it starts");
  return duration;
}

export class ManualClock implements Clock {
  private wallEpochMs: number;
  private elapsedMs = 0;

  constructor(initialWallTime: string) {
    this.wallEpochMs = createInstant(initialWallTime, "test").epochMs;
  }

  now(): Instant {
    return createInstant(this.wallEpochMs, "test");
  }

  monotonicMs(): number {
    return this.elapsedMs;
  }

  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new Error("Clock advance must be a non-negative number");
    }
    this.wallEpochMs += milliseconds;
    this.elapsedMs += milliseconds;
  }

  setWallTime(value: string): void {
    this.wallEpochMs = createInstant(value, "test").epochMs;
  }
}
```

Append to `packages/companion-core/src/index.ts`:

```ts
export * from "./time.js";
```

- [ ] **Step 4: Run Time tests and package build**

```powershell
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/companion-core test -- time.test.ts"
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/companion-core build"
```

Expected: focused tests PASS and the portable package builds without Node-only imports.

- [ ] **Step 5: Commit**

```powershell
D:\tools\rtk\rtk.exe git add packages/companion-core/src/time.ts packages/companion-core/src/index.ts packages/companion-core/tests/time.test.ts
D:\tools\rtk\rtk.exe git commit -m "feat(core): add first-class time semantics"
```

---

### Task 2: Inject Clock Into Runtime Components

**Files:**
- Create: `packages/runtime/src/node-clock.ts`
- Modify: `packages/runtime/src/scheduler.ts`
- Modify: `packages/runtime/src/event-bus.ts`
- Modify: `packages/runtime/src/pipeline.ts`
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/package.json`
- Modify: `packages/runtime/tests/scheduler.test.ts`
- Modify: `packages/runtime/tests/event-bus.test.ts`
- Modify: `packages/runtime/tests/pipeline-events.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add failing deterministic Clock tests**

Append to `packages/runtime/tests/scheduler.test.ts`:

```ts
import { ManualClock } from "@viraha/companion-core";

it("uses the injected Clock for createdAt and implicit due checks", async () => {
  const clock = new ManualClock("2026-07-13T00:00:00.000Z");
  const scheduler = new DurableScheduler({ clock });
  const id = await scheduler.enqueue({
    userId: "u-clock",
    type: "presence",
    runAt: "2026-07-13T00:00:05.000Z",
  });

  expect((await scheduler.getJob(id))?.createdAt).toBe(
    "2026-07-13T00:00:00.000Z",
  );
  expect(await scheduler.claim(1)).toEqual([]);

  clock.advance(5_000);
  expect((await scheduler.claim(1))[0]?.id).toBe(id);
});
```

Append to `packages/runtime/tests/event-bus.test.ts`:

```ts
import { ManualClock } from "@viraha/companion-core";

it("measures handling with monotonic time when wall time changes", async () => {
  const clock = new ManualClock("2026-07-13T00:00:00.000Z");
  const bus = new EventBus(clock);
  bus.on("UserMessageReceived", () => {
    clock.advance(25);
    clock.setWallTime("2026-07-12T23:00:00.000Z");
  });

  await bus.emit({
    id: "event-clock",
    type: "UserMessageReceived",
    source: "test",
    timestamp: "2026-07-13T00:00:00.000Z",
    correlationId: "correlation-clock",
    payload: {},
    metadata: { priority: "normal" },
  });

  expect(bus.getMetrics().recent[0]?.ms).toBe(25);
});
```

Append to `packages/runtime/tests/pipeline-events.test.ts`:

```ts
import { ManualClock } from "@viraha/companion-core";

it("uses the injected Clock for event identities and timestamps", async () => {
  const clock = new ManualClock("2026-07-13T00:00:00.000Z");
  const events = new EventBus(clock);
  const llm: LLMProvider = {
    name: "fake",
    async chat() {
      return {
        content: "Ready.",
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    },
    async *chatStream() {}
  };
  const pipeline = new AgentPipeline({
    identity,
    model: "fake-model",
    llm,
    events,
    clock,
  });

  await pipeline.process({ message: "hi", userId: "web-user" });

  const history = events.getHistory();
  expect(history.map(event => event.timestamp)).toEqual([
    "2026-07-13T00:00:00.000Z",
    "2026-07-13T00:00:00.000Z",
    "2026-07-13T00:00:00.000Z",
  ]);
  expect(
    history.every(event =>
      event.id.startsWith(`evt_${clock.now().epochMs}_`),
    ),
  ).toBe(true);
});
```

- [ ] **Step 2: Add the workspace dependency and verify red**

Add to `packages/runtime/package.json` dependencies:

```json
"@viraha/companion-core": "workspace:*"
```

Run:

```powershell
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm install --store-dir D:\viraha\.pnpm-store"
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/runtime test -- scheduler.test.ts event-bus.test.ts pipeline-events.test.ts"
```

Expected: FAIL because Scheduler, EventBus, and AgentPipeline do not accept the Clock.

- [ ] **Step 3: Implement the Node Clock adapter**

```ts
// packages/runtime/src/node-clock.ts
import { performance } from "node:perf_hooks";

import {
  createInstant,
  type Clock,
  type Instant,
} from "@viraha/companion-core";

export class NodeClock implements Clock {
  now(): Instant {
    return createInstant(Date.now(), "server");
  }

  monotonicMs(): number {
    return performance.now();
  }
}
```

Append to `packages/runtime/src/index.ts`:

```ts
export * from "./node-clock.js";
```

- [ ] **Step 4: Inject Clock into DurableScheduler**

Add imports and state to `packages/runtime/src/scheduler.ts`:

```ts
import type { Clock } from "@viraha/companion-core";
import { NodeClock } from "./node-clock.js";

export interface DurableSchedulerOptions {
  leaseMs?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  clock?: Clock;
}

export class DurableScheduler {
  private readonly clock: Clock;

  constructor(options: DurableSchedulerOptions = {}) {
    this.clock = options.clock ?? new NodeClock();
    this.leaseMs = options.leaseMs ?? 60_000;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.backoffBaseMs = options.backoffBaseMs ?? 30_000;
    this.backoffMaxMs = options.backoffMaxMs ?? 3_600_000;
  }

  private currentDate(): Date {
    return new Date(this.clock.now().epochMs);
  }
}
```

Use `this.clock.now().iso` for `enqueue()`'s `createdAt`. Change implicit-time method parameters from `new Date()` to optional values and normalize once:

```ts
async enqueueWithCooldown(
  input: EnqueueJobInput,
  cooldownMs: number,
  now?: Date,
): Promise<EnqueueWithCooldownResult> {
  const effectiveNow = now ?? this.currentDate();
  const since = new Date(effectiveNow.getTime() - cooldownMs).toISOString();
  const existing = await getSqliteClient().execute({
    sql: `SELECT id FROM scheduled_jobs
      WHERE user_id = ? AND type = ? AND status != 'failed' AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 1`,
    args: [input.userId, input.type, since],
  });
  if (existing.rows.length > 0) {
    return { id: String(existing.rows[0].id), deduplicated: true };
  }
  return { id: await this.enqueue(input), deduplicated: false };
}

async claim(limit = 1, now?: Date, type?: string): Promise<DurableJob[]> {
  const effectiveNow = now ?? this.currentDate();
  const client = getSqliteClient();
  const staleBefore = new Date(
    effectiveNow.getTime() - this.leaseMs,
  ).toISOString();
  await client.execute({
    sql: `UPDATE scheduled_jobs
      SET status = 'queued', locked_at = NULL
      WHERE status = 'running' AND locked_at IS NOT NULL AND locked_at < ?`,
    args: [staleBefore],
  });

  const claimed: DurableJob[] = [];
  for (let index = 0; index < limit; index += 1) {
    const lockedAt = effectiveNow.toISOString();
    const result = await client.execute({
      sql: `UPDATE scheduled_jobs
        SET status = 'running', attempts = attempts + 1, locked_at = ?
        WHERE id = (
          SELECT id FROM scheduled_jobs
          WHERE status = 'queued' AND run_at <= ?
            AND (? IS NULL OR type = ?)
          ORDER BY run_at ASC, created_at ASC
          LIMIT 1
        )
        RETURNING id, user_id, type, payload, run_at, status, attempts,
                  last_error, locked_at, completed_at, created_at`,
      args: [lockedAt, effectiveNow.toISOString(), type ?? null, type ?? null],
    });
    if (result.rows.length === 0) break;
    claimed.push(this.parseRow(result.rows[0]));
  }
  return claimed;
}

async complete(id: string, completedAt?: Date): Promise<void> {
  const effectiveCompletedAt = completedAt ?? this.currentDate();
  await getSqliteClient().execute({
    sql: `UPDATE scheduled_jobs
      SET status = 'completed', completed_at = ?, locked_at = NULL
      WHERE id = ?`,
    args: [effectiveCompletedAt.toISOString(), id],
  });
}

async runDue(
  handler: (job: DurableJob) => Promise<void>,
  limit = 10,
  now?: Date,
  type?: string,
): Promise<SchedulerRunResult> {
  const effectiveNow = now ?? this.currentDate();
  const jobs = await this.claim(limit, effectiveNow, type);
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await handler(job);
      await this.complete(job.id, effectiveNow);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (job.attempts < this.maxAttempts) {
        const backoff = Math.min(
          this.backoffBaseMs * 2 ** (job.attempts - 1),
          this.backoffMaxMs,
        );
        await this.fail(
          job.id,
          message,
          new Date(effectiveNow.getTime() + backoff),
        );
      } else {
        await this.fail(job.id, message);
      }
      failed += 1;
    }
  }

  return { completed, failed };
}
```

Do not change explicit `Date` values supplied by callers; they remain a compatibility path while implicit current time becomes injectable.

- [ ] **Step 5: Inject Clock into EventBus and AgentPipeline**

In `packages/runtime/src/event-bus.ts`, add:

```ts
import type { Clock } from "@viraha/companion-core";
import { NodeClock } from "./node-clock.js";

export class EventBus {
  constructor(private readonly clock: Clock = new NodeClock()) {}

  async emit(event: EventEnvelope) {
    const receivedAt = this.clock.now();
    const startedAt = this.clock.monotonicMs();
    const timed = event as TimedEvent;
    timed._receivedAt = receivedAt.epochMs;
    this.history.push(timed);

    if (
      this.store &&
      (this.persistFilter.has(event.type) || this.persistFilter.size === 0)
    ) {
      await this.store.persist(event);
    }

    const handlers = this.handlers.get(event.type);
    if (handlers) {
      await Promise.all(
        Array.from(handlers).map(handler =>
          Promise.resolve(handler(event)).catch(error =>
            console.error(`[EventBus] ${event.type}:`, error),
          ),
        ),
      );
    }

    timed._processingMs = this.clock.monotonicMs() - startedAt;
  }
}
```

In `packages/runtime/src/pipeline.ts`, add these imports:

```ts
import type { Clock } from "@viraha/companion-core";
import { NodeClock } from "./node-clock.js";
```

Append the Clock option to the existing `AgentConfig`:

```ts
clock?: Clock;
```

Add the Clock field and initialize it in the existing constructor without changing the remaining setup:

```ts
private readonly clock: Clock;

constructor(config: AgentConfig) {
  this.config = config;
  this.clock = config.clock ?? new NodeClock();
  this.identity = new IdentityEngine();
  this.skills = new SkillRegistry();
  this.skillExecutor = new SkillExecutor(this.skills);
  this.mcp = new MCPManager();
  this.boundaryScanner = new BoundaryScanner();
  this.identity.register(config.identity);
}
```

Replace `Date.now()` plus `new Date().toISOString()` inside `emitEvent()`:

```ts
const now = this.clock.now();
const event: EventEnvelope = {
  id: `evt_${now.epochMs}_${++AgentPipeline.eventCounter}`,
  type,
  source: "agent-pipeline",
  timestamp: now.iso,
  correlationId,
  payload,
  metadata: { userId, priority },
};
```

- [ ] **Step 6: Verify deterministic Time integration**

```powershell
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/runtime test -- scheduler.test.ts event-bus.test.ts pipeline-events.test.ts"
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/runtime build"
```

Expected: focused tests PASS and Runtime builds with no direct implicit-time reads in Scheduler, EventBus, or AgentPipeline event creation.

- [ ] **Step 7: Commit**

```powershell
D:\tools\rtk\rtk.exe git add packages/runtime/src/node-clock.ts packages/runtime/src/scheduler.ts packages/runtime/src/event-bus.ts packages/runtime/src/pipeline.ts packages/runtime/src/index.ts packages/runtime/package.json packages/runtime/tests/scheduler.test.ts packages/runtime/tests/event-bus.test.ts packages/runtime/tests/pipeline-events.test.ts pnpm-lock.yaml
D:\tools\rtk\rtk.exe git commit -m "refactor(runtime): inject first-class clock"
```

---

### Task 3: Add Portable Capability Contracts And Consent Evaluation

**Files:**
- Create: `packages/companion-core/src/capability.ts`
- Create: `packages/companion-core/tests/capability.test.ts`
- Modify: `packages/companion-core/src/index.ts`

- [ ] **Step 1: Write failing Capability domain tests**

```ts
// packages/companion-core/tests/capability.test.ts
import { describe, expect, it } from "vitest";

import {
  createInstant,
  defineCapability,
  evaluateCapabilityAccess,
  type CapabilityGrant,
} from "../src/index.js";

const manifest = defineCapability({
  schemaVersion: 1,
  id: "community.echo",
  version: "1.0.0",
  name: "Echo",
  description: "Returns text for the local capability test.",
  author: "Viraha Community",
  license: "Apache-2.0",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
  outputSchema: { type: "object" },
  permissions: [
    {
      id: "conversation.read",
      kind: "read",
      reason: "Read the text selected for echoing.",
      required: true,
      dataCategories: ["conversation.selected_text"],
    },
    {
      id: "response.act",
      kind: "act",
      reason: "Return the selected text to the current conversation.",
      required: true,
    },
    {
      id: "memory.remember",
      kind: "remember",
      reason: "Record that the selected text was echoed.",
      required: true,
    },
    {
      id: "background.run",
      kind: "background",
      reason: "Allow the echo to finish when the surface is suspended.",
      required: true,
    },
  ],
  sideEffect: "none",
  risk: "low",
});

function grant(
  permissionId: string,
  overrides: Partial<CapabilityGrant> = {},
): CapabilityGrant {
  return {
    id: `grant-${permissionId}`,
    capabilityId: manifest.id,
    permissionId,
    userId: "user-1",
    scope: "always",
    grantedAt: createInstant("2026-07-13T00:00:00.000Z", "test"),
    ...overrides,
  };
}

describe("Capability contract", () => {
  it("rejects duplicate permission ids", () => {
    expect(() =>
      defineCapability({
        ...manifest,
        permissions: [manifest.permissions[0]!, manifest.permissions[0]!],
      }),
    ).toThrow("Capability permission ids must be unique");
  });

  it("denies until every required permission is active", () => {
    const decision = evaluateCapabilityAccess(
      manifest,
      [grant("conversation.read")],
      "user-1",
      createInstant("2026-07-13T00:01:00.000Z", "test"),
    );
    expect(decision).toEqual({
      allowed: false,
      missingPermissionIds: [
        "response.act",
        "memory.remember",
        "background.run",
      ],
      reason:
        "Missing required Capability permissions: response.act, memory.remember, background.run",
    });
  });

  const inactiveGrantCases: Array<[string, Partial<CapabilityGrant>]> = [
    [
      "revoked",
      { revokedAt: createInstant("2026-07-13T00:01:00.000Z", "test") },
    ],
    [
      "expired",
      { expiresAt: createInstant("2026-07-13T00:01:00.000Z", "test") },
    ],
    ["exhausted once", { scope: "once", remainingUses: 0 }],
  ];

  it.each(inactiveGrantCases)("treats %s grants as inactive", (_, overrides) => {
    const now = createInstant("2026-07-13T00:02:00.000Z", "test");
    const decision = evaluateCapabilityAccess(
      manifest,
      [
        grant("conversation.read", overrides),
        grant("response.act"),
        grant("memory.remember"),
        grant("background.run"),
      ],
      "user-1",
      now,
    );
    expect(decision).toEqual({
      allowed: false,
      missingPermissionIds: ["conversation.read"],
      reason: "Missing required Capability permissions: conversation.read",
    });
  });

  it("allows when every required grant is active", () => {
    const decision = evaluateCapabilityAccess(
      manifest,
      [
        grant("conversation.read"),
        grant("response.act"),
        grant("memory.remember"),
        grant("background.run"),
      ],
      "user-1",
      createInstant("2026-07-13T00:01:00.000Z", "test"),
    );
    expect(decision).toEqual({
      allowed: true,
      grantIds: [
        "grant-conversation.read",
        "grant-response.act",
        "grant-memory.remember",
        "grant-background.run",
      ],
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify red**

```powershell
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/companion-core test -- capability.test.ts"
```

Expected: FAIL because Capability contracts do not exist.

- [ ] **Step 3: Implement the Capability domain**

```ts
// packages/companion-core/src/capability.ts
import type { Instant } from "./time.js";

export type CapabilityPermissionKind =
  | "read"
  | "act"
  | "remember"
  | "background";

export type CapabilityGrantScope = "once" | "always";
export type CapabilitySideEffect = "none" | "reversible" | "irreversible";
export type CapabilityRisk = "low" | "medium" | "high";

export interface CapabilityPermissionRequirement {
  id: string;
  kind: CapabilityPermissionKind;
  reason: string;
  required: boolean;
  dataCategories?: string[];
}

export interface CapabilityManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  name: string;
  description: string;
  author: string;
  license: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  permissions: CapabilityPermissionRequirement[];
  sideEffect: CapabilitySideEffect;
  risk: CapabilityRisk;
}

export interface CapabilityGrant {
  id: string;
  capabilityId: string;
  permissionId: string;
  userId: string;
  scope: CapabilityGrantScope;
  grantedAt: Instant;
  expiresAt?: Instant;
  revokedAt?: Instant;
  remainingUses?: number;
}

export type CapabilityAccessDecision =
  | { allowed: true; grantIds: string[] }
  | {
      allowed: false;
      missingPermissionIds: string[];
      reason: string;
    };

export type CapabilityOutcome = "completed" | "denied" | "failed";

export interface CapabilityObservation {
  id: string;
  capabilityId: string;
  userId: string;
  surfaceId: string;
  correlationId: string;
  outcome: CapabilityOutcome;
  startedAt: Instant;
  completedAt: Instant;
  durationMs: number;
  grantIds: string[];
  sideEffects: string[];
  reason?: string;
}

export function defineCapability(input: CapabilityManifest): CapabilityManifest {
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(input.id)) {
    throw new Error("Capability id must be lowercase and namespace-safe");
  }
  if (!/^\d+\.\d+\.\d+$/.test(input.version)) {
    throw new Error("Capability version must use major.minor.patch");
  }
  const permissionIds = input.permissions.map(permission => permission.id);
  if (new Set(permissionIds).size !== permissionIds.length) {
    throw new Error("Capability permission ids must be unique");
  }
  for (const permission of input.permissions) {
    if (!permission.reason.trim()) {
      throw new Error(`Capability permission ${permission.id} needs a reason`);
    }
  }
  return input;
}

function isGrantActive(grant: CapabilityGrant, now: Instant): boolean {
  if (grant.revokedAt) return false;
  if (grant.expiresAt && grant.expiresAt.epochMs <= now.epochMs) return false;
  if (grant.scope === "once" && (grant.remainingUses ?? 1) <= 0) return false;
  return true;
}

export function evaluateCapabilityAccess(
  manifest: CapabilityManifest,
  grants: CapabilityGrant[],
  userId: string,
  now: Instant,
): CapabilityAccessDecision {
  const activeGrants = grants.filter(
    grant =>
      grant.userId === userId &&
      grant.capabilityId === manifest.id &&
      isGrantActive(grant, now),
  );
  const missingPermissionIds = manifest.permissions
    .filter(permission => permission.required)
    .filter(
      permission =>
        !activeGrants.some(grant => grant.permissionId === permission.id),
    )
    .map(permission => permission.id);

  if (missingPermissionIds.length > 0) {
    return {
      allowed: false,
      missingPermissionIds,
      reason: `Missing required Capability permissions: ${missingPermissionIds.join(", ")}`,
    };
  }

  return {
    allowed: true,
    grantIds: manifest.permissions
      .filter(permission => permission.required)
      .map(
        permission =>
          activeGrants.find(grant => grant.permissionId === permission.id)!.id,
      ),
  };
}
```

Append to `packages/companion-core/src/index.ts`:

```ts
export * from "./capability.js";
```

- [ ] **Step 4: Run Capability and Time tests**

```powershell
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/companion-core test"
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/companion-core build"
```

Expected: all companion-core tests PASS and declarations build.

- [ ] **Step 5: Commit**

```powershell
D:\tools\rtk\rtk.exe git add packages/companion-core/src/capability.ts packages/companion-core/src/index.ts packages/companion-core/tests/capability.test.ts
D:\tools\rtk\rtk.exe git commit -m "feat(core): add capability contracts and consent"
```

---

### Task 4: Add The Capability Runtime Lifecycle

**Files:**
- Create: `packages/runtime/src/capability-runtime.ts`
- Create: `packages/runtime/tests/capability-runtime.test.ts`
- Modify: `packages/runtime/src/index.ts`

- [ ] **Step 1: Write failing lifecycle tests**

```ts
// packages/runtime/tests/capability-runtime.test.ts
import { describe, expect, it } from "vitest";

import {
  ManualClock,
  defineCapability,
} from "@viraha/companion-core";
import {
  CapabilityDeniedError,
  CapabilityRuntime,
  InMemoryCapabilityGrantStore,
  InMemoryCapabilityObservationSink,
} from "../src/index.js";

const manifest = defineCapability({
  schemaVersion: 1,
  id: "community.echo",
  version: "1.0.0",
  name: "Echo",
  description: "Echo selected text.",
  author: "Viraha Community",
  license: "Apache-2.0",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  permissions: [
    {
      id: "response.act",
      kind: "act",
      reason: "Return text to the active conversation.",
      required: true,
    },
  ],
  sideEffect: "none",
  risk: "low",
});

function createRuntime() {
  const clock = new ManualClock("2026-07-13T00:00:00.000Z");
  const grants = new InMemoryCapabilityGrantStore();
  const observations = new InMemoryCapabilityObservationSink();
  const runtime = new CapabilityRuntime({ clock, grants, observations });
  runtime.install(manifest, async input => ({
    content: String(input.text ?? ""),
    data: { echoed: true },
    sideEffects: [],
  }));
  return { clock, grants, observations, runtime };
}

describe("CapabilityRuntime", () => {
  it("installs without implicitly granting permission", async () => {
    const { observations, runtime } = createRuntime();
    await expect(
      runtime.invoke({
        capabilityId: manifest.id,
        userId: "user-1",
        surfaceId: "surface-mobile",
        correlationId: "correlation-1",
        input: { text: "hello" },
      }),
    ).rejects.toBeInstanceOf(CapabilityDeniedError);
    expect(observations.items.at(-1)).toMatchObject({
      capabilityId: manifest.id,
      outcome: "denied",
      grantIds: [],
    });
  });

  it("grants, invokes, observes, and revokes", async () => {
    const { clock, observations, runtime } = createRuntime();
    await runtime.grant({
      capabilityId: manifest.id,
      permissionId: "response.act",
      userId: "user-1",
      scope: "always",
    });

    clock.advance(10);
    await expect(
      runtime.invoke({
        capabilityId: manifest.id,
        userId: "user-1",
        surfaceId: "surface-mobile",
        correlationId: "correlation-2",
        input: { text: "hello" },
      }),
    ).resolves.toMatchObject({ content: "hello" });

    expect(observations.items).toHaveLength(1);
    expect(observations.items[0]).toMatchObject({
      capabilityId: manifest.id,
      outcome: "completed",
      grantIds: [expect.any(String)],
    });

    await runtime.revoke({
      capabilityId: manifest.id,
      permissionId: "response.act",
      userId: "user-1",
    });
    await expect(
      runtime.invoke({
        capabilityId: manifest.id,
        userId: "user-1",
        surfaceId: "surface-mobile",
        correlationId: "correlation-3",
        input: { text: "again" },
      }),
    ).rejects.toBeInstanceOf(CapabilityDeniedError);
  });

  it("records handler failure without hiding the error", async () => {
    const { observations, runtime } = createRuntime();
    runtime.install(
      { ...manifest, id: "community.fail" },
      async () => {
        throw new Error("handler failed");
      },
    );
    await runtime.grant({
      capabilityId: "community.fail",
      permissionId: "response.act",
      userId: "user-1",
      scope: "once",
    });

    await expect(
      runtime.invoke({
        capabilityId: "community.fail",
        userId: "user-1",
        surfaceId: "surface-mobile",
        correlationId: "correlation-fail",
        input: {},
      }),
    ).rejects.toThrow("handler failed");
    expect(observations.items.at(-1)?.outcome).toBe("failed");
  });
});
```

- [ ] **Step 2: Run the lifecycle test and verify red**

```powershell
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/runtime test -- capability-runtime.test.ts"
```

Expected: FAIL because CapabilityRuntime and its stores do not exist.

- [ ] **Step 3: Implement CapabilityRuntime and in-memory ports**

```ts
// packages/runtime/src/capability-runtime.ts
import type { ToolDefinition } from "@viraha/provider";
import {
  defineCapability,
  evaluateCapabilityAccess,
  type CapabilityGrant,
  type CapabilityGrantScope,
  type CapabilityManifest,
  type CapabilityObservation,
  type Clock,
  type Instant,
} from "@viraha/companion-core";

export interface CapabilityResult {
  content: string;
  data?: Record<string, unknown>;
  sideEffects?: string[];
}

export interface CapabilityInvocationContext {
  userId: string;
  surfaceId: string;
  correlationId: string;
  now: Instant;
}

export type CapabilityHandler = (
  input: Record<string, unknown>,
  context: CapabilityInvocationContext,
) => Promise<CapabilityResult>;

export interface CapabilityGrantStore {
  list(userId: string, capabilityId: string): Promise<CapabilityGrant[]>;
  save(grant: CapabilityGrant): Promise<void>;
  revoke(
    userId: string,
    capabilityId: string,
    permissionId: string,
    revokedAt: Instant,
  ): Promise<void>;
  consume(grantIds: string[]): Promise<void>;
}

export interface CapabilityObservationSink {
  record(observation: CapabilityObservation): Promise<void>;
}

export class InMemoryCapabilityGrantStore implements CapabilityGrantStore {
  private readonly grants = new Map<string, CapabilityGrant>();

  async list(userId: string, capabilityId: string): Promise<CapabilityGrant[]> {
    return [...this.grants.values()].filter(
      grant => grant.userId === userId && grant.capabilityId === capabilityId,
    );
  }

  async save(grant: CapabilityGrant): Promise<void> {
    this.grants.set(grant.id, grant);
  }

  async revoke(
    userId: string,
    capabilityId: string,
    permissionId: string,
    revokedAt: Instant,
  ): Promise<void> {
    for (const [id, grant] of this.grants) {
      if (
        grant.userId === userId &&
        grant.capabilityId === capabilityId &&
        grant.permissionId === permissionId &&
        !grant.revokedAt
      ) {
        this.grants.set(id, { ...grant, revokedAt });
      }
    }
  }

  async consume(grantIds: string[]): Promise<void> {
    for (const id of grantIds) {
      const grant = this.grants.get(id);
      if (!grant || grant.scope !== "once") continue;
      this.grants.set(id, {
        ...grant,
        remainingUses: Math.max(0, (grant.remainingUses ?? 1) - 1),
      });
    }
  }
}

export class InMemoryCapabilityObservationSink
  implements CapabilityObservationSink
{
  readonly items: CapabilityObservation[] = [];

  async record(observation: CapabilityObservation): Promise<void> {
    this.items.push(observation);
  }
}

export class CapabilityDeniedError extends Error {
  constructor(
    readonly capabilityId: string,
    readonly missingPermissionIds: string[],
    message: string,
  ) {
    super(message);
    this.name = "CapabilityDeniedError";
  }
}

interface InstalledCapability {
  manifest: CapabilityManifest;
  handler: CapabilityHandler;
  toolName: string;
}

export class CapabilityRuntime {
  private readonly installed = new Map<string, InstalledCapability>();
  private readonly capabilityIdByToolName = new Map<string, string>();
  private idCounter = 0;

  constructor(
    private readonly ports: {
      clock: Clock;
      grants: CapabilityGrantStore;
      observations: CapabilityObservationSink;
    },
  ) {}

  install(manifestInput: CapabilityManifest, handler: CapabilityHandler): void {
    const manifest = defineCapability(manifestInput);
    if (this.installed.has(manifest.id)) {
      throw new Error(`Capability ${manifest.id} is already installed`);
    }
    const toolName = `cap_${manifest.id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
    if (this.capabilityIdByToolName.has(toolName)) {
      throw new Error(`Capability tool name collision: ${toolName}`);
    }
    this.installed.set(manifest.id, { manifest, handler, toolName });
    this.capabilityIdByToolName.set(toolName, manifest.id);
  }

  list(): CapabilityManifest[] {
    return [...this.installed.values()].map(value => value.manifest);
  }

  toolDefinitions(): ToolDefinition[] {
    return [...this.installed.values()].map(value => ({
      name: value.toolName,
      description: value.manifest.description,
      inputSchema: value.manifest.inputSchema,
    }));
  }

  capabilityIdForTool(toolName: string): string | undefined {
    return this.capabilityIdByToolName.get(toolName);
  }

  async grant(input: {
    capabilityId: string;
    permissionId: string;
    userId: string;
    scope: CapabilityGrantScope;
    expiresAt?: Instant;
  }): Promise<CapabilityGrant> {
    const installed = this.installed.get(input.capabilityId);
    if (!installed) throw new Error(`Capability ${input.capabilityId} is not installed`);
    if (!installed.manifest.permissions.some(value => value.id === input.permissionId)) {
      throw new Error(
        `Capability permission ${input.permissionId} is not declared by ${input.capabilityId}`,
      );
    }
    const now = this.ports.clock.now();
    const grant: CapabilityGrant = {
      id: `grant_${now.epochMs}_${++this.idCounter}`,
      capabilityId: input.capabilityId,
      permissionId: input.permissionId,
      userId: input.userId,
      scope: input.scope,
      grantedAt: now,
      expiresAt: input.expiresAt,
      remainingUses: input.scope === "once" ? 1 : undefined,
    };
    await this.ports.grants.save(grant);
    return grant;
  }

  async revoke(input: {
    capabilityId: string;
    permissionId: string;
    userId: string;
  }): Promise<void> {
    await this.ports.grants.revoke(
      input.userId,
      input.capabilityId,
      input.permissionId,
      this.ports.clock.now(),
    );
  }

  async invoke(request: {
    capabilityId: string;
    userId: string;
    surfaceId: string;
    correlationId: string;
    input: Record<string, unknown>;
  }): Promise<CapabilityResult> {
    const installed = this.installed.get(request.capabilityId);
    if (!installed) throw new Error(`Capability ${request.capabilityId} is not installed`);

    const startedAt = this.ports.clock.now();
    const monotonicStart = this.ports.clock.monotonicMs();
    const grants = await this.ports.grants.list(
      request.userId,
      request.capabilityId,
    );
    const decision = evaluateCapabilityAccess(
      installed.manifest,
      grants,
      request.userId,
      startedAt,
    );

    if (!decision.allowed) {
      const completedAt = this.ports.clock.now();
      await this.ports.observations.record({
        id: `observation_${completedAt.epochMs}_${++this.idCounter}`,
        capabilityId: request.capabilityId,
        userId: request.userId,
        surfaceId: request.surfaceId,
        correlationId: request.correlationId,
        outcome: "denied",
        startedAt,
        completedAt,
        durationMs: this.ports.clock.monotonicMs() - monotonicStart,
        grantIds: [],
        sideEffects: [],
        reason: decision.reason,
      });
      throw new CapabilityDeniedError(
        request.capabilityId,
        decision.missingPermissionIds,
        decision.reason,
      );
    }

    await this.ports.grants.consume(decision.grantIds);
    try {
      const result = await installed.handler(request.input, {
        userId: request.userId,
        surfaceId: request.surfaceId,
        correlationId: request.correlationId,
        now: startedAt,
      });
      const completedAt = this.ports.clock.now();
      await this.ports.observations.record({
        id: `observation_${completedAt.epochMs}_${++this.idCounter}`,
        capabilityId: request.capabilityId,
        userId: request.userId,
        surfaceId: request.surfaceId,
        correlationId: request.correlationId,
        outcome: "completed",
        startedAt,
        completedAt,
        durationMs: this.ports.clock.monotonicMs() - monotonicStart,
        grantIds: decision.grantIds,
        sideEffects: result.sideEffects ?? [],
      });
      return result;
    } catch (error) {
      const completedAt = this.ports.clock.now();
      await this.ports.observations.record({
        id: `observation_${completedAt.epochMs}_${++this.idCounter}`,
        capabilityId: request.capabilityId,
        userId: request.userId,
        surfaceId: request.surfaceId,
        correlationId: request.correlationId,
        outcome: "failed",
        startedAt,
        completedAt,
        durationMs: this.ports.clock.monotonicMs() - monotonicStart,
        grantIds: decision.grantIds,
        sideEffects: [],
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
```

Append to `packages/runtime/src/index.ts`:

```ts
export * from "./capability-runtime.js";
```

- [ ] **Step 4: Run lifecycle tests and Runtime build**

```powershell
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/runtime test -- capability-runtime.test.ts"
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/runtime build"
```

Expected: lifecycle tests PASS and Runtime declarations build.

- [ ] **Step 5: Commit**

```powershell
D:\tools\rtk\rtk.exe git add packages/runtime/src/capability-runtime.ts packages/runtime/src/index.ts packages/runtime/tests/capability-runtime.test.ts
D:\tools\rtk\rtk.exe git commit -m "feat(runtime): add capability lifecycle"
```

---

### Task 5: Integrate CapabilityRuntime With AgentPipeline

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/tests/types.test.ts`
- Modify: `packages/runtime/src/pipeline.ts`
- Create: `packages/runtime/tests/pipeline-capabilities.test.ts`

- [ ] **Step 1: Write the failing pipeline Capability test**

```ts
// packages/runtime/tests/pipeline-capabilities.test.ts
import { describe, expect, it } from "vitest";

import {
  ManualClock,
  defineCapability,
} from "@viraha/companion-core";
import type { IdentityConfig } from "@viraha/identity";
import type { LLMProvider } from "@viraha/provider";
import {
  AgentPipeline,
  CapabilityRuntime,
  EventBus,
  InMemoryCapabilityGrantStore,
  InMemoryCapabilityObservationSink,
} from "../src/index.js";

const identity: IdentityConfig = {
  agentId: "arete",
  name: "Arete",
  version: "0.0.0-test",
  type: "companion",
  description: "The first Viraha seed",
  coreValues: ["dignity", "honesty"],
  boundaries: [],
  capabilities: [],
  skills: [],
  personaId: "arete-default",
  persona: {
    name: "Arete",
    traits: ["honest"],
    style: "calm",
    humorLevel: 0,
    formality: 0.5,
    empathyLevel: 0.7,
  },
};

function fakeToolCallingModel(): LLMProvider {
  let calls = 0;
  return {
    name: "fake",
    async chat(params) {
      calls += 1;
      if (calls === 1) {
        expect(params.tools?.map(tool => tool.name)).toContain(
          "cap_community_echo",
        );
        return {
          content: "",
          finishReason: "tool_use",
          toolCalls: [
            {
              id: "tool-call-1",
              name: "cap_community_echo",
              arguments: { text: "hello" },
            },
          ],
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      }
      return {
        content: params.messages.at(-1)?.content ?? "",
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    },
    async *chatStream() {},
  };
}

describe("AgentPipeline Capability integration", () => {
  it("executes a granted Capability and emits invocation audit events", async () => {
    const clock = new ManualClock("2026-07-13T00:00:00.000Z");
    const grants = new InMemoryCapabilityGrantStore();
    const observations = new InMemoryCapabilityObservationSink();
    const capabilities = new CapabilityRuntime({ clock, grants, observations });
    capabilities.install(
      defineCapability({
        schemaVersion: 1,
        id: "community.echo",
        version: "1.0.0",
        name: "Echo",
        description: "Echo selected text.",
        author: "Viraha Community",
        license: "Apache-2.0",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        permissions: [
          {
            id: "response.act",
            kind: "act",
            reason: "Return text to this conversation.",
            required: true,
          },
        ],
        sideEffect: "none",
        risk: "low",
      }),
      async input => ({ content: String(input.text), sideEffects: [] }),
    );
    await capabilities.grant({
      capabilityId: "community.echo",
      permissionId: "response.act",
      userId: "user-1",
      scope: "always",
    });

    const events = new EventBus(clock);
    const pipeline = new AgentPipeline({
      identity,
      model: "fake-model",
      llm: fakeToolCallingModel(),
      clock,
      events,
      capabilities,
    });

    const result = await pipeline.process({
      message: "echo hello",
      userId: "user-1",
      userIdKind: "internal",
      channel: "mobile",
    });

    expect(result.reply).toContain("hello");
    expect(observations.items[0]?.outcome).toBe("completed");
    expect(events.getHistory().map(event => event.type)).toContain(
      "CapabilityCompleted",
    );
  });
});
```

- [ ] **Step 2: Run red**

```powershell
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/runtime test -- pipeline-capabilities.test.ts"
```

Expected: FAIL because AgentPipeline does not expose or execute CapabilityRuntime tools.

- [ ] **Step 3: Add Capability lifecycle event names**

Add these values to `EventType` in `packages/core/src/types.ts`:

```ts
  | "CapabilityInvoked"
  | "CapabilityCompleted"
  | "CapabilityDenied"
  | "CapabilityFailed"
```

In `packages/core/tests/types.test.ts`, replace the existing import with:

```ts
import { MessageRole, type EventType } from "../src/types.js";
```

Then replace the existing `types` array inside `it("accepts all EventType values")` so every listed value is checked against `EventType`:

```ts
const types = [
  "UserMessageReceived",
  "AgentThinking",
  "AgentResponseSent",
  "MessageStored",
  "ToolCalled",
  "ToolFailed",
  "MemoryCreated",
  "MemoryUpdated",
  "ReflectionCompleted",
  "RelationshipChanged",
  "TrustChanged",
  "StateTransition",
  "AchievementUnlocked",
  "LevelUp",
  "GoalUpdated",
  "GoalCompleted",
  "PresenceTriggered",
  "SessionCreated",
  "SessionEnded",
  "ErrorOccurred",
  "SafetyBoundaryTriggered",
  "ChannelMessageSent",
  "ChannelSendFailed",
  "CapabilityInvoked",
  "CapabilityCompleted",
  "CapabilityDenied",
  "CapabilityFailed",
] satisfies EventType[];
```

Keep the existing `types.forEach(t => expect(t).toBeTruthy())` assertion below this array.

- [ ] **Step 4: Wire CapabilityRuntime into AgentPipeline**

Add the CapabilityRuntime import in `packages/runtime/src/pipeline.ts`:

```ts
import {
  CapabilityDeniedError,
  type CapabilityRuntime,
} from "./capability-runtime.js";
```

Append this optional field to the existing `AgentConfig`:

```ts
capabilities?: CapabilityRuntime;
```

Keep the Clock field and constructor initialization from Task 2. In `buildToolDefinitions()`, expose Capability definitions before plugins:

```ts
for (const tool of this.config.capabilities?.toolDefinitions() ?? []) {
  addTool(tool);
}

for (const tool of this.config.plugins?.tools ?? []) {
  addTool(tool);
}
```

Inside `executeTool()`, after the existing ToolPolicy decision and before calculator/plugin/skill handling, add:

```ts
const capabilityId = this.config.capabilities?.capabilityIdForTool(name);
if (capabilityId && this.config.capabilities) {
  await this.emitEvent("CapabilityInvoked", userId, correlationId, {
    capabilityId,
    toolName: name,
    surfaceId: input.channel ?? "web",
  });
  try {
    const result = await this.config.capabilities.invoke({
      capabilityId,
      userId,
      surfaceId: input.channel ?? "web",
      correlationId,
      input: args,
    });
    await this.emitEvent("CapabilityCompleted", userId, correlationId, {
      capabilityId,
      toolName: name,
      sideEffects: result.sideEffects ?? [],
    });
    return result.content;
  } catch (error) {
    if (error instanceof CapabilityDeniedError) {
      await this.emitEvent("CapabilityDenied", userId, correlationId, {
        capabilityId,
        toolName: name,
        missingPermissionIds: error.missingPermissionIds,
        reason: error.message,
      }, "high");
      return `Capability ${capabilityId} denied: ${error.message}`;
    }
    await this.emitEvent("CapabilityFailed", userId, correlationId, {
      capabilityId,
      toolName: name,
      error: error instanceof Error ? error.message : String(error),
    }, "high");
    throw error;
  }
}
```

Legacy calculator, search, plugin, and skill execution remains after this block. Do not automatically translate legacy Skills into granted Capabilities in this plan.

- [ ] **Step 5: Verify pipeline integration and legacy tool behavior**

```powershell
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/core test"
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/runtime test -- pipeline-capabilities.test.ts pipeline-tools.test.ts plugins.test.ts"
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/runtime build"
```

Expected: Capability integration PASS, existing tool/plugin tests PASS, and Runtime builds.

- [ ] **Step 6: Commit**

```powershell
D:\tools\rtk\rtk.exe git add packages/core/src/types.ts packages/core/tests/types.test.ts packages/runtime/src/pipeline.ts packages/runtime/tests/pipeline-capabilities.test.ts
D:\tools\rtk\rtk.exe git commit -m "feat(runtime): execute permissioned capabilities"
```

---

### Task 6: Document The Foundation And Run The Full Gate

**Files:**
- Create: `docs/developers/capability-foundation.md`

- [ ] **Step 1: Write the developer foundation document**

```md
# Viraha Capability Foundation

Capability is a first-class Viraha Core contract. It defines what a digital
individual can perceive or do, the permissions required, and the observable
result. Installing code never grants permission.

## Current Supported Path

1. Define a portable `CapabilityManifest` with `defineCapability()`.
2. Install the manifest and handler into `CapabilityRuntime`.
3. Grant each required `read`, `act`, `remember`, or `background` permission.
4. Invoke by Capability id or expose it to AgentPipeline as a Provider tool.
5. Read `CapabilityObservation` records for outcome, duration, grants, and side
   effects.
6. Revoke a permission to block future invocations immediately.

## Deliberate Limits Of This Slice

- Grants and observations use in-memory ports.
- No untrusted dynamic code loading or sandbox exists yet.
- No official Registry, signature verification, or publish command exists yet.
- Legacy Skills and plugins remain supported but are not automatically trusted
  as Capabilities.
- Mobile permission UI and Viraha Control Layer arrive in a separate plan.

These limits are explicit so no developer mistakes a successful local handler
for a production-safe third-party extension system.
```

- [ ] **Step 2: Run placeholder and portability scans**

```powershell
D:\tools\rtk\rtk.exe proxy rg -n "FIXME|XXX|PENDING-IMPLEMENTATION" packages/companion-core packages/runtime docs/developers/capability-foundation.md
D:\tools\rtk\rtk.exe proxy rg -n "from \"node:" packages/companion-core/src
```

Expected: both searches return no matches. A non-zero `rg` exit code is expected when no matches exist.

- [ ] **Step 3: Run package gates**

```powershell
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/companion-core test"
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/companion-core build"
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/core test"
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/runtime test"
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm --filter @viraha/runtime build"
```

Expected: all focused tests and builds PASS.

- [ ] **Step 4: Run workspace regression gates**

```powershell
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm build"
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm test:full"
D:\tools\rtk\rtk.exe proxy cmd /d /s /c "set PATH=D:\tools\node22;%PATH%&&D:\tools\node22\node.exe D:\tools\node22\node_modules\corepack\dist\corepack.js pnpm mobile:check"
```

Expected: workspace build, every package test, and existing mobile checks PASS.

- [ ] **Step 5: Inspect the final diff and commit**

```powershell
D:\tools\rtk\rtk.exe git status --short
D:\tools\rtk\rtk.exe git add docs/developers/capability-foundation.md
D:\tools\rtk\rtk.exe git diff --cached --check
D:\tools\rtk\rtk.exe git diff --cached -- docs/developers/capability-foundation.md
D:\tools\rtk\rtk.exe git commit -m "docs: explain capability foundation"
```

## Completion Gate

This plan is complete only when:

- `@viraha/companion-core` exports portable Time and Capability contracts without Node imports.
- Scheduler, EventBus, and AgentPipeline use an injected Clock for implicit current time in the covered paths.
- Wall-clock correction does not produce a negative processing duration.
- A Capability installs without receiving permission.
- Required read, act, remember, and background grants are evaluated independently.
- Expired, revoked, and exhausted once-grants deny invocation.
- Successful, denied, and failed Capability invocations produce observations.
- AgentPipeline exposes and executes a granted Capability while legacy tools and plugins remain green.
- Capability invocation, completion, denial, and failure events are available to the existing EventBus/EventStore path.
- Existing mobile checks pass without importing Node-only modules into `companion-core`.
- The developer document clearly states that untrusted side-loading, persistence, Registry, and CLI remain follow-on work.

## Next Plans

After this plan passes, write separate implementation plans in this order:

1. **Viraha Developer SDK And Local Side-Load**: manifest files, signature model, sandbox boundary, `viraha create/dev/test/sign`, and local Registry.
2. **Current Moment And Control Layer**: replace onboarding categories and chat-first mobile state with the approved Presence surface and neutral system controls.
3. **Persistent Grants And Identity Archive**: SQLite grants, observations, export, migration, and explicit fork lineage.
4. **Multimodal Capabilities**: image, record-transcribe-confirm voice, music, and model capability routing.
5. **Continuous Presence**: optional Habitat workers, budgets, quiet hours, temporal truth, and Bridge surfaces.
