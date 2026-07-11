# Viraha Mobile Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an installable Android-first Viraha Mobile foundation that creates a Companion, stores it locally, connects to a user-owned OpenAI-compatible API, and completes a persistent text chat loop without depending on Viraha Cloud.

**Architecture:** Extract a platform-neutral `@viraha/companion-core` package and add an Expo 57 React Native application under `apps/mobile`. Mobile-specific storage, secrets, networking and UI live behind explicit adapters so the existing Node runtime and future iOS client can share the same Companion contracts.

**Tech Stack:** Node.js 22, pnpm 11.7.0, TypeScript, Expo 57, React Native 0.86, React 19, Hermes, Expo SQLite, Expo Secure Store, Vitest, Jest Expo, React Native Testing Library, EAS Build.

---

## Scope And Follow-On Plans

This plan is the first independently testable slice of the approved platform design. It intentionally stops at a BYOK text-chat Android foundation.

Follow-on plans will cover:

1. Anonymous Viraha Cloud quota, official model gateway and official Companion catalog.
2. Long-term memory, Relationship Timeline, Growth Events, export/delete and encrypted sync.
3. Image input, record-transcribe-confirm voice, notifications and proactive care.
4. Telegram, Companion Store, iOS release and Viraha Bridge.

Do not add Cloud accounts, anonymous quota, music control, WeChat/QQ automation, Health Connect or a full Store in this plan.

This foundation is for development and internal device testing, not a public youth release. It blocks independent onboarding under 14 and filters adult Packs for teens. A later safety plan must add guardian consent, runtime content boundaries, crisis handling and policy audit before any public distribution.

## Execution Prerequisites

- Work in the existing isolated worktree at `D:\viraha\.worktrees\arete-studio`.
- Every terminal command must use `D:\tools\rtk\rtk.exe`.
- Force Node 22 for all pnpm/Expo commands:

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm <args>"
```

- No Android device is required until Task 9. `expo export` and unit tests are the local gates.
- Preserve the completed Node CLI and Studio foundation commits. Do not resume the paused React Web tasks.

## File Map

**Portable domain**

- Create `packages/companion-core/package.json`
- Create `packages/companion-core/tsconfig.json`
- Create `packages/companion-core/src/index.ts`
- Create `packages/companion-core/src/companion.ts`
- Create `packages/companion-core/src/templates.ts`
- Create `packages/companion-core/src/packs.ts`
- Create `packages/companion-core/src/model.ts`
- Create tests under `packages/companion-core/tests/`

**Mobile application**

- Create `apps/mobile/package.json`
- Create `apps/mobile/app.json`
- Create `apps/mobile/eas.json`
- Create `apps/mobile/tsconfig.json`
- Create `apps/mobile/index.ts`
- Create `apps/mobile/App.tsx`
- Create `apps/mobile/src/` modules for onboarding, model setup, storage and chat
- Create Jest tests under `apps/mobile/tests/`

**Verification**

- Modify root `package.json`
- Modify `.github/workflows/ci.yml`
- Create `.github/workflows/mobile-preview.yml`
- Create `docs/mobile-test-matrix.md`

---

### Task 1: Scaffold The Expo Mobile Workspace

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/index.ts`
- Create: `apps/mobile/App.tsx`
- Create: `apps/mobile/tests/app.test.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Create the failing mobile smoke test**

```tsx
// apps/mobile/tests/app.test.tsx
import { render } from "@testing-library/react-native"
import { App } from "../App"

describe("Viraha Mobile", () => {
  it("renders the mobile product identity", () => {
    const screen = render(<App />)
    expect(screen.getByText("Viraha")).toBeTruthy()
    expect(screen.getByText("你的 Companion，从这里开始。")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Add the mobile package manifest and run the test red**

```json
{
  "name": "@viraha/mobile",
  "version": "0.1.0",
  "private": true,
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "test": "jest --runInBand",
    "typecheck": "tsc --noEmit",
    "export:android": "expo export --platform android --output-dir dist/android"
  },
  "dependencies": {
    "expo": "~57.0.4",
    "expo-build-properties": "~57.0.3",
    "expo-status-bar": "~57.0.0",
    "react": "19.2.3",
    "react-native": "0.86.0"
  },
  "devDependencies": {
    "@testing-library/react-native": "14.0.1",
    "@types/jest": "30.0.0",
    "@types/react": "~19.2.2",
    "jest": "30.4.2",
    "jest-expo": "57.0.1",
    "react-test-renderer": "19.2.3",
    "typescript": "~6.0.3"
  },
  "jest": {
    "preset": "jest-expo",
    "testMatch": ["<rootDir>/tests/**/*.test.ts", "<rootDir>/tests/**/*.test.tsx"]
  }
}
```

Run:

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm install --store-dir 'D:\viraha\.pnpm-store'"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile test"
```

Expected: FAIL because `apps/mobile/App.tsx` does not exist.

- [ ] **Step 3: Add the Expo configuration**

```json
{
  "expo": {
    "name": "Viraha",
    "slug": "viraha",
    "scheme": "viraha",
    "version": "0.1.0",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "plugins": [
      ["expo-build-properties", { "android": { "minSdkVersion": 28 } }]
    ],
    "android": {
      "package": "com.viraha.mobile"
    },
    "ios": {
      "bundleIdentifier": "com.viraha.mobile",
      "supportsTablet": true
    }
  }
}
```

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

- [ ] **Step 4: Add the minimal application**

```ts
// apps/mobile/index.ts
import { registerRootComponent } from "expo"
import { App } from "./App"

registerRootComponent(App)
```

```tsx
// apps/mobile/App.tsx
import { StatusBar } from "expo-status-bar"
import { SafeAreaView, StyleSheet, Text, View } from "react-native"

export function App() {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View>
        <Text style={styles.brand}>Viraha</Text>
        <Text style={styles.copy}>你的 Companion，从这里开始。</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#F7F8F7" },
  brand: { color: "#171A1F", fontSize: 32, fontWeight: "700" },
  copy: { marginTop: 8, color: "#60666F", fontSize: 16 },
})
```

- [ ] **Step 5: Add root scripts and verify green**

Add to root `package.json` scripts:

```json
"mobile": "pnpm --filter @viraha/mobile start",
"mobile:test": "pnpm --filter @viraha/mobile test",
"mobile:check": "pnpm --filter @viraha/mobile typecheck && pnpm --filter @viraha/mobile test",
"mobile:export": "pnpm --filter @viraha/mobile export:android"
```

Run:

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm mobile:check"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm mobile:export"
```

Expected: test PASS, typecheck PASS, Android export completes.

- [ ] **Step 6: Commit**

```powershell
D:\tools\rtk\rtk.exe git add apps/mobile package.json pnpm-lock.yaml
D:\tools\rtk\rtk.exe git commit -m "feat(mobile): scaffold Viraha application"
```

---

### Task 2: Add Portable Companion Creation And Arete Template

**Files:**
- Create: `packages/companion-core/package.json`
- Create: `packages/companion-core/tsconfig.json`
- Create: `packages/companion-core/src/companion.ts`
- Create: `packages/companion-core/src/templates.ts`
- Create: `packages/companion-core/src/index.ts`
- Create: `packages/companion-core/tests/companion.test.ts`
- Modify: `apps/mobile/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write failing Companion creation tests**

```ts
// packages/companion-core/tests/companion.test.ts
import { describe, expect, it } from "vitest"
import { ARETE_TEMPLATE, createCompanion } from "../src/index.js"

describe("createCompanion", () => {
  it("creates a portable companion from a template", () => {
    const companion = createCompanion({
      template: ARETE_TEMPLATE,
      companionName: "Arete",
      userDisplayName: "神龙",
      userAgeBand: "adult",
      id: "companion-1",
      now: "2026-07-11T00:00:00.000Z",
    })
    expect(companion).toEqual({
      id: "companion-1",
      templateId: "official.arete",
      category: "fitness",
      name: "Arete",
      userDisplayName: "神龙",
      userAgeBand: "adult",
      description: "陪伴你训练、恢复并长期成长的健身伙伴。",
      createdAt: "2026-07-11T00:00:00.000Z",
    })
  })

  it("rejects blank names", () => {
    expect(() => createCompanion({
      template: ARETE_TEMPLATE,
      companionName: " ",
      userDisplayName: "神龙",
      userAgeBand: "adult",
      id: "companion-1",
      now: "2026-07-11T00:00:00.000Z",
    })).toThrow("Companion name is required")
  })
})
```

- [ ] **Step 2: Add the package skeleton and verify red**

```json
{
  "name": "@viraha/companion-core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "react-native": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

Run:

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/companion-core test"
```

Expected: FAIL because the domain modules do not exist.

- [ ] **Step 3: Implement the portable types and factory**

```ts
// packages/companion-core/src/companion.ts
export type CompanionCategory =
  | "gentle"
  | "fitness"
  | "study"
  | "romance"
  | "mental_support"
  | "fiction"
  | "custom"

export type UserAgeBand = "under14" | "teen" | "adult"

export interface CompanionTemplate {
  id: string
  category: CompanionCategory
  defaultName: string
  description: string
}

export interface CompanionProfile {
  id: string
  templateId: string
  category: CompanionCategory
  name: string
  userDisplayName: string
  userAgeBand: UserAgeBand
  description: string
  createdAt: string
}

interface CreateCompanionInput {
  template: CompanionTemplate
  companionName: string
  userDisplayName: string
  userAgeBand: UserAgeBand
  id: string
  now: string
}

export function createCompanion(input: CreateCompanionInput): CompanionProfile {
  const name = input.companionName.trim()
  const userDisplayName = input.userDisplayName.trim()
  if (!name) throw new Error("Companion name is required")
  if (!userDisplayName) throw new Error("User display name is required")
  return {
    id: input.id,
    templateId: input.template.id,
    category: input.template.category,
    name,
    userDisplayName,
    userAgeBand: input.userAgeBand,
    description: input.template.description,
    createdAt: input.now,
  }
}
```

```ts
// packages/companion-core/src/templates.ts
import type { CompanionTemplate } from "./companion.js"

export const ARETE_TEMPLATE: CompanionTemplate = {
  id: "official.arete",
  category: "fitness",
  defaultName: "Arete",
  description: "陪伴你训练、恢复并长期成长的健身伙伴。",
}

export const BUILTIN_TEMPLATES: CompanionTemplate[] = [
  { id: "official.gentle", category: "gentle", defaultName: "Luna", description: "温柔倾听、尊重边界的日常陪伴伙伴。" },
  ARETE_TEMPLATE,
  { id: "official.study", category: "study", defaultName: "Study", description: "帮助规划学习、复习和保持好奇心的学习伙伴。" },
  { id: "official.romance", category: "romance", defaultName: "Lumi", description: "仅面向成年人的尊重边界型恋爱陪伴伙伴。" },
  { id: "official.mental-support", category: "mental_support", defaultName: "Mori", description: "提供一般情绪支持但不替代专业治疗的伙伴。" },
  { id: "official.fiction", category: "fiction", defaultName: "Story", description: "共同讨论角色、世界和故事的小说伙伴。" },
  { id: "official.custom", category: "custom", defaultName: "Companion", description: "由用户定义称呼与方向的自定义伙伴。" },
]
```

```ts
// packages/companion-core/src/index.ts
export * from "./companion.js"
export * from "./templates.js"
```

- [ ] **Step 4: Link Mobile and verify**

Add to `apps/mobile/package.json` dependencies:

```json
"@viraha/companion-core": "workspace:*"
```

Run:

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm install --store-dir 'D:\viraha\.pnpm-store'"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/companion-core test"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/companion-core build"
```

Expected: tests PASS and package builds without Node APIs.

- [ ] **Step 5: Commit**

```powershell
D:\tools\rtk\rtk.exe git add packages/companion-core apps/mobile/package.json pnpm-lock.yaml
D:\tools\rtk\rtk.exe git commit -m "feat(core): add portable companion creation"
```

---

### Task 3: Enforce Pack Permissions And Youth Access

**Files:**
- Create: `packages/companion-core/src/packs.ts`
- Create: `packages/companion-core/tests/packs.test.ts`
- Modify: `packages/companion-core/src/templates.ts`
- Modify: `packages/companion-core/src/index.ts`

- [ ] **Step 1: Write failing access-policy tests**

```ts
// packages/companion-core/tests/packs.test.ts
import { describe, expect, it } from "vitest"
import { ARETE_PACK, evaluatePackAccess } from "../src/index.js"

describe("evaluatePackAccess", () => {
  it("allows an official fitness pack for a teen", () => {
    expect(evaluatePackAccess(ARETE_PACK, { age: 15, guardianApproved: false })).toEqual({ allowed: true })
  })

  it("requires guardian approval under 14", () => {
    expect(evaluatePackAccess(ARETE_PACK, { age: 13, guardianApproved: false })).toEqual({
      allowed: false,
      reason: "Guardian approval is required for users under 14.",
    })
  })

  it("blocks romance packs for minors", () => {
    expect(evaluatePackAccess({ ...ARETE_PACK, category: "romance", minimumAge: 18 }, {
      age: 17,
      guardianApproved: true,
    })).toEqual({ allowed: false, reason: "This Companion is restricted to adults." })
  })
})
```

- [ ] **Step 2: Run red**

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/companion-core test"
```

Expected: FAIL because Pack policy does not exist.

- [ ] **Step 3: Implement Pack manifests and access checks**

```ts
// packages/companion-core/src/packs.ts
import type { CompanionCategory, CompanionTemplate } from "./companion.js"

export type CompanionPermission =
  | "network.model"
  | "microphone"
  | "camera"
  | "notifications"
  | "health.read"
  | "channel.send"

export interface CompanionPackManifest extends CompanionTemplate {
  version: string
  author: string
  minimumAge: number
  permissions: CompanionPermission[]
  category: CompanionCategory
}

export type PackAccessResult = { allowed: true } | { allowed: false; reason: string }

export function evaluatePackAccess(
  pack: CompanionPackManifest,
  user: { age: number; guardianApproved: boolean },
): PackAccessResult {
  if (user.age < 14 && !user.guardianApproved) {
    return { allowed: false, reason: "Guardian approval is required for users under 14." }
  }
  if (user.age < 18 && (pack.minimumAge >= 18 || pack.category === "romance")) {
    return { allowed: false, reason: "This Companion is restricted to adults." }
  }
  return { allowed: true }
}
```

Replace the template export with:

```ts
// packages/companion-core/src/templates.ts
import type { CompanionPackManifest } from "./packs.js"

export const ARETE_PACK: CompanionPackManifest = {
  id: "official.arete",
  version: "1.0.0",
  author: "Viraha",
  category: "fitness",
  defaultName: "Arete",
  description: "陪伴你训练、恢复并长期成长的健身伙伴。",
  minimumAge: 0,
  permissions: ["network.model", "notifications"],
}

export const ARETE_TEMPLATE = ARETE_PACK

export const BUILTIN_TEMPLATES: CompanionPackManifest[] = [
  { id: "official.gentle", version: "1.0.0", author: "Viraha", category: "gentle", defaultName: "Luna", description: "温柔倾听、尊重边界的日常陪伴伙伴。", minimumAge: 0, permissions: ["network.model"] },
  ARETE_PACK,
  { id: "official.study", version: "1.0.0", author: "Viraha", category: "study", defaultName: "Study", description: "帮助规划学习、复习和保持好奇心的学习伙伴。", minimumAge: 0, permissions: ["network.model"] },
  { id: "official.romance", version: "1.0.0", author: "Viraha", category: "romance", defaultName: "Lumi", description: "仅面向成年人的尊重边界型恋爱陪伴伙伴。", minimumAge: 18, permissions: ["network.model"] },
  { id: "official.mental-support", version: "1.0.0", author: "Viraha", category: "mental_support", defaultName: "Mori", description: "提供一般情绪支持但不替代专业治疗的伙伴。", minimumAge: 14, permissions: ["network.model"] },
  { id: "official.fiction", version: "1.0.0", author: "Viraha", category: "fiction", defaultName: "Story", description: "共同讨论角色、世界和故事的小说伙伴。", minimumAge: 0, permissions: ["network.model"] },
  { id: "official.custom", version: "1.0.0", author: "Viraha", category: "custom", defaultName: "Companion", description: "由用户定义称呼与方向的自定义伙伴。", minimumAge: 14, permissions: ["network.model"] },
]
```

Replace `packages/companion-core/src/index.ts` with:

```ts
export * from "./companion.js"
export * from "./packs.js"
export * from "./templates.js"
```

- [ ] **Step 4: Verify and commit**

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/companion-core test"
D:\tools\rtk\rtk.exe git add packages/companion-core
D:\tools\rtk\rtk.exe git commit -m "feat(core): add companion pack policy"
```

---

### Task 4: Add BYOK Model Contracts And Secure Credentials

**Files:**
- Create: `packages/companion-core/src/model.ts`
- Create: `packages/companion-core/tests/model.test.ts`
- Create: `apps/mobile/src/model/credential-store.ts`
- Create: `apps/mobile/src/model/openai-compatible.ts`
- Create: `apps/mobile/tests/model.test.ts`
- Modify: `packages/companion-core/src/index.ts`
- Modify: `apps/mobile/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write failing model contract tests**

```ts
// packages/companion-core/tests/model.test.ts
import { describe, expect, it } from "vitest"
import { normalizeModelConnection } from "../src/index.js"

describe("normalizeModelConnection", () => {
  it("normalizes an OpenAI-compatible BYOK connection", () => {
    expect(normalizeModelConnection({
      kind: "byok",
      baseUrl: "https://api.deepseek.com/ ",
      model: " deepseek-chat ",
      credentialId: "deepseek-primary",
    })).toEqual({
      kind: "byok",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      credentialId: "deepseek-primary",
    })
  })
})
```

```ts
// apps/mobile/tests/model.test.ts
import { OpenAICompatibleGateway } from "../src/model/openai-compatible"
import { ProviderCredentialStore } from "../src/model/credential-store"

describe("mobile model adapters", () => {
  it("stores API keys without exposing them in the connection object", async () => {
    const values = new Map<string, string>()
    const store = new ProviderCredentialStore({
      getItemAsync: async key => values.get(key) ?? null,
      setItemAsync: async (key, value) => { values.set(key, value) },
      deleteItemAsync: async key => { values.delete(key) },
    })
    await store.save("deepseek-primary", "secret")
    expect(await store.read("deepseek-primary")).toBe("secret")
  })

  it("sends a BYOK chat request directly to the configured endpoint", async () => {
    const fetcher = jest.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "你好，神龙。" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }))
    const gateway = new OpenAICompatibleGateway(fetcher)
    const reply = await gateway.complete({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      apiKey: "secret",
      messages: [{ role: "user", content: "你好" }],
    })
    expect(reply).toBe("你好，神龙。")
    expect(fetcher).toHaveBeenCalledWith("https://api.deepseek.com/chat/completions", expect.objectContaining({
      method: "POST",
    }))
  })
})
```

- [ ] **Step 2: Run red**

Run:

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/companion-core exec vitest run tests/model.test.ts"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile exec jest tests/model.test.ts --runInBand"
```

Expected: FAIL because the model modules do not exist.

- [ ] **Step 3: Implement portable model contracts**

```ts
// packages/companion-core/src/model.ts
export type ChatRole = "system" | "user" | "assistant"
export interface ChatMessage { role: ChatRole; content: string }

export interface ByokModelConnection {
  kind: "byok"
  baseUrl: string
  model: string
  credentialId: string
}

export type ModelConnection = ByokModelConnection

export function normalizeModelConnection(input: ByokModelConnection): ByokModelConnection {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "")
  const model = input.model.trim()
  if (!/^https:\/\//.test(baseUrl)) throw new Error("Model endpoint must use HTTPS")
  if (!model) throw new Error("Model name is required")
  if (!input.credentialId.trim()) throw new Error("Credential id is required")
  return { kind: "byok", baseUrl, model, credentialId: input.credentialId.trim() }
}
```

- [ ] **Step 4: Implement secure credential and fetch adapters**

Add this mobile dependency:

```json
"expo-secure-store": "~57.0.0"
```

```ts
// apps/mobile/src/model/credential-store.ts
import * as SecureStore from "expo-secure-store"

export interface SecretStorage {
  getItemAsync(key: string): Promise<string | null>
  setItemAsync(key: string, value: string): Promise<void>
  deleteItemAsync(key: string): Promise<void>
}

export class ProviderCredentialStore {
  constructor(private readonly storage: SecretStorage = SecureStore) {}
  save(id: string, apiKey: string) { return this.storage.setItemAsync(`provider:${id}`, apiKey) }
  read(id: string) { return this.storage.getItemAsync(`provider:${id}`) }
  remove(id: string) { return this.storage.deleteItemAsync(`provider:${id}`) }
}
```

```ts
// apps/mobile/src/model/openai-compatible.ts
import type { ChatMessage } from "@viraha/companion-core"

type Fetcher = typeof fetch

export class OpenAICompatibleGateway {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async complete(input: {
    baseUrl: string
    model: string
    apiKey: string
    messages: ChatMessage[]
  }): Promise<string> {
    const response = await this.fetcher(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify({ model: input.model, messages: input.messages, stream: false }),
    })
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
    if (!response.ok) throw new Error(payload.error?.message || `Model request failed (${response.status})`)
    const content = payload.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error("Model returned an empty response")
    return content
  }
}
```

Replace `packages/companion-core/src/index.ts` with:

```ts
export * from "./companion.js"
export * from "./model.js"
export * from "./packs.js"
export * from "./templates.js"
```

Then run:

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm install --store-dir 'D:\viraha\.pnpm-store'"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/companion-core test"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile exec jest tests/model.test.ts --runInBand"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile typecheck"
```

- [ ] **Step 5: Commit**

```powershell
D:\tools\rtk\rtk.exe git add packages/companion-core apps/mobile pnpm-lock.yaml
D:\tools\rtk\rtk.exe git commit -m "feat(mobile): add secure BYOK model adapter"
```

---

### Task 5: Add SQLite Persistence For Companion And Chat

**Files:**
- Create: `apps/mobile/src/storage/database.ts`
- Create: `apps/mobile/src/storage/schema.ts`
- Create: `apps/mobile/src/storage/repository.ts`
- Create: `apps/mobile/tests/storage.test.ts`
- Modify: `apps/mobile/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write failing storage tests**

```ts
// apps/mobile/tests/storage.test.ts
import { createMobileSchema } from "../src/storage/schema"
import { MobileRepository } from "../src/storage/repository"

describe("mobile storage", () => {
  it("creates companion, connection, session and message tables", async () => {
    const execAsync = jest.fn(async () => undefined)
    await createMobileSchema({ execAsync })
    const sql = execAsync.mock.calls[0]?.[0] as string
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS companions")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS model_connections")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS sessions")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS messages")
  })

  it("lists messages in chronological order", async () => {
    const db = {
      execAsync: jest.fn(),
      runAsync: jest.fn(),
      getFirstAsync: jest.fn(),
      getAllAsync: jest.fn(async () => [
        { id: "m1", session_id: "s1", role: "user", content: "hi", created_at: "1" },
        { id: "m2", session_id: "s1", role: "assistant", content: "hello", created_at: "2" },
      ]),
    }
    const repository = new MobileRepository(db)
    expect(await repository.listMessages("s1")).toEqual([
      { id: "m1", sessionId: "s1", role: "user", content: "hi", createdAt: "1" },
      { id: "m2", sessionId: "s1", role: "assistant", content: "hello", createdAt: "2" },
    ])
  })
})
```

- [ ] **Step 2: Add Expo SQLite and run red**

Add `expo-sqlite` `~57.0.0` to mobile dependencies, then run:

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm install --store-dir 'D:\viraha\.pnpm-store'"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile exec jest tests/storage.test.ts --runInBand"
```

Expected: FAIL because storage modules do not exist.

- [ ] **Step 3: Implement the database port and adapter**

```ts
// apps/mobile/src/storage/database.ts
import * as SQLite from "expo-sqlite"

export interface SqlDatabase {
  execAsync(source: string): Promise<unknown>
  runAsync(source: string, ...params: unknown[]): Promise<unknown>
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>
}

export async function openMobileDatabase(): Promise<SqlDatabase> {
  return SQLite.openDatabaseAsync("viraha.db")
}
```

```ts
// apps/mobile/src/storage/schema.ts
export async function createMobileSchema(db: Pick<import("./database").SqlDatabase, "execAsync">) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS companions (
      id TEXT PRIMARY KEY, template_id TEXT NOT NULL, category TEXT NOT NULL,
      name TEXT NOT NULL, user_display_name TEXT NOT NULL, user_age_band TEXT NOT NULL,
      description TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS model_connections (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, base_url TEXT NOT NULL, model TEXT NOT NULL, credential_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, companion_id TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_session_created ON messages(session_id, created_at);
  `)
}
```

- [ ] **Step 4: Implement repository operations**

```ts
// apps/mobile/src/storage/repository.ts
import type { CompanionProfile, ModelConnection } from "@viraha/companion-core"
import type { SqlDatabase } from "./database"

export interface StoredMessage {
  id: string
  sessionId: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}

interface CompanionRow {
  id: string; template_id: string; category: CompanionProfile["category"]
  name: string; user_display_name: string; user_age_band: CompanionProfile["userAgeBand"]
  description: string; created_at: string
}
interface ConnectionRow { kind: "byok"; base_url: string; model: string; credential_id: string }
interface MessageRow {
  id: string; session_id: string; role: StoredMessage["role"]; content: string; created_at: string
}

export class MobileRepository {
  constructor(private readonly db: SqlDatabase) {}

  async saveCompanion(value: CompanionProfile) {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO companions VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      value.id, value.templateId, value.category, value.name, value.userDisplayName,
      value.userAgeBand, value.description, value.createdAt,
    )
  }

  async getCompanion(): Promise<CompanionProfile | null> {
    const row = await this.db.getFirstAsync<CompanionRow>(`SELECT * FROM companions ORDER BY created_at LIMIT 1`)
    return row ? {
      id: row.id, templateId: row.template_id, category: row.category, name: row.name,
      userDisplayName: row.user_display_name, userAgeBand: row.user_age_band,
      description: row.description, createdAt: row.created_at,
    } : null
  }

  async saveConnection(id: string, value: ModelConnection) {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO model_connections VALUES (?, ?, ?, ?, ?)`,
      id, value.kind, value.baseUrl, value.model, value.credentialId,
    )
  }

  async getConnection(id = "primary"): Promise<ModelConnection | null> {
    const row = await this.db.getFirstAsync<ConnectionRow>(`SELECT * FROM model_connections WHERE id = ?`, id)
    return row ? { kind: "byok", baseUrl: row.base_url, model: row.model, credentialId: row.credential_id } : null
  }

  async createSession(id: string, companionId: string, createdAt: string) {
    await this.db.runAsync(`INSERT INTO sessions VALUES (?, ?, ?)`, id, companionId, createdAt)
  }

  async addMessage(message: StoredMessage) {
    await this.db.runAsync(
      `INSERT INTO messages VALUES (?, ?, ?, ?, ?)`,
      message.id, message.sessionId, message.role, message.content, message.createdAt,
    )
  }

  async listMessages(sessionId: string): Promise<StoredMessage[]> {
    const rows = await this.db.getAllAsync<MessageRow>(
      `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`, sessionId,
    )
    return rows.map(row => ({
      id: row.id, sessionId: row.session_id, role: row.role,
      content: row.content, createdAt: row.created_at,
    }))
  }
}
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile exec jest tests/storage.test.ts --runInBand"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile typecheck"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile export:android"
```

Commit:

```powershell
D:\tools\rtk\rtk.exe git add apps/mobile pnpm-lock.yaml
D:\tools\rtk\rtk.exe git commit -m "feat(mobile): persist companion chat locally"
```

---

### Task 6: Build The One-Minute Companion Onboarding

**Files:**
- Create: `apps/mobile/src/onboarding/OnboardingFlow.tsx`
- Create: `apps/mobile/tests/onboarding.test.tsx`
- Modify: `apps/mobile/App.tsx`

- [ ] **Step 1: Write the failing onboarding flow test**

```tsx
// apps/mobile/tests/onboarding.test.tsx
import { fireEvent, render } from "@testing-library/react-native"
import { OnboardingFlow } from "../src/onboarding/OnboardingFlow"

describe("OnboardingFlow", () => {
  it("creates Arete after an adult age gate", () => {
    const onComplete = jest.fn()
    const screen = render(<OnboardingFlow onComplete={onComplete} />)
    fireEvent.press(screen.getByText("18 岁及以上"))
    fireEvent.press(screen.getByText("健身伙伴"))
    fireEvent.changeText(screen.getByPlaceholderText("例如：神龙"), "神龙")
    fireEvent.press(screen.getByText("继续"))
    fireEvent.changeText(screen.getByPlaceholderText("例如：Arete"), "Arete")
    fireEvent.press(screen.getByText("开始聊天"))
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      category: "fitness", name: "Arete", userDisplayName: "神龙", userAgeBand: "adult",
    }))
  })

  it("hides adult Companions from teens", () => {
    const screen = render(<OnboardingFlow onComplete={jest.fn()} />)
    fireEvent.press(screen.getByText("14–17 岁"))
    expect(screen.queryByText("恋爱陪伴")).toBeNull()
    expect(screen.getByText("健身伙伴")).toBeTruthy()
  })

  it("does not independently onboard children under 14", () => {
    const screen = render(<OnboardingFlow onComplete={jest.fn()} />)
    fireEvent.press(screen.getByText("未满 14 岁"))
    expect(screen.getByText("请由监护人完成设置")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run red**

Expected: FAIL because `OnboardingFlow` does not exist.

- [ ] **Step 3: Implement the flow**

```tsx
// apps/mobile/src/onboarding/OnboardingFlow.tsx
import { useState } from "react"
import { Button, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import {
  BUILTIN_TEMPLATES,
  createCompanion,
  evaluatePackAccess,
  type CompanionPackManifest,
  type CompanionProfile,
  type UserAgeBand,
} from "@viraha/companion-core"

const labels: Record<CompanionPackManifest["category"], string> = {
  gentle: "温柔陪伴", fitness: "健身伙伴", study: "学习伙伴", romance: "恋爱陪伴",
  mental_support: "心理支持", fiction: "小说角色", custom: "自定义",
}

export function OnboardingFlow({ onComplete }: { onComplete: (value: CompanionProfile) => void }) {
  const [step, setStep] = useState<"age" | "child" | "category" | "user" | "name">("age")
  const [ageBand, setAgeBand] = useState<UserAgeBand>("adult")
  const [template, setTemplate] = useState(BUILTIN_TEMPLATES[0]!)
  const [userDisplayName, setUserDisplayName] = useState("")
  const [name, setName] = useState(BUILTIN_TEMPLATES[0]!.defaultName)

  if (step === "age") return (
    <View style={styles.screen}>
      <Text style={styles.title}>请选择年龄范围</Text>
      <Pressable accessibilityRole="button" style={styles.choice} onPress={() => setStep("child")}><Text>未满 14 岁</Text></Pressable>
      <Pressable accessibilityRole="button" style={styles.choice} onPress={() => { setAgeBand("teen"); setStep("category") }}><Text>14–17 岁</Text></Pressable>
      <Pressable accessibilityRole="button" style={styles.choice} onPress={() => { setAgeBand("adult"); setStep("category") }}><Text>18 岁及以上</Text></Pressable>
    </View>
  )

  if (step === "child") return (
    <View style={styles.screen}>
      <Text style={styles.title}>请由监护人完成设置</Text>
      <Text>未满 14 岁的用户需要经过验证的监护人同意。该流程将在青少年保护阶段启用。</Text>
      <Button title="返回" onPress={() => setStep("age")} />
    </View>
  )

  if (step === "category") return (
    <View style={styles.screen}>
      <Text style={styles.title}>你希望 TA 是谁？</Text>
      {BUILTIN_TEMPLATES.filter(item => evaluatePackAccess(item, {
        age: ageBand === "adult" ? 18 : 15,
        guardianApproved: false,
      }).allowed).map(item => <Pressable key={item.id} accessibilityRole="button" style={styles.choice} onPress={() => {
        setTemplate(item)
        setName(item.defaultName)
        setStep("user")
      }}><Text>{labels[item.category]}</Text></Pressable>)}
    </View>
  )

  if (step === "user") return (
    <View style={styles.screen}>
      <Text style={styles.title}>TA 应该怎么称呼你？</Text>
      <TextInput value={userDisplayName} onChangeText={setUserDisplayName} placeholder="例如：神龙" style={styles.input} />
      <Button title="继续" disabled={!userDisplayName.trim()} onPress={() => setStep("name")} />
    </View>
  )

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>希望 TA 怎么称呼自己？</Text>
      <TextInput value={name} onChangeText={setName} placeholder="例如：Arete" style={styles.input} />
      <Button title="开始聊天" disabled={!name.trim()} onPress={() => onComplete(createCompanion({
        template,
        companionName: name,
        userDisplayName,
        userAgeBand: ageBand,
        id: `companion-${Date.now()}`,
        now: new Date().toISOString(),
      }))} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", gap: 16, padding: 24, backgroundColor: "#F7F8F7" },
  title: { fontSize: 24, fontWeight: "700", color: "#171A1F" },
  choice: { padding: 18, borderWidth: 1, borderColor: "#B8BEC7", backgroundColor: "#FFFFFF" },
  input: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: "#B8BEC7", backgroundColor: "#FFFFFF" },
})
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile exec jest tests/onboarding.test.tsx --runInBand"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile typecheck"
```

Commit:

```powershell
D:\tools\rtk\rtk.exe git add apps/mobile
D:\tools\rtk\rtk.exe git commit -m "feat(mobile): add companion onboarding"
```

---

### Task 7: Add The Temporary BYOK Connection Screen

**Files:**
- Create: `apps/mobile/src/model/ModelConnectionScreen.tsx`
- Create: `apps/mobile/tests/model-screen.test.tsx`

- [ ] **Step 1: Write the failing screen test**

```tsx
// apps/mobile/tests/model-screen.test.tsx
import { fireEvent, render } from "@testing-library/react-native"
import { ModelConnectionScreen } from "../src/model/ModelConnectionScreen"

it("saves a DeepSeek BYOK connection", async () => {
  const onSave = jest.fn(async () => undefined)
  const screen = render(<ModelConnectionScreen onSave={onSave} />)
  fireEvent.changeText(screen.getByPlaceholderText("API Key"), "secret")
  fireEvent.press(screen.getByText("保存并继续"))
  expect(onSave).toHaveBeenCalledWith({
    connection: {
      kind: "byok", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", credentialId: "primary",
    },
    apiKey: "secret",
  })
})
```

- [ ] **Step 2: Run red**

Expected: FAIL because the screen does not exist.

- [ ] **Step 3: Implement the screen**

```tsx
// apps/mobile/src/model/ModelConnectionScreen.tsx
import { useState } from "react"
import { Button, StyleSheet, Text, TextInput, View } from "react-native"
import { normalizeModelConnection, type ByokModelConnection } from "@viraha/companion-core"

export function ModelConnectionScreen({ onSave }: {
  onSave: (value: { connection: ByokModelConnection; apiKey: string }) => Promise<void>
}) {
  const [apiKey, setApiKey] = useState("")
  const [error, setError] = useState("")
  const connection = normalizeModelConnection({
    kind: "byok", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", credentialId: "primary",
  })
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>连接模型</Text>
      <Text style={styles.note}>首个开发版本使用你自己的 DeepSeek API。匿名官方额度将在下一阶段加入。</Text>
      <TextInput value={apiKey} onChangeText={setApiKey} placeholder="API Key" secureTextEntry style={styles.input} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="保存并继续" disabled={!apiKey.trim()} onPress={() => {
        void onSave({ connection, apiKey: apiKey.trim() }).catch(reason => setError(String(reason)))
      }} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", gap: 12, padding: 24, backgroundColor: "#F7F8F7" },
  title: { fontSize: 24, fontWeight: "700" },
  note: { color: "#60666F" },
  input: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: "#B8BEC7", backgroundColor: "#FFFFFF" },
  error: { color: "#B42318" },
})
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile exec jest tests/model-screen.test.tsx --runInBand"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile typecheck"
```

Commit:

```powershell
D:\tools\rtk\rtk.exe git add apps/mobile
D:\tools\rtk\rtk.exe git commit -m "feat(mobile): add BYOK connection setup"
```

---

### Task 8: Complete The Persistent Text Chat Loop

**Files:**
- Create: `apps/mobile/src/chat/ChatScreen.tsx`
- Create: `apps/mobile/src/app/VirahaApp.tsx`
- Create: `apps/mobile/tests/chat.test.tsx`
- Create: `apps/mobile/tests/app-flow.test.tsx`
- Modify: `apps/mobile/App.tsx`
- Delete: `apps/mobile/tests/app.test.tsx`

- [ ] **Step 1: Write failing chat and application-flow tests**

```tsx
// apps/mobile/tests/chat.test.tsx
import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { ChatScreen } from "../src/chat/ChatScreen"

it("persists a user turn and assistant reply", async () => {
  const addMessage = jest.fn(async () => undefined)
  const screen = render(<ChatScreen
    companion={{
      id: "c1", templateId: "official.arete", category: "fitness", name: "Arete",
      userDisplayName: "神龙", userAgeBand: "adult", description: "健身伙伴",
      createdAt: "2026-07-11T00:00:00.000Z",
    }}
    messages={[]}
    complete={async () => "今天从轻量训练开始。"}
    addMessage={addMessage}
  />)
  fireEvent.changeText(screen.getByPlaceholderText("和 Arete 说点什么…"), "今天练什么？")
  fireEvent.press(screen.getByLabelText("发送"))
  await waitFor(() => expect(screen.getByText("今天从轻量训练开始。")).toBeTruthy())
  expect(addMessage).toHaveBeenCalledTimes(2)
})
```

```tsx
// apps/mobile/tests/app-flow.test.tsx
import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { VirahaApp } from "../src/app/VirahaApp"

it("shows onboarding when no local companion exists", async () => {
  const screen = render(<VirahaApp services={{
    boot: async () => ({ companion: null, connection: null, apiKey: null, messages: [] }),
    saveCompanion: jest.fn(async () => undefined),
    saveConnection: jest.fn(async () => undefined),
    addMessage: jest.fn(async () => undefined),
    complete: jest.fn(async () => ""),
  }} />)
  await waitFor(() => expect(screen.getByText("请选择年龄范围")).toBeTruthy())
})

it("shows a retry when local startup fails", async () => {
  const boot = jest.fn()
    .mockRejectedValueOnce(new Error("database unavailable"))
    .mockResolvedValueOnce({ companion: null, connection: null, apiKey: null, messages: [] })
  const screen = render(<VirahaApp services={{
    boot,
    saveCompanion: jest.fn(async () => undefined),
    saveConnection: jest.fn(async () => undefined),
    addMessage: jest.fn(async () => undefined),
    complete: jest.fn(async () => ""),
  }} />)
  await waitFor(() => expect(screen.getByText("database unavailable")).toBeTruthy())
  fireEvent.press(screen.getByText("重试"))
  await waitFor(() => expect(screen.getByText("请选择年龄范围")).toBeTruthy())
})
```

- [ ] **Step 2: Run red**

Expected: FAIL because chat and application composition do not exist.

- [ ] **Step 3: Implement the chat screen**

```tsx
// apps/mobile/src/chat/ChatScreen.tsx
import { useState } from "react"
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import type { CompanionProfile } from "@viraha/companion-core"
import type { StoredMessage } from "../storage/repository"

export function ChatScreen(props: {
  companion: CompanionProfile
  messages: StoredMessage[]
  complete: (message: string, history: StoredMessage[]) => Promise<string>
  addMessage: (message: StoredMessage) => Promise<void>
}) {
  const [messages, setMessages] = useState(props.messages)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")

  async function send() {
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    setError("")
    const userMessage: StoredMessage = {
      id: `message-${Date.now()}-user`, sessionId: "primary", role: "user", content, createdAt: new Date().toISOString(),
    }
    const history = [...messages, userMessage]
    setMessages(history)
    try {
      await props.addMessage(userMessage)
      const reply = await props.complete(content, history)
      const assistantMessage: StoredMessage = {
        id: `message-${Date.now()}-assistant`, sessionId: "primary", role: "assistant", content: reply, createdAt: new Date().toISOString(),
      }
      await props.addMessage(assistantMessage)
      setMessages(value => [...value, assistantMessage])
      setDraft("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSending(false)
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.header}>{props.companion.name}</Text>
      <FlatList data={messages} keyExtractor={item => item.id} renderItem={({ item }) => (
        <View style={[styles.message, item.role === "user" ? styles.user : styles.assistant]}>
          <Text>{item.content}</Text>
        </View>
      )} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.composer}>
        <TextInput value={draft} onChangeText={setDraft} placeholder={`和 ${props.companion.name} 说点什么…`} style={styles.input} />
        <Pressable accessibilityRole="button" accessibilityLabel="发送" disabled={sending} onPress={() => void send()}>
          <Text style={styles.send}>发送</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: 48, backgroundColor: "#F7F8F7" },
  header: { paddingHorizontal: 16, paddingBottom: 12, fontSize: 20, fontWeight: "700" },
  message: { marginHorizontal: 16, marginVertical: 5, padding: 12, borderWidth: 1, borderColor: "#D6DADF" },
  user: { backgroundColor: "#E8EEFF" }, assistant: { backgroundColor: "#FFFFFF" },
  composer: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderTopWidth: 1, borderColor: "#D6DADF" },
  input: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: "#B8BEC7", backgroundColor: "#FFFFFF" },
  send: { color: "#2457D6", fontWeight: "700" }, error: { paddingHorizontal: 16, color: "#B42318" },
})
```

- [ ] **Step 4: Implement application composition**

```tsx
// apps/mobile/src/app/VirahaApp.tsx
import { useEffect, useMemo, useState } from "react"
import { ActivityIndicator, Button, StyleSheet, Text, View } from "react-native"
import type { ByokModelConnection, CompanionProfile } from "@viraha/companion-core"
import { OnboardingFlow } from "../onboarding/OnboardingFlow"
import { ModelConnectionScreen } from "../model/ModelConnectionScreen"
import { ProviderCredentialStore } from "../model/credential-store"
import { OpenAICompatibleGateway } from "../model/openai-compatible"
import { ChatScreen } from "../chat/ChatScreen"
import { openMobileDatabase } from "../storage/database"
import { MobileRepository, type StoredMessage } from "../storage/repository"
import { createMobileSchema } from "../storage/schema"

interface BootResult {
  companion: CompanionProfile | null
  connection: ByokModelConnection | null
  apiKey: string | null
  messages: StoredMessage[]
}

export interface MobileServices {
  boot(): Promise<BootResult>
  saveCompanion(value: CompanionProfile): Promise<void>
  saveConnection(value: ByokModelConnection, apiKey: string): Promise<void>
  addMessage(value: StoredMessage): Promise<void>
  complete(input: {
    companion: CompanionProfile
    connection: ByokModelConnection
    apiKey: string
    history: StoredMessage[]
  }): Promise<string>
}

function createMobileServices(): MobileServices {
  const resources = (async () => {
    const db = await openMobileDatabase()
    await createMobileSchema(db)
    return {
      repository: new MobileRepository(db),
      credentials: new ProviderCredentialStore(),
      gateway: new OpenAICompatibleGateway(),
    }
  })()

  return {
    async boot() {
      const { repository, credentials } = await resources
      const companion = await repository.getCompanion()
      const connection = await repository.getConnection()
      const apiKey = connection ? await credentials.read(connection.credentialId) : null
      const messages = companion ? await repository.listMessages("primary") : []
      return { companion, connection, apiKey, messages }
    },
    async saveCompanion(value) {
      const { repository } = await resources
      await repository.saveCompanion(value)
      await repository.createSession("primary", value.id, new Date().toISOString())
    },
    async saveConnection(value, apiKey) {
      const { repository, credentials } = await resources
      await credentials.save(value.credentialId, apiKey)
      await repository.saveConnection("primary", value)
    },
    async addMessage(value) {
      const { repository } = await resources
      await repository.addMessage(value)
    },
    async complete({ companion, connection, apiKey, history }) {
      const { gateway } = await resources
      return gateway.complete({
        baseUrl: connection.baseUrl,
        model: connection.model,
        apiKey,
        messages: [
          {
            role: "system",
            content: `You are ${companion.name}, a Companion who calls the user ${companion.userDisplayName}. Be honest that you are an AI, support user agency, prefer peaceful and non-violent help, and never encourage hatred or group dehumanization.${companion.userAgeBand === "teen" ? " Youth Mode is active: do not provide adult, romantic, manipulative, dangerous, gambling, alcohol, or high-risk content; encourage school, family, friends, health, and trusted adults." : ""}`,
          },
          ...history.map(message => ({ role: message.role, content: message.content } as const)),
        ],
      })
    },
  }
}

type ScreenState =
  | { name: "booting" }
  | { name: "fatal"; message: string }
  | { name: "onboarding" }
  | { name: "connection"; companion: CompanionProfile }
  | {
      name: "chat"
      companion: CompanionProfile
      connection: ByokModelConnection
      apiKey: string
      messages: StoredMessage[]
    }

export function VirahaApp({ services }: { services?: MobileServices }) {
  const activeServices = useMemo(() => services ?? createMobileServices(), [services])
  const [state, setState] = useState<ScreenState>({ name: "booting" })
  const [bootAttempt, setBootAttempt] = useState(0)

  useEffect(() => {
    let active = true
    void activeServices.boot()
      .then(result => {
        if (!active) return
        if (!result.companion) setState({ name: "onboarding" })
        else if (!result.connection || !result.apiKey) setState({ name: "connection", companion: result.companion })
        else setState({ name: "chat", ...result, companion: result.companion, connection: result.connection, apiKey: result.apiKey })
      })
      .catch(reason => { if (active) setState({ name: "fatal", message: reason instanceof Error ? reason.message : String(reason) }) })
    return () => { active = false }
  }, [activeServices, bootAttempt])

  if (state.name === "booting") return <View style={styles.loading}><ActivityIndicator /></View>
  if (state.name === "fatal") return <View style={styles.loading}>
    <Text>{state.message}</Text>
    <Button title="重试" onPress={() => { setState({ name: "booting" }); setBootAttempt(value => value + 1) }} />
  </View>
  if (state.name === "onboarding") return <OnboardingFlow onComplete={companion => {
    void activeServices.saveCompanion(companion)
      .then(() => setState({ name: "connection", companion }))
      .catch(reason => setState({ name: "fatal", message: reason instanceof Error ? reason.message : String(reason) }))
  }} />
  if (state.name === "connection") return <ModelConnectionScreen onSave={async ({ connection, apiKey }) => {
    await activeServices.saveConnection(connection, apiKey)
    setState({ name: "chat", companion: state.companion, connection, apiKey, messages: [] })
  }} />
  return <ChatScreen
    companion={state.companion}
    messages={state.messages}
    addMessage={value => activeServices.addMessage(value)}
    complete={(_message, history) => activeServices.complete({
      companion: state.companion,
      connection: state.connection,
      apiKey: state.apiKey,
      history,
    })}
  />
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: "center", justifyContent: "center" } })
```

Replace `App.tsx` with:

```tsx
// apps/mobile/App.tsx
import { VirahaApp } from "./src/app/VirahaApp"
export function App() { return <VirahaApp /> }
```

Delete the original scaffold-only `apps/mobile/tests/app.test.tsx`; `app-flow.test.tsx` now owns the root-state coverage without opening native SQLite during Jest startup.

- [ ] **Step 5: Verify the complete local loop**

Run:

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile test"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile typecheck"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm --filter @viraha/mobile export:android"
```

Expected: all tests PASS, typecheck PASS, Android bundle export succeeds.

- [ ] **Step 6: Commit**

```powershell
D:\tools\rtk\rtk.exe git add apps/mobile
D:\tools\rtk\rtk.exe git commit -m "feat(mobile): complete persistent BYOK chat loop"
```

---

### Task 9: Add Android Preview And CI Release Gates

**Files:**
- Create: `apps/mobile/eas.json`
- Create: `.github/workflows/mobile-preview.yml`
- Create: `docs/mobile-test-matrix.md`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add EAS preview configuration**

```json
{
  "cli": { "version": ">= 16.0.0" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal", "android": { "buildType": "apk" } },
    "production": { "autoIncrement": true }
  }
}
```

- [ ] **Step 2: Add the mobile CI workflow**

```yaml
# .github/workflows/mobile-preview.yml
name: Mobile Preview

on:
  pull_request:
    paths:
      - "apps/mobile/**"
      - "packages/companion-core/**"
      - "pnpm-lock.yaml"
  workflow_dispatch:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.7.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 17 }
      - uses: android-actions/setup-android@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @viraha/companion-core test
      - run: pnpm --filter @viraha/companion-core build
      - run: pnpm --filter @viraha/mobile test
      - run: pnpm --filter @viraha/mobile typecheck
      - run: pnpm --filter @viraha/mobile export:android
      - run: pnpm --filter @viraha/mobile exec expo prebuild --platform android --no-install
      - run: ./gradlew assembleDebug
        working-directory: apps/mobile/android
      - uses: actions/upload-artifact@v4
        with:
          name: viraha-mobile-debug-apk
          path: apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Insert these steps in the existing `.github/workflows/ci.yml` immediately after `pnpm build`:

```yaml
      - run: pnpm --filter @viraha/companion-core test
      - run: pnpm --filter @viraha/mobile test
      - run: pnpm --filter @viraha/mobile typecheck
      - run: pnpm --filter @viraha/mobile export:android
      - name: Check portable Core for Node-only imports
        shell: bash
        run: |
          if grep -R 'from "node:' packages/companion-core/src; then
            echo "Portable Companion Core imports a Node-only module"
            exit 1
          fi
```

- [ ] **Step 3: Write the physical-device matrix**

```md
# Viraha Mobile Test Matrix

## Required Before Internal APK

- [ ] Android export succeeds on Node 22
- [ ] Companion creation completes in under 60 seconds
- [ ] API key is absent from SQLite and logs
- [ ] DeepSeek BYOK sends and persists one complete turn
- [ ] Relaunch restores Companion, connection metadata and messages
- [ ] Invalid API key keeps the draft and shows an actionable error

## Physical Android Baseline

- [ ] iQOO Neo, Snapdragon 845, 6GB/64GB
- [ ] Record Android/Funtouch OS version
- [ ] Test cold start, keyboard, background/resume and low-memory recovery
- [ ] Confirm core flow works without Google services

## Cloud Device Coverage

- [ ] Google reference device, Android 9
- [ ] Google reference device, current Android
- [ ] One Xiaomi/HyperOS device
- [ ] One OPPO or vivo device

## iOS Deferred Gate

- [ ] EAS development build installs through TestFlight
- [ ] Keychain, SQLite and keyboard behavior verified on a real iPhone
```

- [ ] **Step 4: Run the full foundation gate**

```powershell
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm build"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm test:full"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm mobile:check"
D:\tools\rtk\rtk.exe proxy powershell -NoProfile -Command "$env:Path='D:\tools\node22;'+$env:Path; & 'D:\tools\node22\node.exe' 'D:\tools\node22\node_modules\corepack\dist\corepack.js' pnpm mobile:export"
```

Expected: all commands PASS on Node 22.

- [ ] **Step 5: Commit**

```powershell
D:\tools\rtk\rtk.exe git add apps/mobile/eas.json .github/workflows docs/mobile-test-matrix.md
D:\tools\rtk\rtk.exe git commit -m "test(mobile): add Android foundation gates"
```

---

## Completion Gate

This plan is complete only when:

- `@viraha/companion-core` builds without importing any `node:` module.
- Mobile tests, typecheck and Android export pass on Node 22.
- A user can create Arete, enter a BYOK key and complete a persistent text conversation.
- API keys are stored only in Secure Store, never in SQLite or logs.
- Android 9 remains the configured minimum.
- Youth Pack restrictions are enforced by portable Core tests.
- Users under 14 cannot independently complete onboarding in this internal foundation.
- Teen onboarding cannot select adult or romance Packs.
- Existing Node build and full test suite remain green.
- The physical iQOO Neo test is recorded before distributing the first internal APK.
