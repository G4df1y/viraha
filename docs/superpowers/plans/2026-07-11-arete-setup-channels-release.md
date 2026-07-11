# Arete Setup Channels And Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the in-product first-run wizard, dynamic Feishu/QQ management, diagnostics surface, and clean Windows release gate for Arete Studio v0.3.

**Architecture:** Reuse the atomic config and ProviderManager from Plan 2. Move channel construction from static environment reads to a server-owned ChannelManager that can test, save, start, stop, and report adapters without restarting the process. The React app fetches one bootstrap state at startup, overlays the setup wizard only while incomplete, and keeps every recovery action available later from Models, Channels, and Settings.

**Tech Stack:** TypeScript, Hono, React, SQLite EventStore, Feishu/QQ WebSocket adapters, Vitest, Testing Library, Playwright, GitHub Actions Windows.

---

## Execution Prerequisites

- Complete the foundation/chat and models/multimodal plans first.
- Use a real Git checkout, RTK on `PATH`, Node.js 22 LTS, and the approved Quiet Sport Tech 2002 shell.
- Real channel acceptance requires one maintainer-owned Feishu or QQ test application; never commit those credentials.

## File Map

**Channel lifecycle**

- Modify `packages/channels/src/adapters/feishu.ts`, `qq.ts`, `hub.ts`, `types.ts`, `index.ts`.
- Create `packages/channels/tests/channel-lifecycle.test.ts`.
- Create `apps/arete/src/config/channel-config.ts`, `onboarding-config.ts`.
- Create `apps/arete/src/services/channel-manager.ts`, `channel-test-tracker.ts`.
- Create `apps/arete/src/api/channels.ts`, `bootstrap.ts`, `diagnostics.ts`.
- Modify `apps/arete/src/index.ts`, `web.ts`, `cli/doctor.ts`.

**Product UI**

- Create `apps/arete/web/src/features/setup/SetupWizard.tsx`, `steps/RuntimeStep.tsx`, `steps/ProviderStep.tsx`, `steps/EntryPointStep.tsx`, `steps/ChannelStep.tsx`, and `steps/FinishStep.tsx`.
- Create `apps/arete/web/src/features/channels/ChannelsPage.tsx`, `ChannelRow.tsx`, `ChannelSetupPanel.tsx`.
- Create `apps/arete/web/src/features/settings/DiagnosticsPage.tsx`, `DiagnosticRow.tsx`.
- Create `apps/arete/web/src/app/useBootstrap.ts`; modify `App.tsx` and navigation status.

**Verification and docs**

- Create/expand API, component, and Playwright tests.
- Modify `.env.example`, `README.md`, `docs/release-checklist.md`, `docs/v2/vision-and-roadmap.md`.
- Create `docs/acceptance/arete-v0.3-template.md`.

---

### Task 1: Make Channel Adapters Configurable And Testable At Runtime

**Files:**
- Modify: `packages/channels/src/adapters/feishu.ts`
- Modify: `packages/channels/src/adapters/qq.ts`
- Modify: `packages/channels/src/types.ts`
- Modify: `packages/channels/src/index.ts`
- Test: `packages/channels/tests/channel-lifecycle.test.ts`

- [ ] **Step 1: Write failing credential-test contracts**

```ts
import { describe, expect, it, vi } from "vitest"
import { testFeishuCredentials, testQQCredentials } from "../src/index.js"

describe("channel credential tests", () => {
  it("tests Feishu without starting an adapter", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ code: 0, app_access_token: "token" }), { status: 200 }))
    await expect(testFeishuCredentials({ appId: "cli_x", appSecret: "secret" }, fetchFn)).resolves.toEqual({ ok: true })
  })

  it("redacts QQ error bodies", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ message: "bad secret secret-value" }), { status: 401 }))
    const result = await testQQCredentials({ appId: "1", clientSecret: "secret-value" }, fetchFn)
    expect(result.ok).toBe(false)
    expect(result.error).not.toContain("secret-value")
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```powershell
rtk pnpm --filter @viraha/channels exec vitest run tests/channel-lifecycle.test.ts
```

Expected: FAIL because configs and test functions are not exported.

- [ ] **Step 3: Export config types and credential tests**

Change private interfaces to exports:

```ts
export interface FeishuConfig { appId: string; appSecret: string; connectionMode?: "websocket" | "webhook"; encryptKey?: string; verificationToken?: string; webhookPort?: number }
export interface QQConfig { appId: string; clientSecret?: string; token?: string; groupOpenId?: string }
export interface ChannelCredentialTestResult { ok: boolean; error?: string }
```

Implement `testFeishuCredentials(config, fetchFn = fetch)` using the existing app-token endpoint and `testQQCredentials` using the existing QQ token endpoint. Return short user-safe errors; do not return response bodies verbatim.

- [ ] **Step 4: Add adapter status**

Extend `ChannelAdapter`:

```ts
export interface ChannelStatus {
  platform: string
  configured: boolean
  running: boolean
  mode?: string
  lastError?: string
}

export interface ChannelAdapter {
  // existing members
  status(): ChannelStatus
}
```

Implement `status()` in Feishu and QQ using current connection mode and running state. BaseAdapter should store a sanitized `lastError` when start fails.

- [ ] **Step 5: Run tests and commit**

```powershell
rtk pnpm --filter @viraha/channels test
rtk git add packages/channels
rtk git commit -m "feat(channels): expose runtime channel checks"
```

---

### Task 2: Add ChannelManager And Dynamic Hub Replacement

**Files:**
- Modify: `packages/channels/src/hub.ts`
- Test: `packages/channels/tests/channel-lifecycle.test.ts`
- Create: `apps/arete/src/config/channel-config.ts`
- Create: `apps/arete/src/services/channel-manager.ts`
- Test: `apps/arete/tests/channel-manager.test.ts`
- Modify: `apps/arete/src/index.ts`

- [ ] **Step 1: Write failing hub replacement tests**

Add a fake adapter test proving `hub.replace("feishu", factory)` stops the old running adapter, installs the new adapter, preserves existing message handlers, starts it, and reports the new status. Add a removal test proving `hub.remove("feishu")` stops and deletes the adapter.

- [ ] **Step 2: Implement explicit lifecycle methods**

Add to `ChannelHub`:

```ts
async replace(platform: string, factory: ChannelAdapterFactory): Promise<ChannelStatus> {
  const current = this.adapters.get(platform)
  const previousFactory = this.factories.get(platform)
  if (current) await current.stop()
  this.adapters.delete(platform)
  this.factories.set(platform, factory)
  const adapter = factory()
  if (!adapter) return { platform, configured: false, running: false }
  adapter.onMessage(async message => this.dispatch(message))
  this.adapters.set(platform, adapter)
  try {
    await adapter.start()
    return adapter.status()
  } catch (error) {
    this.adapters.delete(platform)
    if (current && previousFactory) {
      this.factories.set(platform, previousFactory)
      this.adapters.set(platform, current)
      await current.start()
    }
    throw error
  }
}

async remove(platform: string): Promise<void> {
  const current = this.adapters.get(platform)
  if (current) await current.stop()
  this.adapters.delete(platform)
  this.factories.delete(platform)
}

statuses(): ChannelStatus[] {
  return [...new Set([...this.factories.keys(), ...this.adapters.keys()])].map(platform =>
    this.adapters.get(platform)?.status() ?? { platform, configured: false, running: false },
  )
}
```

- [ ] **Step 3: Implement channel config persistence**

Reuse `AtomicJsonStore` with:

```ts
export interface StoredChannelConfig {
  feishu?: FeishuConfig
  qq?: QQConfig
}
```

Implement the store wrapper:

```ts
export class ChannelConfigStore {
  private json: AtomicJsonStore<StoredChannelConfig>
  constructor(filePath: string) { this.json = new AtomicJsonStore(filePath, {}) }
  read() { return this.json.read() }
  write(value: StoredChannelConfig) { return this.json.write(value) }
  async listPublic() {
    const value = await this.read()
    return [
      { platform: "feishu" as const, configured: Boolean(value.feishu), mode: value.feishu?.connectionMode ?? "websocket", appIdHint: value.feishu?.appId ? `${value.feishu.appId.slice(0, 6)}…` : undefined },
      { platform: "qq" as const, configured: Boolean(value.qq), mode: value.qq?.clientSecret ? "websocket" : value.qq?.token ? "push-only" : undefined, appIdHint: value.qq?.appId ? `${value.qq.appId.slice(0, 4)}…` : undefined },
    ]
  }
}
```

Public output contains only configured state, mode, and masked App ID; never return secrets or tokens.

- [ ] **Step 4: Implement ChannelManager**

```ts
export class ChannelManager {
  constructor(private hub: ChannelHub, private store: ChannelConfigStore) {}
  async loadAndStart(): Promise<ChannelStatus[]> {
    const config = await this.store.read()
    if (config.feishu) await this.hub.replace("feishu", () => new FeishuAdapter(config.feishu!))
    if (config.qq) await this.hub.replace("qq", () => new QQAdapter(config.qq!))
    return this.hub.statuses()
  }
  async test(platform: "feishu" | "qq", input: unknown): Promise<ChannelCredentialTestResult> {
    return platform === "feishu"
      ? testFeishuCredentials(feishuConfigSchema.parse(input))
      : testQQCredentials(qqConfigSchema.parse(input))
  }
  async save(platform: "feishu" | "qq", input: unknown): Promise<ChannelStatus> {
    const config = platform === "feishu" ? feishuConfigSchema.parse(input) : qqConfigSchema.parse(input)
    const tested = await this.test(platform, config)
    if (!tested.ok) throw new Error(tested.error || `${platform} credential test failed`)
    const current = await this.store.read()
    const next = platform === "feishu" ? { ...current, feishu: config } : { ...current, qq: config }
    const status = platform === "feishu"
      ? this.hub.replace("feishu", () => new FeishuAdapter(config as FeishuConfig))
      : this.hub.replace("qq", () => new QQAdapter(config as QQConfig))
    const running = await status
    try {
      await this.store.write(next)
      return running
    } catch (error) {
      if (platform === "feishu" && current.feishu) await this.hub.replace("feishu", () => new FeishuAdapter(current.feishu!))
      else if (platform === "qq" && current.qq) await this.hub.replace("qq", () => new QQAdapter(current.qq!))
      else await this.hub.remove(platform)
      throw error
    }
  }
  async remove(platform: "feishu" | "qq"): Promise<void> {
    const current = await this.store.read()
    if (platform === "feishu") delete current.feishu
    else delete current.qq
    await this.store.write(current)
    await this.hub.remove(platform)
  }
  async list(): Promise<PublicChannelConfig[]> {
    const publicConfig = await this.store.listPublic()
    const statuses = new Map(this.hub.statuses().map(status => [status.platform, status]))
    return publicConfig.map(config => ({ ...config, ...(statuses.get(config.platform) ?? { running: false }) }))
  }
}
```

Use Zod schemas with exact fields and reject unknown keys. `save` must test before overwriting a working config.

```ts
const feishuConfigSchema = z.object({
  appId: z.string().min(1),
  appSecret: z.string().min(1),
  connectionMode: z.enum(["websocket", "webhook"]).default("websocket"),
  encryptKey: z.string().optional(),
  verificationToken: z.string().optional(),
  webhookPort: z.number().int().min(1).max(65535).optional(),
}).strict()

const qqConfigSchema = z.object({
  appId: z.string().min(1),
  clientSecret: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  groupOpenId: z.string().optional(),
}).strict().refine(value => Boolean(value.clientSecret || value.token), "QQ requires clientSecret or token")
```

- [ ] **Step 5: Replace `fromEnv` startup in `index.ts`**

Keep `.env` as one-time compatibility import: if no channel config file exists, translate valid environment variables into `StoredChannelConfig`, save once, and then use ChannelManager. All later changes use the config store.

- [ ] **Step 6: Run tests and commit**

```powershell
rtk pnpm --filter @viraha/channels test
rtk pnpm --filter @viraha/arete exec vitest run tests/channel-manager.test.ts
rtk git add packages/channels apps/arete/src/config/channel-config.ts apps/arete/src/services/channel-manager.ts apps/arete/src/index.ts apps/arete/tests/channel-manager.test.ts
rtk git commit -m "feat(arete): manage channels without restart"
```

---

### Task 3: Add Channel APIs And Real Message Verification Tracker

**Files:**
- Create: `apps/arete/src/services/channel-test-tracker.ts`
- Create: `apps/arete/src/api/channels.ts`
- Modify: `apps/arete/src/index.ts`
- Modify: `apps/arete/src/web.ts`
- Test: `apps/arete/tests/channels-api.test.ts`

- [ ] **Step 1: Write failing API tests**

Test:

- `GET /api/channels` returns public state only.
- `POST /api/channels/feishu/test` tests credentials without saving.
- `PUT /api/channels/feishu` tests then saves and starts.
- Failed test preserves old config.
- `POST /api/channels/feishu/verify` creates a five-minute verification.
- An inbound message plus outbound receipt marks the verification complete.

- [ ] **Step 2: Implement verification tracker**

```ts
interface ChannelVerification {
  id: string
  platform: "feishu" | "qq"
  startedAt: number
  expiresAt: number
  inboundAt?: string
  outboundAt?: string
  status: "waiting" | "replying" | "passed" | "failed" | "expired"
  error?: string
}
```

`ChannelTestTracker` creates, reads, expires, records inbound, and records outbound events. It never stores message text or platform user IDs in the API response.

- [ ] **Step 3: Wire tracker into the existing message path**

At the start of `hub.onMessage`, call `tracker.recordInbound(msg.platform)`. In the ChannelHub event sink, call `recordOutbound(platform, success, error)` after writing EventStore. This verifies the real `inbound -> pipeline -> reply -> receipt` path.

- [ ] **Step 4: Add routes**

```text
GET    /api/channels
POST   /api/channels/:platform/test
PUT    /api/channels/:platform
DELETE /api/channels/:platform
POST   /api/channels/:platform/verify
GET    /api/channels/verifications/:id
```

Return HTTP 422 for invalid fields, 502 for external credential failures, and 409 when verification is requested for a non-running adapter.

- [ ] **Step 5: Run tests and commit**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/channels-api.test.ts
rtk git add apps/arete/src/services/channel-test-tracker.ts apps/arete/src/api/channels.ts apps/arete/src/index.ts apps/arete/src/web.ts apps/arete/tests/channels-api.test.ts
rtk git commit -m "feat(arete): add channel setup APIs"
```

---

### Task 4: Add Bootstrap State And First-Run Wizard

**Files:**
- Create: `apps/arete/src/config/onboarding-config.ts`
- Create: `apps/arete/src/api/bootstrap.ts`
- Create: `apps/arete/web/src/app/useBootstrap.ts`
- Create: `apps/arete/web/src/features/setup/SetupWizard.tsx`
- Create: `apps/arete/web/src/features/setup/steps/RuntimeStep.tsx`
- Create: `apps/arete/web/src/features/setup/steps/ProviderStep.tsx`
- Create: `apps/arete/web/src/features/setup/steps/EntryPointStep.tsx`
- Create: `apps/arete/web/src/features/setup/steps/ChannelStep.tsx`
- Create: `apps/arete/web/src/features/setup/steps/FinishStep.tsx`
- Modify: `apps/arete/web/src/app/App.tsx`
- Test: `apps/arete/tests/bootstrap-api.test.ts`
- Test: `apps/arete/web/src/features/setup/SetupWizard.test.tsx`

- [ ] **Step 1: Write failing bootstrap tests**

Test incomplete state when no Provider exists, complete Web-only state after choosing `web`, and incomplete channel state when `feishu` was selected but not verified.

- [ ] **Step 2: Persist onboarding intent**

```ts
export interface OnboardingConfig {
  entryPoint?: "web" | "feishu" | "qq"
  completedAt?: string
  verifiedChannel?: "feishu" | "qq"
}
```

Store in `config/onboarding.json` with AtomicJsonStore.

- [ ] **Step 3: Implement bootstrap API**

`GET /api/bootstrap` returns:

```ts
interface BootstrapState {
  complete: boolean
  currentStep: "runtime" | "provider" | "entry" | "channel" | "finish"
  runtime: DoctorReport
  providers: { configured: number; defaultModel?: string }
  entryPoint?: "web" | "feishu" | "qq"
  channels: PublicChannelConfig[]
}
```

`PUT /api/bootstrap/entry` saves the chosen entry point. `POST /api/bootstrap/complete` succeeds only when doctor passes, one model exists, and the chosen channel is verified; Web-only requires no channel.

- [ ] **Step 4: Implement wizard state**

`useBootstrap` fetches once at app start and exposes `refresh`. `App` renders the normal Studio shell behind an accessible modal wizard when incomplete. The wizard cannot be dismissed until runtime and Provider steps pass; channel choice may be Web-only.

The five steps use the same Models and Channels APIs as their permanent pages. Do not create separate setup-only persistence logic.

- [ ] **Step 5: Run tests and commit**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/bootstrap-api.test.ts
rtk pnpm --filter @viraha/arete exec vitest run --config vitest.web.config.ts web/src/features/setup/SetupWizard.test.tsx
rtk git add apps/arete/src/config/onboarding-config.ts apps/arete/src/api/bootstrap.ts apps/arete/web/src/app apps/arete/web/src/features/setup apps/arete/tests/bootstrap-api.test.ts
rtk git commit -m "feat(arete): add first-run setup wizard"
```

---

### Task 5: Build The Permanent Channels Page

**Files:**
- Create: `apps/arete/web/src/features/channels/api.ts`
- Create: `apps/arete/web/src/features/channels/ChannelsPage.tsx`
- Create: `apps/arete/web/src/features/channels/ChannelRow.tsx`
- Create: `apps/arete/web/src/features/channels/ChannelSetupPanel.tsx`
- Modify: `apps/arete/web/src/app/App.tsx`
- Test: `apps/arete/web/src/features/channels/ChannelsPage.test.tsx`

- [ ] **Step 1: Write a failing channel-page test**

Render statuses for Feishu connected and QQ with two remaining steps. Assert secret fields are blank even when configured, Connect is disabled until credential test passes, and verification UI instructs the user to send a real platform message.

- [ ] **Step 2: Implement state-first channel rows**

Each row has stable fields:

```ts
interface ChannelViewModel {
  platform: "feishu" | "qq"
  configured: boolean
  running: boolean
  mode?: string
  remainingSteps: number
  status: "not-configured" | "incomplete" | "connecting" | "connected" | "failed"
  error?: string
}
```

Show status, mode, and one command. Do not place the full tutorial on the list page.

- [ ] **Step 3: Implement the right-side setup panel**

Feishu steps: create self-built app, copy App ID/Secret, enable bot, select long connection, add `im.message.receive_v1`, grant message permission, publish version, test credentials, save/start, verify real message.

QQ steps: create bot, copy AppID/ClientSecret, enable private/group scenes, submit review, test credentials, save/start, verify real message.

Each step has a status icon and a direct external documentation link. Secret inputs use password type and never repopulate saved secrets.

- [ ] **Step 4: Poll real verification**

After starting verification, poll every two seconds until `passed`, `failed`, or `expired`. Stop polling on unmount. Show inbound and outbound completion separately without exposing user IDs or message contents.

- [ ] **Step 5: Run tests and commit**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run --config vitest.web.config.ts web/src/features/channels/ChannelsPage.test.tsx
rtk pnpm --filter @viraha/arete build
rtk git add apps/arete/web/src/features/channels apps/arete/web/src/app/App.tsx
rtk git commit -m "feat(arete): add channel management page"
```

---

### Task 6: Add Diagnostics API, Page, And Redacted Report

**Files:**
- Create: `apps/arete/src/api/diagnostics.ts`
- Modify: `apps/arete/src/cli/doctor.ts`
- Modify: `apps/arete/src/web.ts`
- Create: `apps/arete/web/src/features/settings/DiagnosticsPage.tsx`
- Create: `apps/arete/web/src/features/settings/DiagnosticRow.tsx`
- Modify: `apps/arete/web/src/app/App.tsx`
- Test: `apps/arete/tests/diagnostics-api.test.ts`
- Test: `apps/arete/web/src/features/settings/DiagnosticsPage.test.tsx`

- [ ] **Step 1: Write failing diagnostic redaction tests**

Test that diagnostics report includes version, Node, DB, Provider, channel and scheduler states but excludes API keys, cookies, channel secrets, full local user paths, message text, and attachment bytes.

- [ ] **Step 2: Share checks between CLI and API**

Extract reusable checks from `runDoctor` so the API can add live DB, ProviderManager, ChannelManager and Scheduler results. Return:

```ts
interface DiagnosticSnapshot {
  generatedAt: string
  version: string
  checks: Array<{ id: string; label: string; ok: boolean; status: string; action?: string }>
  recentErrors: Array<{ type: string; createdAt: string; summary: string }>
}
```

Normalize paths to `<ARETE_HOME>/...` in downloadable reports.

- [ ] **Step 3: Add routes**

```text
GET /api/diagnostics
GET /api/diagnostics/report   Content-Disposition: attachment; filename=arete-diagnostics.json
```

Query only recent high-priority events and summarize known safe fields. Pass the full snapshot through `redactSecrets` before serialization.

- [ ] **Step 4: Implement DiagnosticsPage**

Render grouped rows for Runtime, Database, Models, Channels, Scheduler, Privacy, and Recent Errors. Each failed check has one direct action: open Models, open Channels, retry, or download report. Keep raw Trace behind a collapsed advanced section.

- [ ] **Step 5: Run tests and commit**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/diagnostics-api.test.ts
rtk pnpm --filter @viraha/arete exec vitest run --config vitest.web.config.ts web/src/features/settings/DiagnosticsPage.test.tsx
rtk git add apps/arete/src/api/diagnostics.ts apps/arete/src/cli/doctor.ts apps/arete/src/web.ts apps/arete/web/src/features/settings apps/arete/web/src/app/App.tsx apps/arete/tests/diagnostics-api.test.ts
rtk git commit -m "feat(arete): add product diagnostics"
```

---

### Task 7: Complete Real Release Acceptance And Product Documentation

**Files:**
- Modify: `tests/e2e/arete-studio.spec.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `docs/release-checklist.md`
- Modify: `docs/v2/vision-and-roadmap.md`
- Create: `docs/acceptance/arete-v0.3-template.md`

- [ ] **Step 1: Extend browser acceptance**

Playwright must cover incomplete bootstrap, Web-only completion, Provider failure recovery, channel setup form, expired channel verification, diagnostics navigation, desktop 1440x900, tablet 1024x768, and mobile 412x915. Capture screenshots for setup, chat, models, channels, and diagnostics.

- [ ] **Step 2: Add Windows package job**

Add a separate `windows-package` job after the normal matrix:

```yaml
windows-package:
  runs-on: windows-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: 11.7.0 }
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: pnpm }
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @viraha/arete build
    - run: pnpm --filter @viraha/arete test:pack
    - run: pnpm --filter @viraha/arete test:e2e
```

- [ ] **Step 3: Rewrite Quick Start around the product path**

README Quick Start becomes:

```powershell
npm install -g @viraha/arete
arete start
```

State Node 22 LTS, local data location, Web setup flow, supported model presets, image/voice input behavior, and the Arete fitness/medical boundary. Keep source-development commands in a separate contributor section.

`.env.example` becomes a legacy/development reference and says normal users configure secrets in Arete Studio. Never include real-looking keys.

- [ ] **Step 4: Create the acceptance record template**

The template includes environment, packed version, clean install result, doctor output summary, first chat, four domestic Provider records, vision input, STT input, real Feishu/QQ inbound/outbound/Trace record, privacy export/delete, screenshots, known limitations, reviewer and date.

- [ ] **Step 5: Run the complete release suite**

```powershell
rtk pnpm install --frozen-lockfile
rtk pnpm build
rtk pnpm test
rtk pnpm lint
rtk pnpm --filter @viraha/arete test:pack
rtk pnpm --filter @viraha/arete test:e2e
rtk pnpm --filter @viraha/arete eval:smoke
rtk pnpm --filter @viraha/arete eval:crisis
```

Expected: all automated checks PASS on Node 22. Then complete one real Provider and one real Feishu or QQ walkthrough before marking the release checklist complete.

- [ ] **Step 6: Commit**

```powershell
rtk git add .github/workflows/ci.yml tests/e2e README.md .env.example docs/release-checklist.md docs/v2/vision-and-roadmap.md docs/acceptance/arete-v0.3-template.md
rtk git commit -m "docs(arete): complete v0.3 release gate"
```

---

## Plan 3 Completion Gate

Plan 3 is complete only when:

- A new user can finish setup without editing `.env`.
- Saved Provider and channel secrets never return to the browser.
- Feishu/QQ configuration can be tested, saved, started, removed, and reconfigured without process restart.
- One real inbound message, reply, and outbound receipt passes in Feishu or QQ.
- Diagnostics explain runtime, DB, Provider, channel, scheduler, privacy, and recent failure state.
- Clean Windows package install, desktop/mobile browser tests, smoke eval, crisis eval, export/delete, image, and voice checks all pass.
