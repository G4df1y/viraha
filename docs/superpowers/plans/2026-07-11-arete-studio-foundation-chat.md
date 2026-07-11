# Arete Studio Foundation And Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Arete installable on Node.js 22, expose `arete start|doctor|logs`, serve the approved React product shell, and migrate persistent streaming chat into it.

**Architecture:** Keep the existing Hono server and Viraha runtime packages. Add a Vite + React client under `apps/arete/web`, bundle the server/CLI as the publishable `@viraha/arete` package, and replace the inline HTML in `web.ts` with API routes plus static SPA hosting. Persist Web sessions through the existing `SessionManager` rather than inventing a second chat store.

**Tech Stack:** Node.js 22 LTS, TypeScript, pnpm, Hono, Vite, React, React Router, Lucide React, Vitest, Testing Library, Playwright, tsup.

---

## Execution Prerequisites

- Run this plan from a real Git checkout. The current `D:\viraha` workspace has no `.git` directory, so commit steps cannot run until the repository metadata is restored.
- RTK must be available on `PATH`; every command below is intentionally prefixed with `rtk` per repository instructions.
- Use Node.js 22 LTS. Do not execute dependency installation under Node.js 24.

## File Map

**Runtime and distribution**

- Create `.node-version` — supported local/CI Node version.
- Modify `package.json` — root runtime guard and scripts.
- Modify `.github/workflows/ci.yml` — Node 22 Ubuntu/Windows matrix.
- Modify the 15 package manifests whose tests currently use `|| true` — make tests fail correctly on Windows.
- Create `apps/arete/src/cli/runtime-check.ts` — Node version validation.
- Create `apps/arete/src/config/paths.ts` — platform-correct data/config/log paths.
- Create `apps/arete/src/cli/doctor.ts` — preflight report.
- Create `apps/arete/src/cli/start.ts` — start bundled server and open browser.
- Create `apps/arete/src/cli/logs.ts` — display local log tail.
- Replace `apps/arete/src/cli.ts` — product CLI command router.
- Create `apps/arete/tsup.config.ts` — publishable server/CLI bundle.
- Create `apps/arete/scripts/copy-resources.mjs` — copy client and fitness resources into package output.
- Modify `apps/arete/package.json` — bin, files, build, frontend dependencies.
- Modify `apps/arete/src/index.ts` — honor resolved data/resource paths.

**Web client and chat**

- Create `apps/arete/vite.config.ts` and `apps/arete/web/index.html` — Vite entry.
- Create `apps/arete/web/src/main.tsx`, `app/App.tsx`, `app/router.tsx` — application bootstrap.
- Create `apps/arete/web/src/styles/tokens.css`, `global.css` — Quiet Sport Tech 2002 tokens.
- Create `apps/arete/web/src/components/shell/AppShell.tsx`, `PrimaryNav.tsx`, `SessionRail.tsx`, `StatusFooter.tsx` — stable product shell.
- Create `apps/arete/web/src/components/ui/IconButton.tsx`, `StatusTag.tsx` — reusable controls.
- Create `apps/arete/web/src/features/chat/api.ts`, `useChatStream.ts`, `ChatPage.tsx`, `MessageList.tsx`, `Composer.tsx` — chat UI.
- Create `apps/arete/src/api/sessions.ts`, `chat.ts` — persistent chat endpoints.
- Create `apps/arete/src/web/static.ts` — SPA asset serving.
- Reduce `apps/arete/src/web.ts` — API composition only.
- Modify `packages/runtime/src/session.ts` — user-scoped session listing and ownership checks.

**Tests**

- Create `apps/arete/tests/runtime-check.test.ts`, `paths.test.ts`, `cli-doctor.test.ts`.
- Create `packages/runtime/tests/session-list.test.ts`.
- Create `apps/arete/tests/chat-api.test.ts`.
- Create `apps/arete/web/src/components/shell/AppShell.test.tsx` and `features/chat/ChatPage.test.tsx`.
- Create `apps/arete/vitest.web.config.ts`.
- Create `apps/arete/tests/e2e/server.ts` and `tests/e2e/arete-studio.spec.ts`.
- Create `playwright.config.ts`.
- Create `apps/arete/scripts/pack-smoke.mjs`.

---

### Task 1: Pin Node 22 And Restore Cross-Platform Test Failure Semantics

**Files:**
- Create: `.node-version`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `apps/arete/package.json`
- Modify: `packages/{channels,context,core,db,embedding,emotion,journal,knowledge,memory,persona,presence,provider,relationship,runtime}/package.json`
- Create: `apps/arete/src/cli/runtime-check.ts`
- Test: `apps/arete/tests/runtime-check.test.ts`

- [ ] **Step 1: Write the failing runtime-version test**

```ts
// apps/arete/tests/runtime-check.test.ts
import { describe, expect, it } from "vitest"
import { checkNodeVersion } from "../src/cli/runtime-check.js"

describe("checkNodeVersion", () => {
  it("accepts Node 22", () => {
    expect(checkNodeVersion("22.18.0")).toEqual({ ok: true, major: 22 })
  })

  it("rejects unverified Node majors with an actionable message", () => {
    expect(checkNodeVersion("24.1.0")).toEqual({
      ok: false,
      major: 24,
      message: "Arete requires Node.js 22 LTS. Detected 24.1.0.",
    })
  })
})
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/runtime-check.test.ts
```

Expected: FAIL because `src/cli/runtime-check.ts` does not exist.

- [ ] **Step 3: Implement the runtime check**

```ts
// apps/arete/src/cli/runtime-check.ts
export interface NodeVersionCheck {
  ok: boolean
  major: number
  message?: string
}

export function checkNodeVersion(version = process.versions.node): NodeVersionCheck {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10)
  if (major === 22) return { ok: true, major }
  return {
    ok: false,
    major,
    message: `Arete requires Node.js 22 LTS. Detected ${version}.`,
  }
}
```

Create `.node-version` with exactly:

```text
22
```

Add to the root `package.json`:

```json
{
  "engines": { "node": ">=22 <23" },
  "packageManager": "pnpm@11.7.0"
}
```

In every listed package manifest, replace:

```json
"test": "vitest run --passWithNoTests || true"
```

with:

```json
"test": "vitest run --passWithNoTests"
```

Replace `.github/workflows/ci.yml` with a two-OS Node 22 matrix:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11.7.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test
        env:
          NODE_ENV: test
      - run: pnpm lint
      - name: Check package type escapes
        shell: bash
        run: |
          if grep -r "as any" --include="*.ts" packages/; then
            echo "Found 'as any' usages in packages/"
            exit 1
          fi
```

- [ ] **Step 4: Verify the focused test and manifest cleanup**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/runtime-check.test.ts
rtk grep 'vitest run --passWithNoTests \|\| true' -g package.json .
```

Expected: runtime test PASS; grep returns no matches.

- [ ] **Step 5: Commit**

```powershell
rtk git add .node-version package.json .github/workflows/ci.yml apps/arete/package.json packages/*/package.json apps/arete/src/cli/runtime-check.ts apps/arete/tests/runtime-check.test.ts
rtk git commit -m "build: pin Arete to Node 22"
```

---

### Task 2: Add Stable Application Paths And Doctor Checks

**Files:**
- Create: `apps/arete/src/config/paths.ts`
- Create: `apps/arete/src/cli/doctor.ts`
- Test: `apps/arete/tests/paths.test.ts`
- Test: `apps/arete/tests/cli-doctor.test.ts`
- Modify: `apps/arete/src/index.ts`

- [ ] **Step 1: Write failing path and doctor tests**

```ts
// apps/arete/tests/paths.test.ts
import { describe, expect, it } from "vitest"
import { resolveAretePaths } from "../src/config/paths.js"

describe("resolveAretePaths", () => {
  it("uses LOCALAPPDATA on Windows", () => {
    const paths = resolveAretePaths({
      platform: "win32",
      homeDir: "C:\\Users\\Ada",
      env: { LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local" },
    })
    expect(paths.rootDir).toBe("C:\\Users\\Ada\\AppData\\Local\\Viraha\\Arete")
    expect(paths.dbPath).toBe("C:\\Users\\Ada\\AppData\\Local\\Viraha\\Arete\\data\\arete.db")
  })

  it("honors ARETE_HOME", () => {
    const paths = resolveAretePaths({
      platform: "linux",
      homeDir: "/home/ada",
      env: { ARETE_HOME: "/srv/arete" },
    })
    expect(paths.rootDir).toBe("/srv/arete")
  })
})
```

```ts
// apps/arete/tests/cli-doctor.test.ts
import { describe, expect, it } from "vitest"
import { runDoctor } from "../src/cli/doctor.js"

describe("runDoctor", () => {
  it("reports unsupported Node and does not throw", async () => {
    const report = await runDoctor({
      nodeVersion: "24.1.0",
      port: 3000,
      paths: {
        rootDir: "C:\\arete",
        dataDir: "C:\\arete\\data",
        configDir: "C:\\arete\\config",
        logDir: "C:\\arete\\logs",
        dbPath: "C:\\arete\\data\\arete.db",
        logPath: "C:\\arete\\logs\\arete.log",
      },
      ensureWritable: async () => true,
      isPortAvailable: async () => true,
    })
    expect(report.ok).toBe(false)
    expect(report.checks[0]).toMatchObject({ id: "node", ok: false })
  })
})
```

- [ ] **Step 2: Run the tests and confirm missing modules**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/paths.test.ts tests/cli-doctor.test.ts
```

Expected: FAIL because path and doctor modules do not exist.

- [ ] **Step 3: Implement platform paths**

```ts
// apps/arete/src/config/paths.ts
import os from "node:os"
import path from "node:path"

export interface AretePaths {
  rootDir: string
  dataDir: string
  configDir: string
  logDir: string
  dbPath: string
  logPath: string
}

interface ResolvePathOptions {
  platform?: NodeJS.Platform
  homeDir?: string
  env?: NodeJS.ProcessEnv
}

export function resolveAretePaths(options: ResolvePathOptions = {}): AretePaths {
  const platform = options.platform ?? process.platform
  const homeDir = options.homeDir ?? os.homedir()
  const env = options.env ?? process.env
  const override = env.ARETE_HOME?.trim()
  let rootDir: string

  if (override) rootDir = path.resolve(override)
  else if (platform === "win32") rootDir = path.join(env.LOCALAPPDATA || homeDir, "Viraha", "Arete")
  else if (platform === "darwin") rootDir = path.join(homeDir, "Library", "Application Support", "Viraha", "Arete")
  else rootDir = path.join(env.XDG_DATA_HOME || path.join(homeDir, ".local", "share"), "viraha", "arete")

  const dataDir = path.join(rootDir, "data")
  const configDir = path.join(rootDir, "config")
  const logDir = path.join(rootDir, "logs")
  return {
    rootDir,
    dataDir,
    configDir,
    logDir,
    dbPath: path.join(dataDir, "arete.db"),
    logPath: path.join(logDir, "arete.log"),
  }
}
```

- [ ] **Step 4: Implement doctor checks**

```ts
// apps/arete/src/cli/doctor.ts
import fs from "node:fs/promises"
import net from "node:net"
import type { AretePaths } from "../config/paths.js"
import { resolveAretePaths } from "../config/paths.js"
import { checkNodeVersion } from "./runtime-check.js"

export interface DoctorCheck { id: string; ok: boolean; message: string }
export interface DoctorReport { ok: boolean; checks: DoctorCheck[] }

interface DoctorOptions {
  nodeVersion?: string
  port?: number
  paths?: AretePaths
  ensureWritable?: (dir: string) => Promise<boolean>
  isPortAvailable?: (port: number) => Promise<boolean>
}

async function ensureWritable(dir: string): Promise<boolean> {
  try {
    await fs.mkdir(dir, { recursive: true })
    const probe = `${dir}/.write-test-${Date.now()}`
    await fs.writeFile(probe, "ok")
    await fs.unlink(probe)
    return true
  } catch { return false }
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once("error", () => resolve(false))
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)))
  })
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const node = checkNodeVersion(options.nodeVersion)
  const paths = options.paths ?? resolveAretePaths()
  const port = options.port ?? Number.parseInt(process.env.PORT || "3000", 10)
  const writable = options.ensureWritable ?? ensureWritable
  const portCheck = options.isPortAvailable ?? isPortAvailable
  const checks: DoctorCheck[] = [
    { id: "node", ok: node.ok, message: node.ok ? "Node.js 22 LTS" : node.message! },
    { id: "data", ok: await writable(paths.dataDir), message: paths.dataDir },
    { id: "config", ok: await writable(paths.configDir), message: paths.configDir },
    { id: "logs", ok: await writable(paths.logDir), message: paths.logDir },
    { id: "port", ok: await portCheck(port), message: `127.0.0.1:${port}` },
  ]
  return { ok: checks.every(check => check.ok), checks }
}
```

Modify `apps/arete/src/index.ts` to replace the cwd-based data path:

```ts
import { resolveAretePaths } from "./config/paths.js"

const ARETE_PATHS = resolveAretePaths()
const DATA_DIR = ARETE_PATHS.dataDir
// inside main:
const dbPath = ARETE_PATHS.dbPath
```

- [ ] **Step 5: Run tests**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/paths.test.ts tests/cli-doctor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
rtk git add apps/arete/src/config/paths.ts apps/arete/src/cli/doctor.ts apps/arete/src/index.ts apps/arete/tests/paths.test.ts apps/arete/tests/cli-doctor.test.ts
rtk git commit -m "feat(arete): add runtime doctor"
```

---

### Task 3: Replace The Chat CLI With Product Lifecycle Commands

**Files:**
- Replace: `apps/arete/src/cli.ts`
- Create: `apps/arete/src/cli/start.ts`
- Create: `apps/arete/src/cli/logs.ts`
- Create: `apps/arete/src/cli/output.ts`
- Modify: `apps/arete/package.json`
- Test: `apps/arete/tests/cli-commands.test.ts`

- [ ] **Step 1: Write failing command-router tests**

```ts
// apps/arete/tests/cli-commands.test.ts
import { describe, expect, it, vi } from "vitest"
import { runCli } from "../src/cli.js"

describe("runCli", () => {
  it("routes doctor", async () => {
    const doctor = vi.fn(async () => ({ ok: true, checks: [] }))
    const code = await runCli(["doctor"], { doctor, start: vi.fn(), logs: vi.fn(), write: vi.fn() })
    expect(code).toBe(0)
    expect(doctor).toHaveBeenCalledOnce()
  })

  it("returns usage for unknown commands", async () => {
    const write = vi.fn()
    const code = await runCli(["unknown"], { doctor: vi.fn(), start: vi.fn(), logs: vi.fn(), write })
    expect(code).toBe(1)
    expect(write).toHaveBeenCalledWith(expect.stringContaining("arete start"))
  })
})
```

- [ ] **Step 2: Run the test and confirm failure**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/cli-commands.test.ts
```

Expected: FAIL because `runCli` is not exported.

- [ ] **Step 3: Implement log tail and start lifecycle**

```ts
// apps/arete/src/cli/logs.ts
import fs from "node:fs/promises"
import { resolveAretePaths } from "../config/paths.js"

export async function readLogTail(lines = 200): Promise<string> {
  const { logPath } = resolveAretePaths()
  try {
    const content = await fs.readFile(logPath, "utf8")
    return content.split(/\r?\n/).slice(-lines).join("\n")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return `No log file yet: ${logPath}`
    throw error
  }
}
```

```ts
// apps/arete/src/cli/start.ts
import fs from "node:fs"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import open from "open"
import { resolveAretePaths } from "../config/paths.js"
import { runDoctor } from "./doctor.js"

export async function startArete(): Promise<number> {
  const report = await runDoctor()
  if (!report.ok) {
    for (const check of report.checks) console.error(`${check.ok ? "OK" : "FAIL"} ${check.id}: ${check.message}`)
    return 1
  }

  const paths = resolveAretePaths()
  fs.mkdirSync(paths.logDir, { recursive: true })
  const log = fs.createWriteStream(paths.logPath, { flags: "a" })
  const serverEntry = fileURLToPath(new URL("../index.js", import.meta.url))
  const child = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, ARETE_HOME: paths.rootDir },
    stdio: ["inherit", "pipe", "pipe"],
  })

  let opened = false
  const forward = (chunk: Buffer, target: NodeJS.WriteStream) => {
    target.write(chunk)
    log.write(chunk)
    const match = chunk.toString().match(/Arete web: (http:\/\/[^\s]+)/)
    if (!opened && match?.[1]) {
      opened = true
      void open(match[1])
    }
  }
  child.stdout.on("data", chunk => forward(chunk, process.stdout))
  child.stderr.on("data", chunk => forward(chunk, process.stderr))
  return await new Promise(resolve => child.once("exit", code => resolve(code ?? 1)))
}
```

- [ ] **Step 4: Implement the CLI router**

```ts
// apps/arete/src/cli.ts
#!/usr/bin/env node
import { runDoctor } from "./cli/doctor.js"
import { readLogTail } from "./cli/logs.js"
import { startArete } from "./cli/start.js"

interface CliDeps {
  doctor: typeof runDoctor
  start: typeof startArete
  logs: typeof readLogTail
  write: (text: string) => void
}

const usage = `Arete Studio\n\n  arete start\n  arete doctor\n  arete logs\n`

export async function runCli(args: string[], deps: CliDeps): Promise<number> {
  const command = args[0] ?? "start"
  if (command === "start") return await deps.start()
  if (command === "doctor") {
    const report = await deps.doctor()
    for (const check of report.checks) deps.write(`${check.ok ? "OK" : "FAIL"} ${check.id}: ${check.message}`)
    return report.ok ? 0 : 1
  }
  if (command === "logs") {
    deps.write(await deps.logs())
    return 0
  }
  deps.write(usage)
  return 1
}

import path from "node:path"
import { fileURLToPath } from "node:url"

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const code = await runCli(process.argv.slice(2), {
    doctor: runDoctor,
    start: startArete,
    logs: readLogTail,
    write: text => console.log(text),
  })
  process.exitCode = code
}
```

Add `open` to `apps/arete/package.json` dependencies and replace the `cli` script with:

```json
"cli": "tsx src/cli.ts"
```

- [ ] **Step 5: Run tests**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/cli-commands.test.ts tests/cli-doctor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
rtk git add apps/arete/src/cli.ts apps/arete/src/cli apps/arete/tests/cli-commands.test.ts apps/arete/package.json pnpm-lock.yaml
rtk git commit -m "feat(arete): add product lifecycle CLI"
```

---

### Task 4: Add The Publishable Server And React Build

**Files:**
- Create: `apps/arete/tsup.config.ts`
- Create: `apps/arete/vite.config.ts`
- Create: `apps/arete/scripts/copy-resources.mjs`
- Create: `apps/arete/web/index.html`
- Create: `apps/arete/web/src/main.tsx`
- Create: `apps/arete/web/src/app/App.tsx`
- Create: `apps/arete/src/web/static.ts`
- Modify: `apps/arete/src/web.ts`
- Modify: `apps/arete/package.json`
- Modify: `apps/arete/tsconfig.json`
- Test: `apps/arete/tests/static-app.test.ts`

- [ ] **Step 1: Write a failing static-app test**

```ts
// apps/arete/tests/static-app.test.ts
import { describe, expect, it } from "vitest"
import { createStaticApp } from "../src/web/static.js"

describe("createStaticApp", () => {
  it("serves index.html for SPA routes", async () => {
    const app = createStaticApp({
      indexHtml: "<!doctype html><div id=\"root\">ARETE_STUDIO</div>",
      assetsDir: "unused",
    })
    const response = await app.request("/models")
    expect(response.status).toBe(200)
    expect(await response.text()).toContain("ARETE_STUDIO")
  })
})
```

- [ ] **Step 2: Run the test and confirm failure**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/static-app.test.ts
```

Expected: FAIL because `web/static.ts` does not exist.

- [ ] **Step 3: Add build configuration**

```ts
// apps/arete/vite.config.ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
  root: path.resolve(__dirname, "web"),
  plugins: [react()],
  build: { outDir: path.resolve(__dirname, "dist/public"), emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:3000" } },
})
```

```ts
// apps/arete/tsup.config.ts
import { defineConfig } from "tsup"

export default defineConfig({
  entry: { index: "src/index.ts", cli: "src/cli.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  sourcemap: true,
  clean: false,
  bundle: true,
  banner: { js: "#!/usr/bin/env node" },
  noExternal: [/^@viraha\//],
})
```

```html
<!-- apps/arete/web/index.html -->
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Arete Studio</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

```tsx
// apps/arete/web/src/main.tsx
import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./app/App"
import "./styles/tokens.css"
import "./styles/global.css"

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>)
```

```tsx
// apps/arete/web/src/app/App.tsx
export function App() {
  return <div data-testid="arete-app">Arete Studio</div>
}
```

- [ ] **Step 4: Add SPA serving and reduce the inline page**

```ts
// apps/arete/src/web/static.ts
import { Hono } from "hono"
import { serveStatic } from "@hono/node-server/serve-static"

export function createStaticApp(options: { indexHtml: string; assetsDir: string }) {
  const app = new Hono()
  app.use("/assets/*", serveStatic({ root: options.assetsDir, rewriteRequestPath: path => path.replace(/^\/assets/, "") }))
  app.get("*", c => c.html(options.indexHtml))
  return app
}
```

In `apps/arete/src/web.ts`, replace the positional parameter list with one dependency object so later routes cannot silently shift arguments:

```ts
export interface AreteAppDependencies {
  pipeline: AgentPipeline
  mcp?: MCPManager
  knowledge?: (query: string) => Promise<string>
  hub?: ChannelHub
  events?: EventBus
  eventStore?: EventStore
  workRunner?: AgentWorkRunner
  providerHealth?: () => unknown
  scheduler?: DurableScheduler
  memory?: MemoryEngine
  companion?: CompanionEngine
  emotion?: EmotionEngine
  journal?: JournalEngine
  publicDir?: string
}
```

Implement `createAreteApp(deps)` by replacing each positional reference with `deps.<name>` and defining `const workRunner = deps.workRunner ?? new AgentWorkRunner()`. Preserve every existing API route before mounting the static fallback. Remove `getHtml()`. Read `dist/public/index.html` once at server creation and mount the static app as the final fallback. Update every Arete test to call `createAreteApp({ pipeline, ... })`. Change `createAreteWebServer` to accept `{ ...deps, port }`, and pass `emotion` and `journal` explicitly; this removes the current mismatch between the call in `index.ts` and the server signature.

Bind the production server to loopback by default:

```ts
const hostname = process.env.ARETE_HOST?.trim() || "127.0.0.1"
serve({ fetch: app.fetch, port, hostname })
console.log(`Arete web: http://${hostname}:${port}`)
```

Do not accept `0.0.0.0` from the Web setup UI in v0.3; remote access needs a separate authenticated design.

- [ ] **Step 5: Update package build and publish metadata**

Add these fields to `apps/arete/package.json`:

```json
{
  "bin": { "arete": "dist/cli.js" },
  "files": ["dist", "resources", "README.md"],
  "engines": { "node": ">=22 <23" },
  "scripts": {
    "build:web": "vite build --config vite.config.ts",
    "build:server": "tsup --config tsup.config.ts",
    "build": "pnpm build:web && pnpm build:server && node scripts/copy-resources.mjs",
    "dev:web": "vite --config vite.config.ts",
    "prepack": "pnpm build"
  },
  "dependencies": {
    "@hono/node-server": "^2.0.8",
    "@larksuiteoapi/node-sdk": "^1.70.0",
    "@libsql/client": "^0.14.0",
    "@xenova/transformers": "^2.17.2",
    "dotenv": "^16.4.0",
    "drizzle-orm": "^0.38.0",
    "hono": "^4.7.0",
    "node-cron": "^3.0.3",
    "open": "^10.1.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "jsdom": "^25.0.1",
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.1",
    "tsup": "^8.3.5",
    "vite": "^6.0.7",
    "vitest": "^3.0.0"
  }
}
```

Move every `@viraha/*` entry from `dependencies` to `devDependencies`. The tsup `noExternal` rule bundles those workspace packages into `dist/index.js` and `dist/cli.js`; leaving `workspace:*` entries in published runtime dependencies would make `npm install -g` depend on separately published internal packages.

Update `apps/arete/tsconfig.json` so server compilation still includes only `src`, while Vite owns `web`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

Create `copy-resources.mjs` to copy `knowledge-packs/fitness-pack` to `apps/arete/resources/fitness-pack` and retain `dist/public`:

```js
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(here, "..")
const root = path.resolve(appDir, "../..")
await fs.rm(path.join(appDir, "resources"), { recursive: true, force: true })
await fs.mkdir(path.join(appDir, "resources"), { recursive: true })
await fs.cp(path.join(root, "knowledge-packs", "fitness-pack"), path.join(appDir, "resources", "fitness-pack"), { recursive: true })
```

- [ ] **Step 6: Install, build, and test**

```powershell
rtk pnpm install
rtk pnpm --filter @viraha/arete exec vitest run tests/static-app.test.ts
rtk pnpm --filter @viraha/arete build
```

Expected: test PASS; `apps/arete/dist/public/index.html`, `dist/index.js`, and `dist/cli.js` exist.

- [ ] **Step 7: Commit**

```powershell
rtk git add apps/arete package.json pnpm-lock.yaml
rtk git commit -m "feat(arete): add React product build"
```

---

### Task 5: Implement The Quiet Sport Tech Application Shell

**Files:**
- Create: `apps/arete/web/src/styles/tokens.css`
- Create: `apps/arete/web/src/styles/global.css`
- Create: `apps/arete/web/src/components/ui/IconButton.tsx`
- Create: `apps/arete/web/src/components/ui/StatusTag.tsx`
- Create: `apps/arete/web/src/components/shell/AppShell.tsx`
- Create: `apps/arete/web/src/components/shell/PrimaryNav.tsx`
- Create: `apps/arete/web/src/components/shell/SessionRail.tsx`
- Create: `apps/arete/web/src/components/shell/StatusFooter.tsx`
- Create: `apps/arete/web/src/components/shell/shell.css`
- Modify: `apps/arete/web/src/app/App.tsx`
- Create: `apps/arete/vitest.web.config.ts`
- Test: `apps/arete/web/src/components/shell/AppShell.test.tsx`

- [ ] **Step 1: Write the failing shell test**

```tsx
// apps/arete/web/src/components/shell/AppShell.test.tsx
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { AppShell } from "./AppShell"

describe("AppShell", () => {
  it("renders the approved primary navigation and local status", () => {
    render(<MemoryRouter><AppShell><div>workspace</div></AppShell></MemoryRouter>)
    expect(screen.getByText("对话")).toBeTruthy()
    expect(screen.getByText("训练计划")).toBeTruthy()
    expect(screen.getByText("消息平台")).toBeTruthy()
    expect(screen.getByText("LOCAL SYSTEM READY")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the web test and confirm failure**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run --config vitest.web.config.ts web/src/components/shell/AppShell.test.tsx
```

Expected: FAIL because the shell components do not exist.

- [ ] **Step 3: Create the design tokens**

```css
/* apps/arete/web/src/styles/tokens.css */
:root {
  --ar-bg: #e8ebea;
  --ar-panel: #f7f8f6;
  --ar-panel-muted: #d9dedb;
  --ar-surface: #fbfcfa;
  --ar-line: #b8c0bd;
  --ar-text: #171b1a;
  --ar-text-muted: #69736f;
  --ar-blue: #1655d1;
  --ar-blue-dark: #0d42ad;
  --ar-live: #8bcf32;
  --ar-danger: #e5614f;
  --ar-radius: 5px;
  --ar-sidebar: 176px;
  --ar-session-rail: 214px;
  font-family: Inter, "Segoe UI", Arial, sans-serif;
  color: var(--ar-text);
  letter-spacing: 0;
}
```

```css
/* apps/arete/web/src/styles/global.css */
* { box-sizing: border-box; }
html, body, #root { width: 100%; min-height: 100%; margin: 0; }
body { background: var(--ar-bg); color: var(--ar-text); }
button, input, textarea { font: inherit; letter-spacing: 0; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--ar-blue); outline-offset: 2px; }
@media (max-width: 900px) { :root { --ar-sidebar: 64px; --ar-session-rail: 180px; } }
@media (max-width: 700px) { :root { --ar-session-rail: 0px; } }
```

- [ ] **Step 4: Implement the shell components**

```tsx
// apps/arete/web/src/components/shell/AppShell.tsx
import type { ReactNode } from "react"
import { PrimaryNav } from "./PrimaryNav"
import { SessionRail } from "./SessionRail"
import "./shell.css"

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="studio-shell">
      <PrimaryNav />
      <SessionRail />
      <main className="studio-workspace">{children}</main>
    </div>
  )
}
```

```tsx
// apps/arete/web/src/components/shell/PrimaryNav.tsx
import { Apple, ChartNoAxesCombined, Dumbbell, MessageSquare, Plug, Settings, Sparkles, Utensils } from "lucide-react"
import { NavLink } from "react-router-dom"

const primary = [
  ["01", "对话", "/chat", MessageSquare],
  ["02", "今天", "/today", Apple],
  ["03", "训练计划", "/training", Dumbbell],
  ["04", "饮食记录", "/nutrition", Utensils],
  ["05", "进展", "/progress", ChartNoAxesCombined],
] as const

export function PrimaryNav() {
  return <aside className="primary-nav">
    <header className="brand"><span className="brand-mark">AR</span><span><b>ARETE</b><small>FITNESS / ACTIVE</small></span></header>
    <p className="nav-label">COMPANION</p>
    {primary.map(([number, label, to, Icon]) => <NavLink key={to} to={to}><code>{number}</code><Icon size={15}/><span>{label}</span></NavLink>)}
    <p className="nav-label">SYSTEM</p>
    <NavLink to="/memory"><Sparkles size={15}/><span>记忆</span></NavLink>
    <NavLink to="/models"><Sparkles size={15}/><span>模型</span></NavLink>
    <NavLink to="/channels"><Plug size={15}/><span>消息平台</span></NavLink>
    <footer><NavLink to="/settings"><Settings size={15}/><span>设置与诊断</span></NavLink><code><i/> LOCAL SYSTEM READY</code></footer>
  </aside>
}
```

```tsx
// apps/arete/web/src/components/shell/SessionRail.tsx
export function SessionRail() {
  return <aside className="session-rail"><button className="new-session">＋ 新建对话 <code>CTRL N</code></button><p>RECENT SESSIONS</p><div id="session-list" /></aside>
}
```

```css
/* apps/arete/web/src/components/shell/shell.css */
.studio-shell { min-height: 100vh; display: grid; grid-template-columns: var(--ar-sidebar) var(--ar-session-rail) minmax(0, 1fr); background: var(--ar-bg); }
.primary-nav { min-height: 100vh; display: flex; flex-direction: column; padding: 12px 9px; background: var(--ar-panel-muted); border-right: 1px solid var(--ar-line); }
.brand { display: flex; align-items: center; gap: 9px; padding: 5px 7px 16px; }
.brand-mark { width: 29px; height: 29px; display: grid; place-items: center; border-radius: var(--ar-radius); background: var(--ar-blue); color: white; font-family: ui-monospace, monospace; font-size: 11px; }
.brand small { display: block; margin-top: 2px; color: var(--ar-text-muted); font-family: ui-monospace, monospace; font-size: 8px; }
.nav-label { margin: 10px 8px 4px; color: var(--ar-text-muted); font: 8px ui-monospace, monospace; }
.primary-nav a { min-height: 34px; display: flex; align-items: center; gap: 8px; padding: 0 8px; border: 1px solid transparent; border-radius: var(--ar-radius); color: #4f5955; text-decoration: none; font-size: 12px; }
.primary-nav a.active { border-color: var(--ar-line); background: var(--ar-panel); color: var(--ar-text); box-shadow: inset 2px 0 var(--ar-blue); }
.primary-nav a code { width: 18px; color: var(--ar-text-muted); font-size: 8px; }
.primary-nav footer { margin-top: auto; padding-top: 8px; border-top: 1px solid var(--ar-line); }
.primary-nav footer code { display: block; padding: 6px 8px; color: var(--ar-text-muted); font-size: 8px; }
.primary-nav footer i { display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; background: var(--ar-live); }
.session-rail { min-height: 100vh; padding: 11px 8px; background: #eef0ef; border-right: 1px solid var(--ar-line); }
.session-rail > p { padding: 8px 7px; color: var(--ar-text-muted); font: 8px ui-monospace, monospace; }
.new-session { width: 100%; height: 32px; padding: 0 9px; border: 1px solid var(--ar-line); border-radius: var(--ar-radius); background: var(--ar-panel); color: var(--ar-text); text-align: left; font-size: 11px; }
.new-session code { float: right; color: var(--ar-text-muted); font-size: 8px; }
.studio-workspace { min-width: 0; min-height: 100vh; background: var(--ar-surface); }
@media (max-width: 900px) { .primary-nav span:not(.brand-mark), .primary-nav code, .nav-label { display: none; } .primary-nav a { justify-content: center; padding: 0; } }
@media (max-width: 700px) { .studio-shell { grid-template-columns: var(--ar-sidebar) minmax(0, 1fr); } .session-rail { display: none; } }
```

- [ ] **Step 5: Add routing and placeholders**

```tsx
// apps/arete/web/src/app/App.tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "../components/shell/AppShell"

const Placeholder = ({ title }: { title: string }) => <section className="page-placeholder"><h1>{title}</h1></section>

export function App() {
  return <BrowserRouter><AppShell><Routes>
    <Route path="/chat" element={<Placeholder title="对话" />} />
    <Route path="/today" element={<Placeholder title="今天" />} />
    <Route path="/training" element={<Placeholder title="训练计划" />} />
    <Route path="/nutrition" element={<Placeholder title="饮食记录" />} />
    <Route path="/progress" element={<Placeholder title="进展" />} />
    <Route path="/memory" element={<Placeholder title="记忆" />} />
    <Route path="/models" element={<Placeholder title="模型" />} />
    <Route path="/channels" element={<Placeholder title="消息平台" />} />
    <Route path="/settings" element={<Placeholder title="设置与诊断" />} />
    <Route path="*" element={<Navigate to="/chat" replace />} />
  </Routes></AppShell></BrowserRouter>
}
```

```ts
// apps/arete/vitest.web.config.ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
export default defineConfig({ plugins: [react()], test: { environment: "jsdom", globals: true } })
```

- [ ] **Step 6: Run the test and build**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run --config vitest.web.config.ts web/src/components/shell/AppShell.test.tsx
rtk pnpm --filter @viraha/arete build
```

Expected: PASS and successful Vite build.

- [ ] **Step 7: Commit**

```powershell
rtk git add apps/arete/web apps/arete/vitest.web.config.ts
rtk git commit -m "feat(arete): add Studio application shell"
```

---

### Task 6: Add User-Scoped Persistent Session APIs

**Files:**
- Modify: `packages/runtime/src/session.ts`
- Modify: `packages/runtime/src/index.ts`
- Test: `packages/runtime/tests/session-list.test.ts`
- Create: `apps/arete/src/api/sessions.ts`
- Modify: `apps/arete/src/web.ts`
- Test: `apps/arete/tests/chat-api.test.ts`

- [ ] **Step 1: Write failing SessionManager tests**

```ts
// packages/runtime/tests/session-list.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { closeDb, initDb, migrate } from "@viraha/db"
import { SessionManager } from "../src/session.js"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"

describe("SessionManager user scoping", () => {
  const dbPath = path.join(os.tmpdir(), `session-${crypto.randomUUID()}.db`)
  beforeEach(async () => { await migrate(dbPath); initDb(dbPath) })
  afterEach(() => { closeDb(); for (const suffix of ["", "-wal", "-shm"]) try { fs.unlinkSync(dbPath + suffix) } catch {} })

  it("lists only the requested user's sessions", async () => {
    const manager = new SessionManager()
    await manager.createSession("user-a", "web", "A session")
    await manager.createSession("user-b", "web", "B session")
    const sessions = await manager.listSessions("user-a")
    expect(sessions).toHaveLength(1)
    expect(sessions[0].title).toBe("A session")
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```powershell
rtk pnpm --filter @viraha/runtime exec vitest run tests/session-list.test.ts
```

Expected: FAIL because `createSession` and `listSessions` do not exist.

- [ ] **Step 3: Extend the database schema and SessionManager**

Add `title` to `sessions` in both `packages/db/src/schema.ts` and `packages/db/src/migrate.ts`:

```ts
title: text("title").notNull().$default(() => "New conversation"),
```

```sql
title TEXT NOT NULL DEFAULT 'New conversation',
```

Add an additive migration statement after table creation:

```ts
try { await client.execute("ALTER TABLE sessions ADD COLUMN title TEXT NOT NULL DEFAULT 'New conversation'") } catch {}
```

Add to `SessionManager`:

```ts
async createSession(userId: string, channel: string, title = "New conversation") {
  const id = crypto.randomUUID()
  await getDb().insert(sessions).values({ id, userId, channel, title, startedAt: new Date().toISOString() })
  return { id, title, channel, startedAt: new Date().toISOString(), messageCount: 0 }
}

async listSessions(userId: string, limit = 50) {
  return getDb().select({
    id: sessions.id,
    title: sessions.title,
    channel: sessions.channel,
    messageCount: sessions.messageCount,
    startedAt: sessions.startedAt,
    endedAt: sessions.endedAt,
  }).from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.startedAt)).limit(limit)
}

async getOwnedSession(sessionId: string, userId: string) {
  return getDb().query.sessions.findFirst({ where: (s, { and, eq }) => and(eq(s.id, sessionId), eq(s.userId, userId)) })
}
```

- [ ] **Step 4: Add session routes**

```ts
// apps/arete/src/api/sessions.ts
import { Hono } from "hono"
import type { SessionManager } from "@viraha/runtime"

export function createSessionRoutes(options: { sessions: SessionManager; resolveUserId: (c: any) => Promise<string> }) {
  const app = new Hono()
  app.get("/", async c => c.json({ sessions: await options.sessions.listSessions(await options.resolveUserId(c)) }))
  app.post("/", async c => {
    const userId = await options.resolveUserId(c)
    const body = await c.req.json<{ title?: string }>().catch(() => ({}))
    return c.json(await options.sessions.createSession(userId, "web", body.title?.trim() || "New conversation"), 201)
  })
  app.get("/:id/messages", async c => {
    const userId = await options.resolveUserId(c)
    const owned = await options.sessions.getOwnedSession(c.req.param("id"), userId)
    if (!owned) return c.json({ error: "Session not found" }, 404)
    return c.json({ messages: await options.sessions.getSessionMessages(owned.id, 100) })
  })
  return app
}
```

Mount under `/api/sessions` before the SPA fallback.

- [ ] **Step 5: Run tests**

```powershell
rtk pnpm --filter @viraha/runtime exec vitest run tests/session-list.test.ts
rtk pnpm --filter @viraha/arete exec vitest run tests/chat-api.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
rtk git add packages/db packages/runtime/src/session.ts packages/runtime/tests/session-list.test.ts apps/arete/src/api/sessions.ts apps/arete/src/web.ts apps/arete/tests/chat-api.test.ts
rtk git commit -m "feat(arete): add persistent web sessions"
```

---

### Task 7: Migrate Streaming Chat Into The React Workspace

**Files:**
- Create: `apps/arete/src/api/chat.ts`
- Modify: `apps/arete/src/web.ts`
- Create: `apps/arete/web/src/features/chat/api.ts`
- Create: `apps/arete/web/src/features/chat/useChatStream.ts`
- Create: `apps/arete/web/src/features/chat/ChatPage.tsx`
- Create: `apps/arete/web/src/features/chat/MessageList.tsx`
- Create: `apps/arete/web/src/features/chat/Composer.tsx`
- Modify: `apps/arete/web/src/app/App.tsx`
- Test: `apps/arete/tests/chat-api.test.ts`
- Test: `apps/arete/web/src/features/chat/ChatPage.test.tsx`

- [ ] **Step 1: Write failing API behavior tests**

```ts
it("streams a session-scoped chat turn and persists both messages", async () => {
  const session = await sessions.createSession("web-user", "web", "Test")
  const response = await app.request("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: session.id, message: "hello" }),
  })
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("text/event-stream")
  const stored = await sessions.getSessionMessages(session.id)
  expect(stored.map(message => message.role)).toEqual(["user", "assistant"])
})
```

- [ ] **Step 2: Run and confirm the old GET stream cannot satisfy the test**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/chat-api.test.ts
```

Expected: FAIL because the POST session-scoped route does not exist.

- [ ] **Step 3: Implement the POST SSE route**

```ts
// apps/arete/src/api/chat.ts
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import type { AgentPipeline, AgentWorkRunner, SessionManager } from "@viraha/runtime"

export function createChatRoutes(options: {
  pipeline: AgentPipeline
  workRunner: AgentWorkRunner
  sessions: SessionManager
  resolveUserId: (c: any) => Promise<string>
  knowledge?: (query: string) => Promise<string>
}) {
  const app = new Hono()
  app.post("/stream", async c => {
    const userId = await options.resolveUserId(c)
    const body = await c.req.json<{ sessionId: string; message: string }>()
    const message = body.message?.trim()
    if (!message) return c.json({ error: "Message required" }, 400)
    const owned = await options.sessions.getOwnedSession(body.sessionId, userId)
    if (!owned) return c.json({ error: "Session not found" }, 404)
    const history = await options.sessions.getSessionMessages(owned.id, 20)
    await options.sessions.storeMessage(owned.id, "user", message)

    return streamSSE(c, async stream => {
      let reply = ""
      await options.workRunner.run({ userId, channel: "web", content: message }, async () => {
        for await (const event of options.pipeline.processStream({
          message,
          userId,
          userIdKind: "internal",
          channel: "web",
          history,
          knowledge: options.knowledge,
        })) {
          if (event.type === "token") reply += event.text
          if (event.type === "done" && !reply) reply = event.reply
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
        }
      })
      if (reply) await options.sessions.storeMessage(owned.id, "assistant", reply)
    })
  })
  return app
}
```

Remove the old GET `/api/chat/stream` route and its wildcard CORS header.

- [ ] **Step 4: Implement the browser stream parser**

```ts
// apps/arete/web/src/features/chat/api.ts
export interface ChatEvent { type: "token" | "done" | "error"; text?: string; reply?: string; message?: string }

export async function streamChat(input: { sessionId: string; message: string; onEvent: (event: ChatEvent) => void; signal?: AbortSignal }) {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: input.sessionId, message: input.message }),
    signal: input.signal,
  })
  if (!response.ok || !response.body) throw new Error((await response.json().catch(() => ({}))).error || "Chat failed")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split("\n\n")
    buffer = frames.pop() || ""
    for (const frame of frames) {
      const data = frame.split("\n").find(line => line.startsWith("data:"))?.slice(5).trim()
      if (data) input.onEvent(JSON.parse(data))
    }
  }
}
```

- [ ] **Step 5: Implement ChatPage and composer**

`ChatPage.tsx` owns selected session, loads `/api/sessions`, renders `MessageList`, and calls `streamChat`. `Composer.tsx` must keep a stable height, disable only while a turn is actively sending, retain the draft after errors, and expose an icon-only send button with Tooltip. `MessageList.tsx` renders user and assistant messages with the approved 1px borders and metadata tags.

Use this state shape:

```ts
interface UiMessage { id: string; role: "user" | "assistant"; content: string; pending?: boolean; error?: string }
```

On send, append the user message and an empty pending assistant message. Token events append to the pending message. Error events keep the user draft available through a Retry command. Done events clear `pending`.

- [ ] **Step 6: Wire the route and run tests**

```powershell
rtk pnpm --filter @viraha/arete exec vitest run tests/chat-api.test.ts
rtk pnpm --filter @viraha/arete exec vitest run --config vitest.web.config.ts web/src/features/chat/ChatPage.test.tsx
rtk pnpm --filter @viraha/arete build
```

Expected: all PASS; `/chat` renders real sessions and streaming chat.

- [ ] **Step 7: Commit**

```powershell
rtk git add apps/arete/src/api apps/arete/src/web.ts apps/arete/tests/chat-api.test.ts apps/arete/web/src/features/chat apps/arete/web/src/app/App.tsx
rtk git commit -m "feat(arete): migrate persistent streaming chat"
```

---

### Task 8: Add Browser, Package, And Windows Release Gates

**Files:**
- Create: `apps/arete/tests/e2e/server.ts`
- Create: `tests/e2e/arete-studio.spec.ts`
- Create: `playwright.config.ts`
- Create: `apps/arete/scripts/pack-smoke.mjs`
- Modify: `apps/arete/package.json`
- Modify: `package.json`
- Modify: `docs/release-checklist.md`

- [ ] **Step 1: Add a deterministic E2E server**

```ts
// apps/arete/tests/e2e/server.ts
import { serve } from "@hono/node-server"
import { AgentPipeline } from "@viraha/runtime"
import type { ChatChunk, ChatParams, ChatResponse, LLMProvider } from "@viraha/provider"
import { closeDb, initDb, migrate } from "@viraha/db"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { ARETE_IDENTITY } from "../../src/identity.js"
import { createAreteApp } from "../../src/web.js"

const dbPath = path.join(os.tmpdir(), `arete-e2e-${crypto.randomUUID()}.db`)
await migrate(dbPath)
initDb(dbPath)

const llm: LLMProvider = {
  name: "e2e",
  async chat(_params: ChatParams): Promise<ChatResponse> {
    return { content: "Knee-safe plan", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 2 } }
  },
  async *chatStream(): AsyncIterable<ChatChunk> {
    yield { content: "Knee-safe " }
    yield { content: "plan", finishReason: "stop" }
  },
}

const pipeline = new AgentPipeline({ identity: ARETE_IDENTITY, model: "e2e-model", llm })
const app = createAreteApp({ pipeline, publicDir: path.resolve("dist/public") })
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 4173 })

function cleanup() {
  server.close()
  closeDb()
  for (const suffix of ["", "-wal", "-shm"]) try { fs.unlinkSync(dbPath + suffix) } catch {}
}
process.on("SIGINT", () => { cleanup(); process.exit(0) })
process.on("SIGTERM", () => { cleanup(); process.exit(0) })
```

- [ ] **Step 2: Write the failing Playwright flow**

```ts
// tests/e2e/arete-studio.spec.ts
import { expect, test } from "@playwright/test"

test("creates a session and streams a reply", async ({ page }) => {
  await page.goto("/chat")
  await expect(page.getByText("ARETE")).toBeVisible()
  await page.getByRole("button", { name: "新建对话" }).click()
  await page.getByPlaceholder("告诉 Arete 你的状态，或记录训练与饮食…").fill("右膝不舒服")
  await page.getByRole("button", { name: "发送" }).click()
  await expect(page.getByText("Knee-safe plan")).toBeVisible()
})
```

- [ ] **Step 3: Configure Playwright**

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test"
export default defineConfig({
  testDir: "tests/e2e",
  webServer: {
    command: "pnpm --filter @viraha/arete e2e:server",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
})
```

- [ ] **Step 4: Add the package smoke script**

```js
// apps/arete/scripts/pack-smoke.mjs
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arete-pack-"))
let tarball
try {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json"], { cwd: appDir, encoding: "utf8", shell: process.platform === "win32" }))
  tarball = path.join(appDir, packed[0].filename)
  execFileSync("npm", ["init", "-y"], { cwd: tempDir, stdio: "ignore", shell: process.platform === "win32" })
  execFileSync("npm", ["install", tarball], { cwd: tempDir, stdio: "inherit", shell: process.platform === "win32" })
  const bin = process.platform === "win32" ? path.join(tempDir, "node_modules", ".bin", "arete.cmd") : path.join(tempDir, "node_modules", ".bin", "arete")
  const output = execFileSync(bin, ["doctor"], { cwd: tempDir, encoding: "utf8", shell: process.platform === "win32" })
  if (!output.includes("OK node")) throw new Error(`Doctor did not pass:\n${output}`)
  if (output.includes("pnpm") || output.includes(appDir)) throw new Error(`Packed CLI leaked source assumptions:\n${output}`)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
  if (tarball) fs.rmSync(tarball, { force: true })
}
```

Add scripts:

```json
"e2e:server": "tsx tests/e2e/server.ts",
"test:e2e": "playwright test",
"test:pack": "node scripts/pack-smoke.mjs"
```

- [ ] **Step 5: Run full verification**

```powershell
rtk pnpm build
rtk pnpm test
rtk pnpm lint
rtk pnpm --filter @viraha/arete test:e2e
rtk pnpm --filter @viraha/arete test:pack
rtk pnpm --filter @viraha/arete eval:smoke
rtk pnpm --filter @viraha/arete eval:crisis
```

Expected: all commands PASS on Node 22. Playwright desktop and mobile screenshots show no overlap, blank content, or clipped controls.

- [ ] **Step 6: Update release checklist**

Add dated checkboxes for Node 22 Windows install, `arete doctor`, npm package smoke, desktop Playwright, and mobile Playwright. Do not mark real Provider or real channel checks complete in this plan.

- [ ] **Step 7: Commit**

```powershell
rtk git add playwright.config.ts tests/e2e apps/arete/tests/e2e apps/arete/scripts/pack-smoke.mjs apps/arete/package.json package.json pnpm-lock.yaml docs/release-checklist.md
rtk git commit -m "test(arete): gate Studio foundation release"
```

---

## Plan 1 Completion Gate

Plan 1 is complete only when:

- Node 22 Ubuntu and Windows CI are green.
- `npm install -g @viraha/arete` followed by `arete doctor` works from a packed artifact.
- `arete start` opens the Studio shell on loopback.
- Sessions persist in SQLite and remain user-scoped.
- Streaming chat works from the React UI.
- Desktop and mobile Playwright flows pass.
- Existing privacy, boundary, channel, smoke, and crisis tests remain green.
