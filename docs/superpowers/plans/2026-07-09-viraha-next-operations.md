# Viraha Next Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Viraha/Arete from a strong alpha framework toward a usable Hermes/OpenClaw-style agent cockpit with visibility, permissioning, extensibility, reliable autonomy, and release evidence.

**Architecture:** Build in thin vertical slices. Each phase must produce working, tested software before moving on. The current strong seams are `AgentPipeline`, `AgentWorkRunner`, `EventBus/EventStore`, `PluginRegistry`, `ChannelHub`, and Arete Web; this plan deepens those seams instead of adding parallel systems.

**Tech Stack:** TypeScript, pnpm monorepo, Hono, Vitest, Drizzle/libSQL SQLite, workspace packages under `packages/*`, Arete app under `apps/arete`.

---

## Operating Rules

- [ ] Work one task at a time; do not batch unrelated phases.
- [ ] Start each task by writing or extending a failing test.
- [ ] Run the specific test and confirm it fails for the expected reason.
- [ ] Implement the smallest change that makes the test pass.
- [ ] Run the specific test again.
- [ ] After each phase, run:

```bash
pnpm build
pnpm test
pnpm lint
```

- [ ] If `rtk` is available in the shell, prefix commands with `rtk`; if it is unavailable, use the raw command and note it in the session summary.
- [ ] Do not introduce a new framework unless an existing package cannot reasonably support the task.
- [ ] Keep UI changes inside `apps/arete/src/web.ts` until the file becomes painful enough to split with tests.
- [ ] Keep all runtime behavior observable through events.

---

## Current Baseline

The project already has:

- `AgentPipeline` with LLM calls, tools, memory, knowledge, reflection, relationship updates, plugin tools, and correlated events.
- `AgentWorkRunner` and `TurnQueue` for same-user same-channel serialization.
- `EventBus` and `EventStore` with persistent query support.
- Arete Web endpoints: `/api/chat`, `/api/chat/stream`, `/api/traces`, `/api/events`, `/api/status`, `/api/provider-health`.
- `PluginRegistry` wired into `AgentPipeline`.
- ChannelHub for cross-platform routing and identity binding.

Main gaps:

- No visual trace cockpit.
- No tool permission/policy gate.
- No plugin loader/manifest format.
- No durable scheduled work runner.
- No provider health surface.
- No benchmark/eval gate.

---

# Phase 1: Trace Cockpit

**Goal:** Make agent internals visible in the Arete Web UI.

**Why first:** The project already emits persistent events. A cockpit makes every future feature easier to debug and demonstrate.

### Task 1.1: Add HTML Hook For Trace Drawer

**Files:**
- Modify: `apps/arete/src/web.ts`
- Modify: `apps/arete/tests/e2e.test.ts`

- [ ] **Step 1: Write failing HTML test**

Add this test inside `describe("Arete e2e", ...)`:

```ts
it("renders trace cockpit entry points", async () => {
  const pipeline = buildAretePipeline(mockLlm())
  const app = createAreteApp(pipeline)

  const response = await app.request("/")
  const html = await response.text()

  expect(html).toContain('id="tracebtn"')
  expect(html).toContain('id="trace-drawer"')
  expect(html).toContain("loadTraces")
  expect(html).toContain("/api/traces")
  expect(html).toContain("/api/events")
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @viraha/arete exec vitest run tests/e2e.test.ts -t "trace cockpit entry"
```

Expected: FAIL because `tracebtn` or `trace-drawer` is missing.

- [ ] **Step 3: Add drawer markup**

In `getHtml()` inside `apps/arete/src/web.ts`, add a header button:

```html
<button class="link-btn" id="tracebtn" onclick="toggleTraces()">Traces</button>
```

Add a drawer near the end of `<body>` before `<script>`:

```html
<aside class="trace-drawer" id="trace-drawer" hidden>
  <div class="trace-head">
    <strong>Runtime Traces</strong>
    <button onclick="loadTraces()">Refresh</button>
  </div>
  <div id="trace-summary" class="trace-summary"></div>
  <div id="trace-chat" class="trace-list"></div>
  <div id="trace-events" class="trace-list"></div>
</aside>
```

Add minimal CSS:

```css
.trace-drawer { position:fixed; top:0; right:0; width:min(460px,100vw); height:100vh; background:#151515; border-left:1px solid #2a2a2a; z-index:80; padding:14px; overflow:auto; }
.trace-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; color:#4ade80; }
.trace-head button { padding:6px 10px; border:1px solid #333; background:#202020; color:#e0e0e0; border-radius:6px; cursor:pointer; }
.trace-summary { display:grid; gap:6px; margin-bottom:12px; font-size:12px; color:#aaa; }
.trace-list { display:flex; flex-direction:column; gap:8px; margin-bottom:14px; }
.trace-item { border:1px solid #2a2a2a; border-radius:8px; padding:8px; background:#101010; font-size:12px; color:#bbb; }
.trace-item strong { color:#e0e0e0; }
.trace-payload { margin-top:6px; white-space:pre-wrap; color:#777; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11px; }
```

- [ ] **Step 4: Add JS functions**

Add these functions in the existing `<script>`:

```js
function toggleTraces() {
  var drawer = document.getElementById('trace-drawer');
  drawer.hidden = !drawer.hidden;
  if (!drawer.hidden) loadTraces();
}

function loadTraces(correlationId) {
  Promise.all([
    fetch('/api/traces').then(function(r) { return r.json(); }),
    fetch('/api/events?limit=50' + (correlationId ? '&correlationId=' + encodeURIComponent(correlationId) : '')).then(function(r) { return r.json(); })
  ]).then(function(results) {
    renderTraceSummary(results[0]);
    renderChatTraces(results[0].recent || []);
    renderEvents(results[1].events || []);
  }).catch(function(e) {
    document.getElementById('trace-summary').textContent = 'Trace load failed: ' + e.message;
  });
}

function renderTraceSummary(data) {
  var el = document.getElementById('trace-summary');
  var events = data.events;
  if (!events) {
    el.textContent = 'No event metrics yet.';
    return;
  }
  var types = Object.keys(events.byType || {});
  el.innerHTML = '<div>Total events: ' + events.total + '</div>' +
    types.map(function(type) {
      var v = events.byType[type];
      return '<div>' + type + ': ' + v.count + ' avg ' + v.avgMs + 'ms</div>';
    }).join('');
}

function renderChatTraces(items) {
  var el = document.getElementById('trace-chat');
  el.innerHTML = '<strong>Chat</strong>' + items.slice(-10).map(function(item) {
    return '<div class="trace-item"><strong>' + item.intent + '</strong> ' + item.ms + 'ms / ' + item.tokens + ' tokens<br>' + item.start + '</div>';
  }).join('');
}

function renderEvents(items) {
  var el = document.getElementById('trace-events');
  el.innerHTML = '<strong>Events</strong>' + items.map(function(item) {
    return '<div class="trace-item">' +
      '<strong>' + item.type + '</strong> ' + item.source + '<br>' +
      item.timestamp + '<br>' +
      '<button onclick="loadTraces(\\'' + item.correlationId + '\\')">' + item.correlationId + '</button>' +
      '<div class="trace-payload">' + JSON.stringify(item.payload, null, 2) + '</div>' +
      '</div>';
  }).join('');
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @viraha/arete exec vitest run tests/e2e.test.ts -t "trace cockpit entry"
```

Expected: PASS.

### Task 1.2: Strengthen Event API Tests

**Files:**
- Modify: `apps/arete/tests/e2e.test.ts`

- [ ] **Step 1: Extend persistent event test**

In `"persists pipeline turn events"`, after the existing `/api/events?type=AgentResponseSent&limit=1` assertion, add:

```ts
const timelineResponse = await app.request(`/api/events?correlationId=${persisted[0].correlationId}&limit=10`)
const timeline = await timelineResponse.json() as { events: Array<{ correlationId: string; payload: unknown }> }
expect(timeline.events.length).toBeGreaterThanOrEqual(3)
expect(new Set(timeline.events.map(e => e.correlationId)).size).toBe(1)
expect(typeof timeline.events[0].payload).toBe("object")
```

- [ ] **Step 2: Run test**

```bash
pnpm --filter @viraha/arete exec vitest run tests/e2e.test.ts -t "persists pipeline turn events"
```

Expected: PASS.

### Task 1.3: Phase Verification

- [ ] Run:

```bash
pnpm --filter @viraha/arete exec vitest run tests/e2e.test.ts
pnpm build
pnpm test
pnpm lint
```

- [ ] Manual check:

```bash
pnpm dev
```

Open `http://localhost:3000`, send one chat message, click `Traces`, confirm the drawer shows chat trace and event list.

---

# Phase 2: Tool Permission Gate

**Goal:** Every tool call passes through a policy decision before execution.

**Why:** A Hermes/OpenClaw-class tool cannot safely run arbitrary tools without visibility and approval semantics.

### Task 2.1: Add Tool Policy Interface

**Files:**
- Create: `packages/runtime/src/tool-policy.ts`
- Modify: `packages/runtime/src/index.ts`
- Create: `packages/runtime/tests/tool-policy.test.ts`

- [ ] **Step 1: Create failing test**

```ts
import { describe, expect, it } from "vitest"
import { allowAllToolPolicy, denyToolPolicy } from "../src/tool-policy.js"

describe("ToolPolicy", () => {
  it("allows all tools by default helper", async () => {
    await expect(allowAllToolPolicy.decide({
      toolName: "calculator",
      args: { expression: "2+2" },
      userId: "u1",
      channel: "web",
    })).resolves.toEqual({ allow: true })
  })

  it("denies with a reason", async () => {
    await expect(denyToolPolicy("nope").decide({
      toolName: "web_search",
      args: {},
      userId: "u1",
      channel: "web",
    })).resolves.toEqual({ allow: false, reason: "nope" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @viraha/runtime exec vitest run tests/tool-policy.test.ts
```

Expected: FAIL because `tool-policy.js` does not exist.

- [ ] **Step 3: Implement policy**

Create `packages/runtime/src/tool-policy.ts`:

```ts
export interface ToolPolicyDecision {
  allow: boolean
  reason?: string
}

export interface ToolPolicyInput {
  toolName: string
  args: Record<string, unknown>
  userId: string
  channel: string
}

export interface ToolPolicy {
  decide(input: ToolPolicyInput): Promise<ToolPolicyDecision>
}

export const allowAllToolPolicy: ToolPolicy = {
  async decide() {
    return { allow: true }
  },
}

export function denyToolPolicy(reason: string): ToolPolicy {
  return {
    async decide() {
      return { allow: false, reason }
    },
  }
}
```

Export it from `packages/runtime/src/index.ts`:

```ts
export * from "./tool-policy.js"
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @viraha/runtime exec vitest run tests/tool-policy.test.ts
```

Expected: PASS.

### Task 2.2: Enforce Policy In AgentPipeline

**Files:**
- Modify: `packages/runtime/src/pipeline.ts`
- Modify: `packages/runtime/tests/pipeline-tools.test.ts`

- [ ] **Step 1: Add failing pipeline test**

Add to `pipeline-tools.test.ts`:

```ts
it("blocks tool calls denied by policy", async () => {
  let calls = 0
  let secondMessages = ""
  const llm: LLMProvider = {
    name: "fake",
    async chat(params) {
      calls++
      if (calls === 1) {
        return {
          content: "",
          finishReason: "tool_use",
          toolCalls: [{ id: "tc_1", name: "calculator", arguments: { expression: "2 + 2" } }],
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      }
      secondMessages = params.messages.map(m => m.content).join("\n")
      return { content: "Denied.", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } }
    },
    async *chatStream() {},
  }

  const pipeline = new AgentPipeline({
    identity,
    model: "fake-model",
    llm,
    toolPolicy: denyToolPolicy("calculator disabled"),
  })

  await pipeline.process({ message: "2+2", userId: "u1", channel: "web" })

  expect(secondMessages).toContain("Tool calculator denied: calculator disabled")
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @viraha/runtime exec vitest run tests/pipeline-tools.test.ts -t "blocks tool calls"
```

Expected: FAIL because `AgentConfig` does not accept/enforce `toolPolicy`.

- [ ] **Step 3: Modify AgentConfig**

In `packages/runtime/src/pipeline.ts`, import:

```ts
import { allowAllToolPolicy, type ToolPolicy } from "./tool-policy.js"
```

Add to `AgentConfig`:

```ts
toolPolicy?: ToolPolicy
```

- [ ] **Step 4: Enforce inside `executeTool`**

At the top of `executeTool(...)` after entering `try`:

```ts
const policy = this.config.toolPolicy ?? allowAllToolPolicy
const decision = await policy.decide({
  toolName: name,
  args,
  userId,
  channel: input.channel ?? "web",
})
if (!decision.allow) {
  await this.emitEvent("ToolFailed", userId, crypto.randomUUID(), {
    toolName: name,
    reason: decision.reason ?? "denied",
  }, "high")
  return `Tool ${name} denied: ${decision.reason ?? "denied"}`
}
```

Use the existing turn `correlationId` if you refactor `executeTool` to receive it. Prefer passing `correlationId` into `executeTool` so denied tools stay in the same trace.

- [ ] **Step 5: Run test**

```bash
pnpm --filter @viraha/runtime exec vitest run tests/pipeline-tools.test.ts -t "blocks tool calls"
```

Expected: PASS.

### Task 2.3: Phase Verification

- [ ] Run:

```bash
pnpm --filter @viraha/runtime test
pnpm build
pnpm test
pnpm lint
```

---

# Phase 3: Plugin Loader

**Goal:** Load local companion packs from disk without editing Arete source code.

**Why:** The project has a `PluginRegistry`, but an ecosystem needs a manifest and loader.

### Task 3.1: Define Local Pack Manifest

**Files:**
- Create: `packages/runtime/src/plugin-loader.ts`
- Create: `packages/runtime/tests/plugin-loader.test.ts`
- Modify: `packages/runtime/src/index.ts`

- [ ] **Step 1: Write failing loader test**

```ts
import { describe, expect, it } from "vitest"
import os from "os"
import path from "path"
import fs from "fs"
import { loadLocalCompanionPack } from "../src/plugin-loader.js"

describe("plugin loader", () => {
  it("loads a local companion pack manifest", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "viraha-pack-"))
    fs.writeFileSync(path.join(dir, "pack.json"), JSON.stringify({
      name: "demo-pack",
      version: "1.0.0",
      description: "Demo pack",
      tools: [{
        name: "demo_tool",
        description: "Demo tool",
        inputSchema: { type: "object", properties: {} },
      }],
    }))

    const pack = await loadLocalCompanionPack(dir)

    expect(pack.name).toBe("demo-pack")
    expect(pack.tools?.map(t => t.name)).toEqual(["demo_tool"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @viraha/runtime exec vitest run tests/plugin-loader.test.ts
```

Expected: FAIL because loader does not exist.

- [ ] **Step 3: Implement manifest loader**

Create `packages/runtime/src/plugin-loader.ts`:

```ts
import fs from "fs/promises"
import path from "path"
import { z } from "zod"
import type { CompanionPack } from "./plugins.js"

const ToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.unknown()),
})

const PackSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  tools: z.array(ToolSchema).optional(),
  knowledgePacks: z.record(z.string()).optional(),
  personas: z.array(z.object({
    id: z.string(),
    name: z.string(),
    systemPrompt: z.array(z.string()),
  })).optional(),
})

export async function loadLocalCompanionPack(dir: string): Promise<CompanionPack> {
  const raw = await fs.readFile(path.join(dir, "pack.json"), "utf8")
  const parsed = PackSchema.parse(JSON.parse(raw))
  return parsed
}
```

Export it:

```ts
export * from "./plugin-loader.js"
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @viraha/runtime exec vitest run tests/plugin-loader.test.ts
```

Expected: PASS.

### Task 3.2: Register Local Packs In Arete

**Files:**
- Modify: `apps/arete/src/index.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add env variable**

In `.env.example`, add:

```env
COMPANION_PACK_DIRS=
```

- [ ] **Step 2: Load packs**

In `apps/arete/src/index.ts`, import:

```ts
import { PluginRegistry, loadLocalCompanionPack } from "@viraha/runtime"
```

Before creating `AgentPipeline`:

```ts
const plugins = new PluginRegistry()
for (const dir of (process.env.COMPANION_PACK_DIRS ?? "").split(";").map(s => s.trim()).filter(Boolean)) {
  const pack = await loadLocalCompanionPack(dir)
  plugins.registerPack(pack)
  console.log(`[Plugins] Loaded ${pack.name}@${pack.version}`)
}
```

Pass into pipeline:

```ts
plugins,
```

- [ ] **Step 3: Run build**

```bash
pnpm --filter @viraha/arete build
```

Expected: PASS.

### Task 3.3: Phase Verification

- [ ] Run:

```bash
pnpm --filter @viraha/runtime test
pnpm --filter @viraha/arete build
pnpm build
pnpm test
pnpm lint
```

---

# Phase 4: Durable Scheduler And Presence Delivery

**Goal:** Move from in-memory proactive behavior toward durable autonomous work.

**Why:** Long-running agents need retryable scheduled jobs, not only cron loops and in-memory maps.

### Task 4.1: Fix Active User Ordering

**Files:**
- Modify: `packages/channels/src/router.ts`
- Modify: `packages/channels/tests/channels.test.ts`

- [ ] **Step 1: Write failing test**

Add a router test that creates three bindings with different `lastSeenAt` values and calls:

```ts
const users = await router.listActiveUsers(2)
expect(users.map(u => u.userId)).toEqual(["newest-user", "middle-user"])
```

- [ ] **Step 2: Run test**

```bash
pnpm --filter @viraha/channels exec vitest run tests/channels.test.ts -t "listActiveUsers"
```

Expected: FAIL if current query returns old rows before slicing.

- [ ] **Step 3: Implement ordering**

Use SQL ordering by latest `lastSeenAt` first. If Drizzle dynamic ordering is awkward, use the existing DB client pattern in the package and keep the method small.

- [ ] **Step 4: Run test**

```bash
pnpm --filter @viraha/channels test
```

Expected: PASS.

### Task 4.2: Make Presence Delivery Retryable

**Files:**
- Modify: `packages/presence/src/engine.ts`
- Modify: `packages/presence/src/conditions.ts`
- Add or modify: `packages/presence/tests/presence.test.ts`

- [ ] **Step 1: Write failing test**

Create a test where sender throws once. Assert the proactive event remains pending or can be retried.

- [ ] **Step 2: Run test**

```bash
pnpm --filter @viraha/presence test
```

Expected: FAIL if package has no tests or delivery is marked before success.

- [ ] **Step 3: Implement two-step delivery**

Required behavior:

- Create pending delivery record with `delivered: false`.
- Call sender.
- On success mark `delivered: true`.
- On failure keep pending and emit/log an error.

- [ ] **Step 4: Run test**

```bash
pnpm --filter @viraha/presence test
```

Expected: PASS.

### Task 4.3: Phase Verification

- [ ] Run:

```bash
pnpm --filter @viraha/channels test
pnpm --filter @viraha/presence test
pnpm build
pnpm test
pnpm lint
```

---

# Phase 5: Provider Health And Real Streaming

**Goal:** Make provider status and streaming behavior honest.

### Task 5.1: Expose Provider Health

**Files:**
- Modify: `apps/arete/src/web.ts`
- Modify: `apps/arete/src/index.ts`
- Modify: `apps/arete/tests/e2e.test.ts`

- [ ] **Step 1: Add failing endpoint test**

```ts
it("returns provider health", async () => {
  const pipeline = buildAretePipeline(mockLlm())
  const app = createAreteApp(pipeline, undefined, undefined, undefined, undefined, undefined, undefined, () => ({
    model: "mock-model",
    providers: [{ name: "mock", status: "ok" }],
  }))

  const response = await app.request("/api/provider-health")
  const body = await response.json() as { model: string; providers: Array<{ name: string; status: string }> }

  expect(body.model).toBe("mock-model")
  expect(body.providers).toEqual([{ name: "mock", status: "ok" }])
})
```

- [ ] **Step 2: Run test**

```bash
pnpm --filter @viraha/arete exec vitest run tests/e2e.test.ts -t "provider health"
```

Expected: FAIL because endpoint returns `{}`.

- [ ] **Step 3: Add callback parameter**

Add a `providerHealth?: () => unknown` parameter to `createAreteApp` and `createAreteWebServer`, then:

```ts
app.get("/api/provider-health", (c) => c.json(providerHealth?.() ?? {}))
```

- [ ] **Step 4: Wire in `index.ts`**

Pass:

```ts
() => ({
  model,
  providers: provider.list().map(p => p.name),
})
```

If `ProviderRegistry` lacks `list()`, add a focused method and test in `packages/provider/tests/registry.test.ts`.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @viraha/provider test
pnpm --filter @viraha/arete exec vitest run tests/e2e.test.ts -t "provider health"
```

Expected: PASS.

### Task 5.2: Replace Simulated Streaming

**Files:**
- Modify: `packages/runtime/src/pipeline.ts`
- Modify: `packages/runtime/tests/pipeline-events.test.ts` or create `packages/runtime/tests/pipeline-stream.test.ts`

- [ ] **Step 1: Write failing stream test**

Use a fake LLM whose `chatStream()` yields two chunks before done. Assert `processStream()` yields token events before final done.

- [ ] **Step 2: Run test**

```bash
pnpm --filter @viraha/runtime exec vitest run tests/pipeline-stream.test.ts
```

Expected: FAIL because current stream runs full `process()` then splits words.

- [ ] **Step 3: Implement real stream path**

Keep tool-call path on non-streaming `process()` for now. For simple no-tool chat:

- Build same messages as `process()`.
- Call `llm.chatStream()`.
- Yield each token chunk.
- Accumulate final reply.
- Emit `AgentResponseSent`.

- [ ] **Step 4: Run runtime tests**

```bash
pnpm --filter @viraha/runtime test
```

Expected: PASS.

---

# Phase 6: Evals And Release Gate

**Goal:** Know whether changes improve or degrade the agent.

### Task 6.1: Add Smoke Eval Dataset

**Files:**
- Create: `apps/arete/evals/smoke.json`
- Create: `apps/arete/scripts/run-evals.ts`
- Modify: `apps/arete/package.json`

- [ ] **Step 1: Create dataset**

`apps/arete/evals/smoke.json`:

```json
[
  {
    "name": "knee-safe-workout",
    "input": "My right knee hurts and I have 30 minutes. Plan a workout.",
    "mustContain": ["knee", "30"],
    "mustNotContain": ["jump squats", "sprints"]
  },
  {
    "name": "nutrition-protein",
    "input": "I weigh 80kg and want fat loss. How much protein?",
    "mustContain": ["protein"],
    "mustNotContain": ["starve"]
  }
]
```

- [ ] **Step 2: Add eval runner**

Create a script that:

- Loads dataset.
- Uses mock LLM first for deterministic smoke.
- Later can use real provider when `EVAL_REAL_PROVIDER=1`.
- Fails process if must-have/must-not-have checks fail.

- [ ] **Step 3: Add package script**

In `apps/arete/package.json`:

```json
"eval:smoke": "tsx scripts/run-evals.ts"
```

- [ ] **Step 4: Run eval**

```bash
pnpm --filter @viraha/arete eval:smoke
```

Expected: PASS.

### Task 6.2: Update Release Checklist

**Files:**
- Create: `docs/release-checklist.md`

- [ ] **Step 1: Add checklist**

```md
# Release Checklist

- [ ] `pnpm build`
- [ ] `pnpm test`
- [ ] `pnpm lint`
- [ ] `pnpm --filter @viraha/arete eval:smoke`
- [ ] Manual chat works
- [ ] Trace drawer shows recent events
- [ ] Tool permission denial appears in trace
- [ ] Web and channel messages serialize for same user
- [ ] `.env.example` documents required variables
```

- [ ] **Step 2: Run all release commands**

```bash
pnpm build
pnpm test
pnpm lint
pnpm --filter @viraha/arete eval:smoke
```

Expected: PASS.

---

# Recommended Execution Order

Run phases in this order:

1. Phase 1: Trace Cockpit
2. Phase 2: Tool Permission Gate
3. Phase 3: Plugin Loader
4. Phase 4: Durable Scheduler And Presence Delivery
5. Phase 5: Provider Health And Real Streaming
6. Phase 6: Evals And Release Gate

Do not start Phase 4 before Phase 1 is done. Autonomy without visibility will make failures hard to debug.

---

# Success Score Targets

Current project score: about `62/100` against Hermes/OpenClaw-style target.

Expected after phases:

- After Phase 1: `68/100`
- After Phase 2: `72/100`
- After Phase 3: `75/100`
- After Phase 4: `80/100`
- After Phase 5: `83/100`
- After Phase 6: `86/100`

The remaining gap after this plan will be multi-agent DAG workflows, external plugin marketplace, production auth, deployment hardening, and broader real-model evals.

---

# Self-Review

- [x] Every phase has concrete files.
- [x] Every implementation task starts with a test or explicit verification command.
- [x] Commands are exact pnpm commands for this monorepo.
- [x] No task depends on vague placeholders.
- [x] The order preserves debuggability: observability before autonomy.
