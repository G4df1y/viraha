# Arete Models And Multimodal Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add low-cost Chinese model connections, model capability filtering, image input, and record-transcribe-confirm voice input to the working Arete Studio chat.

**Architecture:** Extend `@viraha/provider` with a neutral multimodal message contract, a dispatching registry, an OpenAI-compatible adapter, and maintained Provider presets. Keep credentials and attachment bytes server-side. Resolve stored images into provider-ready content only for the selected vision-capable model; transcribe audio through a separate optional provider method before ordinary text chat.

**Tech Stack:** TypeScript, Hono, React, SQLite/Drizzle, Web MediaRecorder, OpenAI-compatible Chat/Models/Audio APIs, Vitest, Testing Library, Playwright.

---

## Execution Prerequisites

- Complete `2026-07-11-arete-studio-foundation-chat.md` first.
- Use a real Git checkout, RTK on `PATH`, and Node.js 22 LTS.
- Preserve the existing DeepSeek and Anthropic public exports while migrating their internals.

## File Map

**Provider platform**

- Modify `packages/provider/src/types.ts`, `registry.ts`, `anthropic.ts`, `deepseek.ts`, `index.ts`.
- Create `packages/provider/src/openai-compatible.ts`, `presets.ts`.
- Create `packages/provider/tests/openai-compatible.test.ts`, `presets.test.ts`; expand `registry.test.ts`.

**Configuration and model APIs**

- Create `apps/arete/src/config/atomic-json-store.ts`, `provider-config.ts`.
- Create `apps/arete/src/services/provider-manager.ts`.
- Create `apps/arete/src/api/models.ts`.
- Modify `apps/arete/src/index.ts`, `web.ts`, `api/chat.ts`.
- Modify session schema and manager to persist the selected model.
- Create `apps/arete/web/src/features/models/api.ts`, `ModelsPage.tsx`, `ProviderCard.tsx`, `ProviderForm.tsx`, and `apps/arete/web/src/components/shell/ModelSelector.tsx`.

**Attachments and voice**

- Modify `packages/db/src/schema.ts`, `migrate.ts`.
- Create `apps/arete/src/attachments/store.ts`, `validation.ts`.
- Create `apps/arete/src/api/attachments.ts`, `transcription.ts`.
- Modify `packages/runtime/src/pipeline.ts`, `session.ts`.
- Create `apps/arete/web/src/features/chat/useAttachments.ts`, `AttachmentTray.tsx`, `useVoiceInput.ts`, `VoiceReview.tsx`.
- Modify `Composer.tsx`, `ChatPage.tsx`, `MessageList.tsx`.
- Modify `apps/arete/src/data-privacy.ts`.

---

### Task 1: Define Model Capabilities And Dispatch Through ProviderRegistry

**Files:**
- Modify: `packages/provider/src/types.ts`
- Modify: `packages/provider/src/registry.ts`
- Test: `packages/provider/tests/registry.test.ts`

- [ ] **Step 1: Write failing registry capability tests**

```ts
it("lists declared model capabilities and cost tier", () => {
  const reg = new ProviderRegistry()
  reg.register("mock", new MockProvider(), [{
    id: "vision-model",
    provider: "mock",
    capabilities: ["text", "vision", "streaming"],
    costTier: "low",
  }])
  expect(reg.listModels()).toEqual([expect.objectContaining({
    id: "vision-model",
    capabilities: ["text", "vision", "streaming"],
    costTier: "low",
  })])
})

it("dispatches chat by params.model", async () => {
  const reg = new ProviderRegistry()
  reg.register("mock", new MockProvider(), [{ id: "mock-model", provider: "mock", capabilities: ["text"] }])
  await expect(reg.chat({ model: "mock-model", messages: [{ role: "user", content: "hi" }] })).resolves.toMatchObject({ finishReason: "stop" })
})
```

- [ ] **Step 2: Run and confirm the old string-only registry fails**

```powershell
rtk pnpm --filter @viraha/provider exec vitest run tests/registry.test.ts
```

Expected: FAIL because `register` accepts strings and `ProviderRegistry` has no `chat` method.

- [ ] **Step 3: Replace provider types with explicit capabilities and content parts**

```ts
// packages/provider/src/types.ts
export type ModelCapability = "text" | "vision" | "tools" | "streaming" | "speech-to-text"
export type CostTier = "low" | "standard" | "high"

export interface ModelInfo {
  id: string
  provider: string
  capabilities: ModelCapability[]
  contextWindow?: number
  costTier?: CostTier
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string }

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string | ChatContentPart[]
}

export interface TranscriptionParams {
  model: string
  audio: Uint8Array
  mimeType: string
  fileName: string
}

export interface TranscriptionResult { text: string; model: string }

export interface LLMProvider {
  name: string
  chat(params: ChatParams): Promise<ChatResponse>
  chatStream(params: ChatParams): AsyncIterable<ChatChunk>
  listModels?(): Promise<ModelInfo[]>
  transcribe?(params: TranscriptionParams): Promise<TranscriptionResult>
  embed?(texts: string[]): Promise<EmbeddingResult[]>
}
```

Retain the existing `ChatParams`, `ChatChunk`, `ChatResponse`, tool, embedding, and config types below these declarations.

- [ ] **Step 4: Make ProviderRegistry implement LLMProvider**

Store full `ModelInfo` in each model entry. Accept `Array<string | ModelInfo>` for backward compatibility, normalize strings to `{ id, provider, capabilities: ["text"] }`, and add:

```ts
name = "registry"

async chat(params: ChatParams) {
  const provider = this.resolve(params.model)
  return provider.chat(params)
}

async *chatStream(params: ChatParams) {
  const provider = this.resolve(params.model)
  yield* provider.chatStream(params)
}

async transcribe(params: TranscriptionParams) {
  const provider = this.resolve(params.model)
  if (!provider.transcribe) throw new Error(`Model ${params.model} does not support speech-to-text`)
  return provider.transcribe(params)
}

getModel(model: string): ModelInfo | undefined {
  return this.models.find(entry => entry.model.id === model)?.model
}
```

Return the stored `ModelInfo` objects from `listModels()` instead of manufacturing `chat` capabilities.

- [ ] **Step 5: Run provider tests**

```powershell
rtk pnpm --filter @viraha/provider test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
rtk git add packages/provider/src/types.ts packages/provider/src/registry.ts packages/provider/tests/registry.test.ts
rtk git commit -m "feat(provider): add model capability contracts"
```

---

### Task 2: Implement OpenAI-Compatible Provider And Chinese Presets

**Files:**
- Create: `packages/provider/src/openai-compatible.ts`
- Create: `packages/provider/src/presets.ts`
- Modify: `packages/provider/src/deepseek.ts`
- Modify: `packages/provider/src/index.ts`
- Test: `packages/provider/tests/openai-compatible.test.ts`
- Test: `packages/provider/tests/presets.test.ts`

- [ ] **Step 1: Write request-contract tests**

```ts
// packages/provider/tests/openai-compatible.test.ts
import { describe, expect, it, vi } from "vitest"
import { OpenAICompatibleProvider } from "../src/openai-compatible.js"

describe("OpenAICompatibleProvider", () => {
  it("converts neutral images to image_url content", async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: "seen" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 2, completion_tokens: 1 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }))
    const provider = new OpenAICompatibleProvider({ name: "test", apiKey: "secret", baseUrl: "https://example.test/v1", fetchFn })
    await provider.chat({ model: "vision", messages: [{ role: "user", content: [
      { type: "text", text: "describe" },
      { type: "image", mediaType: "image/png", data: "AAAA" },
    ] }] })
    const body = JSON.parse(String(fetchFn.mock.calls[0][1]?.body))
    expect(body.messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } })
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```powershell
rtk pnpm --filter @viraha/provider exec vitest run tests/openai-compatible.test.ts tests/presets.test.ts
```

Expected: FAIL because adapter and presets do not exist.

- [ ] **Step 3: Implement the generic adapter**

`OpenAICompatibleProvider` must:

- POST `/chat/completions` for chat and streaming.
- GET `/models` when model discovery is enabled.
- POST multipart `/audio/transcriptions` when `transcriptionPath` is configured.
- Convert neutral image parts to OpenAI `image_url` content.
- Preserve function tool schemas and parse `tool_calls`.
- Accept an injected `fetchFn` for deterministic tests.
- Never include the API key in thrown errors.

Constructor:

```ts
interface OpenAICompatibleConfig extends ProviderConfig {
  name: string
  baseUrl: string
  modelsPath?: string
  transcriptionPath?: string
  fetchFn?: typeof fetch
}
```

Normalize trailing slashes once in the constructor. Build `Authorization: Bearer <key>` headers server-side.

- [ ] **Step 4: Add maintained presets**

```ts
// packages/provider/src/presets.ts
export interface ProviderPreset {
  id: string
  name: string
  baseUrl: string
  modelsPath?: string
  transcriptionPath?: string
  costHint: "low" | "standard"
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", modelsPath: "/models", costHint: "low" },
  { id: "siliconflow", name: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", modelsPath: "/models", transcriptionPath: "/audio/transcriptions", costHint: "low" },
  { id: "dashscope", name: "通义千问 / 百炼", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", modelsPath: "/models", costHint: "low" },
  { id: "zhipu", name: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", modelsPath: "/models", costHint: "low" },
  { id: "moonshot", name: "Kimi / Moonshot", baseUrl: "https://api.moonshot.cn/v1", modelsPath: "/models", costHint: "standard" },
  { id: "volcengine", name: "豆包 / 火山方舟", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", modelsPath: "/models", costHint: "low" },
  { id: "minimax", name: "MiniMax", baseUrl: "https://api.minimaxi.com/v1", modelsPath: "/models", costHint: "standard" },
]

export function getProviderPreset(id: string) {
  return PROVIDER_PRESETS.find(preset => preset.id === id)
}
```

Test that preset IDs are unique, Base URLs are HTTPS, and every preset has a name and cost hint.

- [ ] **Step 5: Reuse the adapter for DeepSeek and export new APIs**

Make `DeepSeekProvider` extend `OpenAICompatibleProvider` with name/base URL defaults so current imports remain valid. Export adapter and presets from `packages/provider/src/index.ts`.

- [ ] **Step 6: Run tests and commit**

```powershell
rtk pnpm --filter @viraha/provider test
rtk git add packages/provider/src packages/provider/tests
rtk git commit -m "feat(provider): add Chinese OpenAI-compatible presets"
```

---

### Task 3: Persist Provider Config And Expose Model APIs

**Files:**
- Create: `apps/arete/src/config/atomic-json-store.ts`
- Create: `apps/arete/src/config/provider-config.ts`
- Create: `apps/arete/src/services/provider-manager.ts`
- Create: `apps/arete/src/api/models.ts`
- Modify: `apps/arete/src/index.ts`
- Modify: `apps/arete/src/web.ts`
- Test: `apps/arete/tests/provider-config.test.ts`
- Test: `apps/arete/tests/models-api.test.ts`

- [ ] **Step 1: Write failing atomic-store and redaction tests**

```ts
it("writes provider config atomically and never returns the full key", async () => {
  const store = new ProviderConfigStore(tempPath)
  await store.save({ id: "main", presetId: "deepseek", apiKey: "sk-secret", defaultModel: "deepseek-chat" })
  expect(await store.listPublic()).toEqual([expect.objectContaining({ id: "main", hasApiKey: true, apiKeyHint: "sk-…cret" })])
  expect(JSON.stringify(await store.listPublic())).not.toContain("sk-secret")
})
```

- [ ] **Step 2: Implement atomic JSON persistence**

`AtomicJsonStore<T>` reads a default value on `ENOENT`, writes `${path}.tmp-${pid}`, uses mode `0o600`, then renames over the target. On rename failure it removes the temp file and preserves the old file.

Store shape:

```ts
export interface StoredProviderConfig {
  id: string
  presetId: string | "custom" | "anthropic"
  name: string
  apiKey: string
  baseUrl: string
  defaultModel?: string
  manualModels?: Array<{ id: string; capabilities: ModelCapability[]; costTier?: CostTier }>
}
```

Public output replaces `apiKey` with `hasApiKey` and `apiKeyHint`.

- [ ] **Step 3: Implement ProviderManager**

`ProviderManager` owns the stored configs and a live `ProviderRegistry`. It exposes:

```ts
reload(): Promise<void>
get registry(): ProviderRegistry
listPublic(): Promise<PublicProviderConfig[]>
listModels(): Promise<ModelInfo[]>
test(config: StoredProviderConfig): Promise<{ ok: boolean; models: ModelInfo[]; error?: string }>
save(config: StoredProviderConfig): Promise<void>
remove(id: string): Promise<void>
```

`test` constructs a temporary adapter and calls model discovery or a one-token chat against `defaultModel`. `save` validates before persisting. `reload` registers each configured provider and applies manual capability overrides; unknown discovered models default to `["text"]`.

- [ ] **Step 4: Add model routes**

```ts
// apps/arete/src/api/models.ts
const app = new Hono()
app.get("/providers", async c => c.json({ providers: await manager.listPublic() }))
app.get("/models", async c => c.json({ models: await manager.listModels() }))
app.post("/providers/test", async c => c.json(await manager.test(await c.req.json())))
app.put("/providers/:id", async c => { await manager.save({ ...(await c.req.json()), id: c.req.param("id") }); return c.json({ ok: true }) })
app.delete("/providers/:id", async c => { await manager.remove(c.req.param("id")); return c.body(null, 204) })
```

Mount under `/api/models`. Inject `manager.registry` into `AgentPipeline` as the LLM provider instead of resolving one fixed adapter at startup.

- [ ] **Step 5: Add per-input model selection**

Modify `AgentInput` with `model?: string`. In `process`, `processStream`, and reflection use:

```ts
const model = input.model ?? this.config.model
```

Pass `model` to every provider call. The chat API must reject unknown models with HTTP 400 before starting SSE.

- [ ] **Step 6: Run tests and commit**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/provider-config.test.ts tests/models-api.test.ts tests/chat-api.test.ts
rtk pnpm --filter @viraha/runtime test
rtk git add apps/arete/src/config apps/arete/src/services/provider-manager.ts apps/arete/src/api/models.ts apps/arete/src/index.ts apps/arete/src/web.ts apps/arete/tests packages/runtime/src/pipeline.ts
rtk git commit -m "feat(arete): manage model providers in Studio"
```

---

### Task 4: Build The Models Page And Session Model Selector

**Files:**
- Create: `apps/arete/web/src/features/models/api.ts`
- Create: `apps/arete/web/src/features/models/ModelsPage.tsx`
- Create: `apps/arete/web/src/features/models/ProviderCard.tsx`
- Create: `apps/arete/web/src/features/models/ProviderForm.tsx`
- Create: `apps/arete/web/src/components/shell/ModelSelector.tsx`
- Modify: `apps/arete/web/src/features/chat/ChatPage.tsx`
- Modify: `packages/db/src/schema.ts`, `migrate.ts`
- Modify: `packages/runtime/src/session.ts`
- Modify: `apps/arete/src/api/sessions.ts`
- Test: `apps/arete/web/src/features/models/ModelsPage.test.tsx`

- [ ] **Step 1: Add a failing models-page test**

Render `ModelsPage` with mocked fetch responses and assert it shows `DeepSeek`, `硅基流动`, a `低成本` tag, `图像` capability, and a disabled Save button until connection test succeeds.

- [ ] **Step 2: Add model persistence to sessions**

Add nullable `model` to the sessions schema and migration. Extend `createSession` with `model?: string`, return it from `listSessions`, and add `setSessionModel(sessionId, userId, model)` with an ownership-scoped update.

Add `PATCH /api/sessions/:id` accepting `{ model }`. Validate the model through `ProviderManager.registry.getModel(model)` before saving.

- [ ] **Step 3: Implement the models UI**

`ModelsPage` displays Provider cards with connection state, API key hint, Base URL, default model, last verification, and commands for Test/Save/Remove. `ProviderForm` starts from the presets returned by the server, allows a custom Base URL only for `custom`, and never renders a saved full key.

Capability tags use these labels:

```ts
const labels = { text: "文本", vision: "图像", tools: "工具", streaming: "流式", "speech-to-text": "语音转写" }
```

Cost tiers render `低成本`, `标准`, `高成本`; do not show hard-coded currency prices.

- [ ] **Step 4: Implement ModelSelector**

The header selector groups models by Provider, shows capability icons, and updates the selected session through `PATCH /api/sessions/:id`. If the session has no model, select the server default. Never switch models silently when an attachment is present.

- [ ] **Step 5: Run tests and commit**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run --config vitest.web.config.ts web/src/features/models/ModelsPage.test.tsx
rtk pnpm --filter @viraha/arete test
rtk git add apps/arete/web/src/features/models apps/arete/web/src/components/shell/ModelSelector.tsx apps/arete/web/src/features/chat/ChatPage.tsx packages/db packages/runtime/src/session.ts apps/arete/src/api/sessions.ts
rtk git commit -m "feat(arete): add model management UI"
```

---

### Task 5: Add User-Scoped Image Attachment Storage

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/migrate.ts`
- Create: `apps/arete/src/attachments/validation.ts`
- Create: `apps/arete/src/attachments/store.ts`
- Create: `apps/arete/src/api/attachments.ts`
- Modify: `apps/arete/src/web.ts`
- Test: `apps/arete/tests/attachments.test.ts`

- [ ] **Step 1: Write failing validation and ownership tests**

Test JPEG/PNG/WebP magic-byte acceptance, rejection of a `.png` file containing text, 10 MB size limit, user A unable to read user B attachment, and delete removing both DB row and file.

- [ ] **Step 2: Add attachment schema**

```ts
export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  messageId: text("message_id"),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  storagePath: text("storage_path").notNull(),
  status: text("status").notNull().$default(() => "temporary"),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
})
```

Add matching SQL and indexes on `(user_id, created_at)` and `message_id`.

- [ ] **Step 3: Implement validation and store**

`validateImage` accepts only JPEG `ff d8 ff`, PNG `89 50 4e 47 0d 0a 1a 0a`, and WebP `RIFF....WEBP`. `AttachmentStore.create` generates a UUID filename, writes under `<ARETE_HOME>/attachments/<userId>/`, computes SHA-256, and inserts the DB row. `read` and `delete` require both ID and user ID. `attachToMessage` changes status to `attached` and sets `messageId`.

- [ ] **Step 4: Add routes**

```text
POST   /api/attachments          multipart field `file`
GET    /api/attachments/:id      owner-scoped bytes
DELETE /api/attachments/:id      owner-scoped delete
```

Return only `{ id, name, mimeType, sizeBytes, status }`; never return `storagePath`.

- [ ] **Step 5: Run tests and commit**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/attachments.test.ts
rtk git add packages/db apps/arete/src/attachments apps/arete/src/api/attachments.ts apps/arete/src/web.ts apps/arete/tests/attachments.test.ts
rtk git commit -m "feat(arete): add private image attachments"
```

---

### Task 6: Send Images Through The Pipeline And Chat UI

**Files:**
- Modify: `packages/runtime/src/pipeline.ts`
- Modify: `packages/provider/src/anthropic.ts`
- Modify: `apps/arete/src/api/chat.ts`
- Modify: `packages/runtime/src/session.ts`
- Create: `apps/arete/web/src/features/chat/useAttachments.ts`
- Create: `apps/arete/web/src/features/chat/AttachmentTray.tsx`
- Modify: `apps/arete/web/src/features/chat/Composer.tsx`
- Modify: `apps/arete/web/src/features/chat/MessageList.tsx`
- Test: `packages/runtime/tests/pipeline-images.test.ts`
- Test: `apps/arete/web/src/features/chat/AttachmentTray.test.tsx`

- [ ] **Step 1: Write a failing pipeline image test**

Capture provider params and assert `AgentPipeline.process({ message: "describe", images: [{ mediaType: "image/png", data: "AAAA" }] })` produces a final user message with one text part and one neutral image part, while safety scanning and memory query receive only `"describe"`.

- [ ] **Step 2: Extend AgentInput without leaking image bytes into events**

```ts
export interface AgentImageInput {
  mediaType: "image/jpeg" | "image/png" | "image/webp"
  data: string
}

export interface AgentInput {
  message: string
  images?: AgentImageInput[]
  model?: string
  // existing fields unchanged
}
```

In `buildMessages`, create string content when there are no images and structured content otherwise. Emit only `{ attachmentCount, attachmentTypes }` in `UserMessageReceived`; never emit Base64.

- [ ] **Step 3: Add Anthropic image conversion**

Convert neutral image parts to:

```ts
{ type: "image", source: { type: "base64", media_type: part.mediaType, data: part.data } }
```

and text parts to Anthropic text blocks. Keep existing string behavior unchanged.

- [ ] **Step 4: Resolve attachments in chat route**

Accept `attachmentIds: string[]`. Before opening SSE:

1. Verify the selected model has `vision`.
2. Owner-scope every attachment read.
3. Convert bytes to Base64 for the current call.
4. Store the user message and attach rows to its message ID.
5. Pass `images` to the pipeline.

Return HTTP 409 `{ code: "MODEL_CAPABILITY_MISMATCH", required: "vision" }` before streaming when unsupported.

- [ ] **Step 5: Implement attachment UI**

`useAttachments` supports file input, drag/drop, and paste; uploads immediately and retains returned IDs. `AttachmentTray` renders fixed 64px thumbnails with Remove buttons and upload/error states. Composer accepts only JPEG/PNG/WebP and keeps text plus attachments after a capability mismatch.

- [ ] **Step 6: Run tests and commit**

```powershell
rtk pnpm --filter @viraha/runtime exec vitest run tests/pipeline-images.test.ts
rtk pnpm --filter @viraha/arete exec vitest run tests/chat-api.test.ts tests/attachments.test.ts
rtk pnpm --filter @viraha/arete exec vitest run --config vitest.web.config.ts web/src/features/chat/AttachmentTray.test.tsx
rtk git add packages/runtime packages/provider/src/anthropic.ts apps/arete/src/api/chat.ts apps/arete/web/src/features/chat
rtk git commit -m "feat(arete): support vision messages"
```

---

### Task 7: Add Record-Transcribe-Confirm Voice Input

**Files:**
- Create: `apps/arete/src/api/transcription.ts`
- Modify: `apps/arete/src/web.ts`
- Create: `apps/arete/web/src/features/chat/useVoiceInput.ts`
- Create: `apps/arete/web/src/features/chat/VoiceReview.tsx`
- Modify: `apps/arete/web/src/features/chat/Composer.tsx`
- Test: `apps/arete/tests/transcription.test.ts`
- Test: `apps/arete/web/src/features/chat/VoiceReview.test.tsx`

- [ ] **Step 1: Write failing transcription cleanup tests**

Test that the route rejects a model without `speech-to-text`, calls `registry.transcribe` for a compatible model, returns `{ text, model }`, and deletes the temporary audio file both on success and provider failure.

- [ ] **Step 2: Implement the transcription route**

```text
POST /api/audio/transcribe
multipart fields: file, model
```

Allow WebM, WAV, MP3, M4A up to 20 MB. Write to `<ARETE_HOME>/tmp/audio/<uuid>`, call `ProviderRegistry.transcribe`, and remove the file in `finally`. Return HTTP 409 for capability mismatch and HTTP 502 for provider failure; redact provider error bodies.

- [ ] **Step 3: Implement browser recording**

`useVoiceInput` owns states `idle | requesting | recording | transcribing | review | error`. It calls `navigator.mediaDevices.getUserMedia({ audio: true })`, uses `MediaRecorder`, stops tracks after recording, uploads the Blob, and never sends the transcript automatically.

```ts
interface VoiceReviewState { transcript: string; model: string }
```

`VoiceReview` displays an editable textarea and `Use transcript` / `Discard` commands. `Use transcript` inserts the text into the ordinary composer draft; the user still presses Send.

- [ ] **Step 4: Run tests and commit**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/transcription.test.ts
rtk pnpm --filter @viraha/arete exec vitest run --config vitest.web.config.ts web/src/features/chat/VoiceReview.test.tsx
rtk git add apps/arete/src/api/transcription.ts apps/arete/src/web.ts apps/arete/web/src/features/chat
rtk git commit -m "feat(arete): add confirmed voice transcription"
```

---

### Task 8: Extend Privacy, Export, And Multimodal Release Gates

**Files:**
- Modify: `apps/arete/src/data-privacy.ts`
- Modify: `apps/arete/tests/privacy.test.ts`
- Modify: `tests/e2e/arete-studio.spec.ts`
- Create: `apps/arete/scripts/provider-contract-smoke.ts`
- Modify: `apps/arete/package.json`
- Modify: `docs/release-checklist.md`

- [ ] **Step 1: Write failing privacy tests**

Add tests proving export contains an attachment manifest, delete removes attachment rows and files, deleting user A leaves user B attachments intact, event payloads never contain Base64, and temporary audio is absent after transcription.

- [ ] **Step 2: Upgrade export and delete**

Change `GET /api/data/export` to return a ZIP attachment containing `data.json` plus `attachments/<id>.<ext>`. Keep a JSON-only helper for tests. `deleteUserData` must delete attachment files before rows and report partial filesystem failures as high-priority events without deleting another user.

- [ ] **Step 3: Add E2E multimodal flows**

Playwright must cover:

- Upload image, preview, send through mock vision model, reload session, image remains.
- Select text-only model, send blocked, draft and image remain.
- Mock microphone recording/transcription, edit transcript, press Send, transcript appears as user message.
- Mobile viewport attachment tray and voice review do not overlap the composer.

- [ ] **Step 4: Add provider contract smoke**

`provider-contract-smoke.ts` reads explicitly supplied test keys from environment and tests configured presets without logging secrets. Required release environment variables document four providers, including one vision and one STT model. Missing variables skip local development but fail when `PROVIDER_RELEASE_GATE=1`.

- [ ] **Step 5: Run full verification**

```powershell
rtk pnpm --filter @viraha/provider test
rtk pnpm --filter @viraha/runtime test
rtk pnpm --filter @viraha/arete test
rtk pnpm --filter @viraha/arete test:e2e
rtk pnpm --filter @viraha/arete eval:smoke
rtk pnpm --filter @viraha/arete eval:crisis
rtk pnpm build
rtk pnpm lint
```

Expected: PASS. Real-provider gate is recorded separately with provider name, model, capability, date, and redacted result.

- [ ] **Step 6: Commit**

```powershell
rtk git add apps/arete/src/data-privacy.ts apps/arete/tests tests/e2e apps/arete/scripts/provider-contract-smoke.ts apps/arete/package.json docs/release-checklist.md
rtk git commit -m "test(arete): gate multimodal provider release"
```

---

## Plan 2 Completion Gate

Plan 2 is complete only when:

- At least four domestic Provider presets have real connection records.
- Models are filterable by text, vision, tools, streaming, STT, and cost tier.
- The selected model persists per session.
- Images remain user-scoped, reload correctly, export, and delete correctly.
- Text-only models cannot receive image bytes.
- Voice recording always requires transcript confirmation before chat send.
- No log, Trace, API response, or export metadata leaks API keys or unintended raw audio.
