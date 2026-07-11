# Viraha Code Wiki

> 本文档基于对 `d:\viraha` 仓库全部源码的逐文件分析生成,覆盖项目整体架构、模块职责、关键类与函数、依赖关系、数据流、运行方式等关键信息。
>
> - 包管理器:pnpm(工作区)
> - 语言:TypeScript(ESM,`module: ES2022`,`moduleResolution: bundler`)
> - 运行时:Node 24
> - 持久化:libSQL / SQLite(WAL 模式)+ Drizzle ORM
> - LLM 提供方:DeepSeek、Anthropic

---

## 目录

1. [项目概览](#1-项目概览)
2. [整体架构](#2-整体架构)
3. [仓库目录结构](#3-仓库目录结构)
4. [核心数据流(The Core Loop)](#4-核心数据流the-core-loop)
5. [模块详解](#5-模块详解)
   - 5.1 [`@viraha/core` 共享类型与工具](#51-virahacore-共享类型与工具)
   - 5.2 [`@viraha/db` 数据库层](#52-virahadb-数据库层)
   - 5.3 [`@viraha/provider` LLM 提供方抽象](#53-virahaprovider-llm-提供方抽象)
   - 5.4 [`@viraha/runtime` 运行时核心](#54-viraharuntime-运行时核心)
   - 5.5 [`@viraha/memory` 记忆引擎](#55-virahamemory-记忆引擎)
   - 5.6 [`@viraha/relationship` 关系引擎](#56-viraharelationship-关系引擎)
   - 5.7 [`@viraha/identity` 身份引擎](#57-virahaidentity-身份引擎)
   - 5.8 [`@viraha/persona` 人格引擎](#58-virahapersona-人格引擎)
   - 5.9 [`@viraha/embedding` 本地向量化](#59-virahaembedding-本地向量化)
   - 5.10 [`@viraha/channels` 跨平台通道中枢](#510-virahachannels-跨平台通道中枢)
   - 5.11 [`@viraha/context` 上下文组装](#511-virahacontext-上下文组装)
   - 5.12 [`@viraha/skills` 技能系统](#512-virahaskills-技能系统)
   - 5.13 [`@viraha/mcp` MCP 客户端](#513-virahamcp-mcp-客户端)
   - 5.14 [`@viraha/knowledge` 知识引擎](#514-virahaknowledge-知识引擎)
   - 5.15 [`@viraha/presence` 主动存在感](#515-virahapresence-主动存在感)
   - 5.16 [`@viraha/arete` 参考应用](#516-virahaarete-参考应用)
6. [依赖关系总览](#6-依赖关系总览)
7. [数据库 Schema](#7-数据库-schema)
8. [事件系统](#8-事件系统)
9. [项目运行方式](#9-项目运行方式)
10. [测试与 CI](#10-测试与-ci)
11. [附录:关键设计决策](#11-附录关键设计决策)

---

## 1. 项目概览

**Viraha** 是一个开源框架,用于构建能长期记忆、学习、随用户共同成长的数字伙伴(Digital Companion)。它不是通用 agent 框架,核心聚焦于**关系感知(Relationship-aware)**的伙伴,可在 Web 与社交平台(飞书、QQ)中持续运行。

**参考应用 Arete** 是一个健身伙伴(Fitness Companion),演示了框架的完整能力:身份、记忆、关系、知识、技能、Web UI 与可选的飞书/QQ 通道。

**核心特征**:
- **长期关系**:关系状态(trust/intimacy/level/XP)随交互演化,影响 companion 语气与行为
- **跨平台统一身份**:同一用户在 Web / 飞书 / QQ 共享同一份记忆与关系
- **反思式学习**:每轮对话后异步抽取 profile / facts / emotion 写入记忆库
- **分层上下文**:稳定 / 上下文 / 易变 / 临时 四层 prompt 组装,带 token 预算
- **混合检索**:关键字 + 向量(BGE 中文模型,本地推理)双路记忆与知识检索
- **可插拔**:Companion Pack 机制 + Skill 系统 + MCP 客户端

---

## 2. 整体架构

Viraha 采用**两层架构**:框架层(`packages/`)与应用层(`apps/`)。框架层不含任何领域代码(如 "fitness"),所有领域逻辑以 **Companion Pack** 形式在运行时加载。

### 2.1 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│                    应用层 apps/arete                         │
│   身份配置 / 5 个 Skill / training / nutrition / Web UI     │
└──────────────────────────┬──────────────────────────────────┘
                           │ 装配
┌──────────────────────────▼──────────────────────────────────┐
│                框架层 packages/ (零领域代码)                  │
│                                                              │
│  runtime ──► identity / skills / mcp / memory / relationship │
│     │        / reflection / companion / presence / context   │
│     │                                                        │
│     ├──► provider (DeepSeek / Anthropic)                     │
│     ├──► channels (ChannelHub / Feishu / QQ / Router)        │
│     ├──► embedding (本地 BGE) / knowledge (知识包)            │
│     └──► db (libSQL + Drizzle) / core (共享类型)             │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 系统上下文(Level 1)

```
[User] → [Channel Adapter] → [Viraha Agent Runtime] → [Channel Adapter] → [User]
                                    │
                    ┌───────────────┼───────────────────┐
                    │               │                   │
              [Memory Store]   [Knowledge]        [Skill Registry]
                    │               │                   │
              [SQLite/libSQL]  [Vector检索]       [MCP Servers / APIs]
```

### 2.3 关键架构规则

1. **`packages/` 零领域代码**:词语 "fitness" 不得出现在任何包中
2. **领域逻辑以 Companion Pack 加载**:运行时由 `loadLocalCompanionPack` 解析 `pack.json`
3. **依赖倒置(DIP)**:上层 runtime 依赖 `MemoryPort`/`CompanionPort`/`ContextPort` 接口,而非具体实现
4. **消息归一化**:所有入站消息归一为 `IncomingMessage`,出站归一为 `OutgoingMessage`
5. **跨平台身份单一事实源**:`ChannelRouter` 通过 `(platform, platformUserId) → userId` 映射统一身份

---

## 3. 仓库目录结构

```
viraha/
├── packages/                    # 框架层(零领域代码)
│   ├── core/                    # 共享类型与工具(零运行时依赖,仅 zod)
│   ├── db/                      # libSQL + Drizzle schema 与迁移
│   ├── provider/                # DeepSeek / Anthropic LLM 提供方
│   ├── runtime/                 # AgentPipeline / EventBus / 会话 / 调度 / 插件
│   ├── memory/                  # profile / store / ranker / reflection / compressor
│   ├── relationship/            # 关系状态 / XP / 等级 / 信任
│   ├── identity/                # 身份注册表(纯内存)
│   ├── persona/                 # 人格模板与蒸馏
│   ├── embedding/               # 本地 BGE 向量化(@xenova/transformers)
│   ├── channels/                # ChannelHub / Router / Feishu / QQ 适配器
│   ├── context/                 # 上下文组装 / token 预算 / collectors
│   ├── skills/                  # SkillManifest / Registry / Executor / Policy
│   ├── mcp/                     # MCP Manager(stdio / sse 传输)
│   ├── knowledge/               # 知识包加载与检索
│   └── presence/                # 主动消息引擎(条件评估 + cron 调度)
│
├── apps/
│   └── arete/                   # 参考健身伙伴应用
│       ├── src/
│       │   ├── index.ts         # 主入口:装配所有引擎
│       │   ├── identity.ts      # ARETE_IDENTITY 配置
│       │   ├── web.ts           # Hono Web 服务器 + SPA
│       │   ├── presence-scheduler.ts
│       │   ├── skills/          # 5 个 skill manifest + handler
│       │   ├── training/        # 训练域服务与工具
│       │   └── nutrition/       # 营养域服务与工具
│       ├── data/arete.db        # 应用数据库(WAL)
│       ├── evals/smoke.json     # 冒烟测试用例
│       └── scripts/run-evals.ts
│
├── knowledge-packs/
│   └── fitness-pack/            # 健身知识包(.md + .json + process.js)
│
├── docs/                        # 架构文档
│   ├── architecture/            # 11 篇架构审计与设计文档
│   ├── v2/                      # v2 自主 agent 路线图
│   └── superpowers/plans/       # 操作计划
│
├── data/                        # 运行时数据库(companion.db / arete.db)
├── .github/workflows/ci.yml     # GitHub Actions CI
├── package.json                 # 根 monorepo 脚本
├── pnpm-workspace.yaml          # 工作区声明
├── tsconfig.base.json           # 共享 TS 配置
└── vitest.config.ts             # 测试配置
```

---

## 4. 核心数据流(The Core Loop)

Viraha 的参考循环(`apps/arete/src/index.ts`):

```
消息入站
  -> ChannelHub 收到 IncomingMessage
  -> /bind <token>?  → 跨平台身份绑定
  -> ChannelRouter.resolveUserId(platform, platformUserId) → 内部 userId
  -> AgentWorkRunner.run(入队,同 lane 串行) → AgentPipeline.process
       1. 解析 userId(getOrCreateUser / ensureUser)
       2. 生成 correlationId 贯穿事件链
       3. 发 UserMessageReceived 事件
       4. buildToolDefinitions(合并 calculator + web_search + skills + plugins)
       5. buildMessages(身份 + 记忆 + 知识 + 关系增强 + history)
       6. 第一次 LLM 调用(带 tools,temperature 0.5)
       7. 若有 toolCalls:执行工具 → 结果回灌 → 第二次 LLM 产出最终回复
       8. 发 AgentResponseSent 事件
       9. 异步反思(ReflectionEngine.reflect)→ 更新 profile/facts/emotion
      10. 异步关系记录(CompanionEngine.onInteraction)→ recordInteraction + addXp(10)
  -> 返回 reply
  -> ChannelHub.reply → adapter.send → 平台
```

**异步分支**:
- `PresenceEngine`(每 2 小时 cron):评估条件 → 生成主动消息 → 按用户绑定平台广播

---

## 5. 模块详解

### 5.1 `@viraha/core` 共享类型与工具

**路径**:`packages/core` | **依赖**:仅 `zod`(零运行时依赖)

整个 monorepo 的类型契约与工具基础。源文件 4 个:

#### 5.1.1 `src/types.ts` — 共享类型契约(319 行)

按章节划分的核心类型:

| 类别 | 关键类型 | 行号 | 说明 |
|---|---|---|---|
| 消息 | `MessageRole`, `Message`, `ToolCall`, `ToolResult` | L4-28 | zod enum + 接口,既作 schema 又作类型 |
| 会话 | `SessionInfo` | L31-41 | 会话元数据 |
| Turn | `TurnInput`, `TurnResult` | L44-57 | 一次对话轮次的标准化输入/输出 |
| 用户画像 | `UserProfile` | L60-73 | age/身高体重/目标/装备/伤病/偏好 |
| 记忆 | `MemoryType`, `MemoryEntry`, `EmotionEntry`, `EmotionalProfile` | L76-102 | 4 类记忆 + 情绪剖面 |
| 关系 | `RelationshipState`, `InitiationPlan`, `MoodState` | L105-133 | 多维关系状态(score/trust/intimacy/level/XP) |
| 目标 | `Goal`, `Plan`, `PlanStep` | L136-160 | 目标与计划步骤 |
| 训练/营养 | `TrainingPlan`, `TrainingSession`, `FoodLog` | L184-226 | 健身领域类型 |
| 成就 | `Achievement`, `Milestone` | L229-243 | |
| 事件系统 | `EventType`(20 种), `EventEnvelope`, `EventHandler` | L259-295 | 事件总线标准信封 |
| **端口接口** | `MemoryPort`, `CompanionPort`, `ContextPort` | L298-319 | **DIP 核心**:runtime 依赖端口,非具体实现 |

**端口接口定义**(依赖倒置核心):

```typescript
interface MemoryPort {
  getProfileSummary(userId): Promise<string>
  getMemorySummary(userId): Promise<string>
  getProfile(userId): Promise<any>
  getOrCreateUser(externalId, channel, name): Promise<string>
  storeMemory(userId, type, key, content): Promise<string>
}

interface CompanionPort {
  getRelationshipState(userId): Promise<any>
  getRelationshipSummary(state): string  // 同步
  recordInteraction(userId): Promise<void>
  addXp(userId, amount): Promise<any>
}

interface ContextPort {
  assemble(userId, sessionId, input, ctx?): Promise<{
    tiers: { stable; context; volatile; ephemeral }
    systemPrompt: string
    tokenUsage: { total; bySource }
  }>
}
```

#### 5.1.2 `src/math.ts` — 表达式求值器

无依赖的四则运算 + 幂运算求值器,采用**调度场算法(Shunting Yard)+ 逆波兰表达式(RPN)求值**:

```typescript
export function evaluateMathExpression(expression: string): number  // L16-20
// 流程: tokenize → toReversePolish → evaluateReversePolish
```

- 支持运算符 `+ - * / ^`,幂运算右结合
- 除零检测、括号匹配检测、一元负号支持
- 被 `calculator` skill 与 `AgentPipeline` 内置 calculator 工具使用

#### 5.1.3 `src/channels.ts` — 通道适配器端口

从 `packages/channels` 提取到 core 的端口定义(使 core 不依赖 channels 包):

```typescript
interface InboundMessage { id; channel; userId; userName; content; images?; timestamp: Date }
interface OutboundMessage { target; content }
interface ChannelAdapter { readonly name; start(handler); stop() }
function runAdapter(config: ChannelAdapterConfig): Promise<void>  // L31-38,通用启动器
```

#### 5.1.4 `src/index.ts` 导出

`export * from "./types.js" | "./channels.js" | "./math.js"`

---

### 5.2 `@viraha/db` 数据库层

**路径**:`packages/db` | **依赖**:`@viraha/core`、`@libsql/client`、`drizzle-orm`

选型:libSQL(兼容 SQLite)+ Drizzle ORM,轻量、零原生依赖。

#### 5.2.1 `src/schema.ts` — Drizzle 表定义(254 行,18 张表)

| 表 | 行号 | 主键 | 用途 |
|---|---|---|---|
| `users` | L4-10 | `id` | 外部身份锚点(externalId + channel + name) |
| `profiles` | L13-27 | `userId` | 用户画像(age/身高体重/目标/装备/伤病/偏好) |
| `memoryEntries` | L30-39 | `id` | 记忆条目(type/key/content/metadata) |
| `sessions` | L42-52 | `id` | 会话(channel/messageCount/summary) |
| `messages` | L55-64 | `id` | 消息(role/content/toolCalls/tokens) |
| `relationships` | L67-81 | `userId` | 关系状态(对应 core.RelationshipState) |
| `moodHistory` | L84-92 | `id` | 情绪历史 |
| `achievements` | L95-100 | `id` | 成就解锁 |
| `milestones` | L103-110 | `id` | 里程碑 |
| `scheduledMessages` | L113-124 | `id` | Presence 计划消息 |
| `scheduledJobs` | L127-139 | `id` | **持久化任务队列** |
| `goals` | L142-153 | `id` | 目标 |
| `plans` | L156-164 | `id` | 计划步骤 |
| `diaryEntries` | L167-175 | `id` | 日记 |
| `events` | L178-187 | `id` | 领域事件(用户视角) |
| `trainingPlans` | L190-200 | `id` | 训练计划 |
| `trainingSessions` | L203-214 | `id` | 训练会话记录 |
| `foodLogs` | L217-228 | `id` | 饮食日志 |
| `eventStore` | L231-241 | `id` | **事件存储**(Event Sourcing,审计用) |
| `channelBindings` | L246-254 | `id` | **跨平台身份绑定** |

**约定**:时间戳存 ISO 字符串(`text`),布尔值用 `integer({ mode: "boolean" })`,JSON 字段以 `text` 存储。

#### 5.2.2 `src/client.ts` — 数据库客户端单例

```typescript
export function initDb(dbPath: string): void       // L8-19,初始化 + PRAGMA(WAL + foreign_keys)
export function getDb(): DrizzleDB                  // L21-24,获取 Drizzle 实例(未初始化抛错)
export function getSqliteClient(): LibSQLClient     // L26-29,获取底层 client(用于原生 SQL)
export function closeDb(): void                     // L31-37
```

#### 5.2.3 `src/migrate.ts` — 独立迁移脚本(267 行)

```typescript
export async function migrate(dbPath?: string): Promise<void>  // L249-263
```

- `SCHEMA_SQL`(L5-247):所有 `CREATE TABLE IF NOT EXISTS` 裸 SQL
- 额外包含:`scheduled_jobs` 查询索引、`messages_fts` FTS5 全文搜索虚拟表、`channel_bindings` 唯一约束
- 支持 CLI 直接执行:`tsx src/migrate.ts`

#### 5.2.4 `src/index.ts` 导出

`export * from "./client.js" | "./schema.js" | "./migrate.js"`

---

### 5.3 `@viraha/provider` LLM 提供方抽象

**路径**:`packages/provider` | **依赖**:`@viraha/core`、`zod`

#### 5.3.1 核心类型(`src/types.ts`)

```typescript
interface LLMProvider {
  name: string
  chat(params: ChatParams): Promise<ChatResponse>
  chatStream(params: ChatParams): AsyncIterable<ChatChunk>
  embed?(texts: string[]): Promise<EmbeddingResult[]>
}
interface ToolDefinition { name; description; inputSchema }
interface ChatParams { model; messages; temperature?; maxTokens?; tools? }
interface ChatResponse { content; toolCalls?; finishReason; usage }
```

#### 5.3.2 `ProviderRegistry`(`src/registry.ts`) — 熔断器 + 回退

```typescript
class ProviderRegistry {
  register(providerName, provider, models: string[], priority = 100): void
  resolve(model): LLMProvider                         // 跳过 circuit-broken
  async chatWithFallback(model, params): Promise<ChatResponse>  // 核心容错
  recordFailure(model, providerName?)
  getHealth(): Array<{ provider, model, healthy, failures }>
  listModels(): ModelInfo[]
  hasModel(model): boolean
}
```

**熔断器机制**:
- 同一 model 可注册到多个 provider(按 priority 排序,priority 越小越优先)
- 连续失败 3 次开熔断 60 秒
- 熔断期间跳过该 provider,超过 reset 时间后半开重试
- 全部失败抛聚合错误

#### 5.3.3 `DeepSeekProvider`(`src/deepseek.ts`)

- OpenAI 兼容格式,`baseUrl: https://api.deepseek.com/v1`
- `chat`:POST `/chat/completions`,tools 映射为 `{ type: "function", function: {...} }`
- `chatStream`:SSE 流式,按行解析 `data: `,`[DONE]` 结束
- `embed`:**抛错**(DeepSeek 无 embedding API)

#### 5.3.4 `AnthropicProvider`(`src/anthropic.ts`)

- `baseUrl: https://api.anthropic.com/v1`
- **system 消息抽到顶层** `body.system`(不放 messages 数组)
- headers:`x-api-key` + `anthropic-version: 2023-06-01`
- tools 用 `input_schema` 而非 `parameters`
- 响应 content 是数组,需 filter `type === "text"` / `"tool_use"`
- `embed`:**抛错**(不支持)

#### 5.3.5 `src/index.ts` 导出

`export * from "./types.js" | "./registry.js" | "./anthropic.js" | "./deepseek.js"`

---

### 5.4 `@viraha/runtime` 运行时核心

**路径**:`packages/runtime` | **内部依赖**:core/db/provider/memory/relationship/identity/skills/mcp | **外部**:`drizzle-orm`、`zod`

包内最重要的"装配车间",把 LLM、工具、技能、记忆、关系、反思、身份、事件、会话、调度、插件、队列组装成可执行的 Agent Pipeline。

**注意**:包内存在**两套并存的运行时**:
- `AgentPipeline`(pipeline.ts):更"重",集成 identity/skills/mcp/reflection/companion/stream,Arete 实际使用
- `Runtime`(runtime.ts):基于 Ports 抽象,工具循环最多 5 轮,无 reflection/stream

#### 5.4.1 `AgentPipeline`(`src/pipeline.ts`,410 行)— 核心主循环

**配置接口**:

```typescript
interface AgentConfig {
  identity: IdentityConfig
  model: string
  llm: LLMProvider
  memory?: AgentMemory       // 窄化接口:getOrCreateUser/ensureUser/buildMemoryContext
  reflection?: AgentReflection  // reflect(userId, userMsg, reply, llm, model)
  companion?: AgentCompanion    // enrichPrompt + onInteraction
  events?: EventBus
  plugins?: PluginRegistry
  toolPolicy?: ToolPolicy
}

interface AgentInput {
  message: string
  userId?: string
  userIdKind?: "external" | "internal"
  channel?: string
  history?: Array<{ role; content }>
  search?: (query) => Promise<string>
  knowledge?: (query) => Promise<string>
}
```

**类成员**:

```typescript
class AgentPipeline {
  constructor(config: AgentConfig)  // 构造时 new IdentityEngine/SkillRegistry/SkillExecutor/MCPManager
  registerSkill(manifest, handler): void
  get skillsRegistry(): SkillRegistry
  get mcpManager(): MCPManager
  get identityEngine(): IdentityEngine
  async process(input: AgentInput): Promise<AgentOutput>      // 主流程
  async *processStream(input): AsyncGenerator<StreamEvent>     // 流式版本
}
```

**`process()` 主流程**(L90-167):

1. **解析 userId**:`resolveUserId`(internal 走 ensureUser,external 走 getOrCreateUser)
2. **生成 correlationId**(`crypto.randomUUID()`)贯穿事件链
3. **发 `UserMessageReceived` 事件**
4. **`buildToolDefinitions()`**:合并 calculator + web_search + skills(前缀 `skill_`)+ plugins,重名抛错
5. **`buildMessages()`**:身份系统消息 + `memory.buildMemoryContext`(失败静默)+ `knowledge`(失败静默)+ `companion.enrichPrompt`(失败静默)+ history 截断最近 10 条
6. **第一次 LLM 调用**:`temperature: 0.5`,`maxTokens: 2000`,累加 input+output tokens
7. **工具调用分支**:有 toolCalls → 发 `ToolCalled` → 逐个 `executeTool`(经 ToolPolicy 决策)→ 结果回灌 → 发 `AgentThinking(phase:"llm_final")` → 第二次 LLM;无则直接用第一次结果
8. **发 `AgentResponseSent` 事件**
9. **异步反思**(`reflectAfterTurn`,fire-and-forget):成功发 `ReflectionCompleted`,失败发 `ErrorOccurred(phase:"reflection")`
10. **异步关系记录**(`recordCompanionInteraction`,fire-and-forget):成功发 `RelationshipChanged(reason:"turn_completed")`
11. 返回 `{ reply, tokensUsed }`

**`executeTool()`**(L304-338):
1. `toolPolicy.decide(...)`(默认 allowAll),拒绝发 `ToolFailed` 返回拒绝原因
2. calculator → `evaluateMathExpression`(@viraha/core)
3. web_search → `input.search`
4. plugins → `plugins.resolveToolHandler(name)(args, userId)`
5. 兜底 → `skillExecutor.run(skillName, args, { userId, memory })`

#### 5.4.2 `EventBus`(`src/event-bus.ts`)

```typescript
class EventBus {
  useStore(store: EventStore, persistTypes?: string[]): void
  on(event, handler): () => void          // 返回 unsubscribe
  async emit(event: EventEnvelope): Promise<void>  // 并发触发,错误隔离
  getHistory(filter?): TimedEvent[]
  getMetrics(): { total; byType; recent }
}
```

- `emit`:记 history → 若挂载 store 且命中 filter 则持久化 → `Promise.all` 并发触发 handler,单个抛错只 `console.error`
- 默认 `persistTypes` 为空 = 全持久化

#### 5.4.3 `EventStore`(`src/event-store.ts`)

```typescript
class EventStore {
  async persist(event: EventEnvelope): Promise<void>  // 写 eventStore 表
  async query(filter?): Promise<EventEnvelope[]>       // 按 type/userId/sessionId/correlationId 过滤
}
```

#### 5.4.4 `AgentWorkRunner`(`src/work-runner.ts`)

```typescript
class AgentWorkRunner {
  constructor(config: { concurrency = 4 })
  run<T>(input: WorkInput, handler: () => Promise<T>): Promise<T>          // mode="steer"
  interrupt<T>(input: WorkInput, handler: () => Promise<T>): Promise<T>    // mode="interrupt"
}
```

基于 `TurnQueue`,laneKey = `${channel}:${userId}`,同 lane 串行。`interrupt` 清空该 lane 已排队项并插队到队首。

#### 5.4.5 `DurableScheduler`(`src/scheduler.ts`,140 行)

基于 SQLite 的持久化任务调度器,使用原生 SQL(不走 drizzle):

```typescript
class DurableScheduler {
  constructor(leaseMs = 60_000)
  async enqueue(input: EnqueueJobInput): Promise<string>
  async claim(limit?, now?, type?): Promise<DurableJob[]>    // 原子 UPDATE...RETURNING 抢占
  async complete(id, completedAt?): Promise<void>
  async fail(id, error, retryAt?): Promise<void>             // 有 retryAt 回 queued
  async runDue(handler, limit?, now?, type?): Promise<{ completed; failed }>
}
```

**`claim` 关键**:先回收过期租约(`status='running' AND locked_at < now-leaseMs`)→ 循环 `UPDATE ... SET status='running', attempts=attempts+1 WHERE id=(SELECT id ... LIMIT 1) RETURNING *`,SQLite `RETURNING` 保证原子性。

#### 5.4.6 `PluginRegistry` + `CompanionPack`(`src/plugins.ts`)

```typescript
interface CompanionPack {
  name; version; description
  tools?: ToolDefinition[]
  toolHandler?: (toolName, args, userId) => Promise<{ content; isError? }>
  knowledgePacks?: Record<string, string>
  personas?: Array<{ id; name; systemPrompt: string[] }>
}

class PluginRegistry {
  registerPack(pack: CompanionPack): void   // 重名工具抛错
  get tools(): ToolDefinition[]
  get packs(): CompanionPack[]
  resolveToolHandler(name): handler | undefined
  getHandler(): ToolHandler | undefined     // 聚合 handler,供 runtime.ts
}
```

#### 5.4.7 `loadLocalCompanionPack`(`src/plugin-loader.ts`)

```typescript
export async function loadLocalCompanionPack(dir: string): Promise<CompanionPack>
```

读取 `dir/pack.json`,用 zod schema 校验(name/version/description 必填),返回结构化 `CompanionPack`。**不注册到 PluginRegistry**,由调用方决定。

#### 5.4.8 `SessionManager`(`src/session.ts`)

```typescript
class SessionManager {
  async getOrCreateSession(userId, channel): Promise<{ id; isNew }>
  async getSessionMessages(sessionId, limit = 50): Promise<Array<{ role; content }>>
  async storeMessage(sessionId, role, content, opts?): Promise<void>
  async endSession(sessionId): Promise<void>
}
```

#### 5.4.9 其他组件

| 组件 | 文件 | 职责 |
|---|---|---|
| `ContextAssembler` + `PromptTier` | context.ts | 四层 prompt 组装(stable/context/volatile/ephemeral) |
| `ModelRouter` | model-router.ts | 按 tier(reasoning/generation/reflection/fast)路由模型,默认 reasoning=deepseek-reasoner |
| `ToolPolicy` | tool-policy.ts | 策略模式,`allowAllToolPolicy`(默认)/ `denyToolPolicy(reason)` |
| `TurnQueue` | queue.ts | 分 lane + 全局并发的有界队列,interrupt 清空 lane |
| `createMemoryPort/createCompanionPort/createContextPort` | ports.ts | 把 memory/relationship 引擎适配为 core 的 Port 接口 |
| `Runtime` | runtime.ts | 基于 Ports 的另一套 turn 循环(工具循环最多 5 轮) |

#### 5.4.10 `src/index.ts` 导出(14 个 re-export)

EventBus, EventStore, ModelRouter, SessionManager, TurnQueue, AgentWorkRunner, ContextAssembler, Runtime, Ports 工厂, PluginRegistry, AgentPipeline, ToolPolicy, loadLocalCompanionPack, DurableScheduler。

---

### 5.5 `@viraha/memory` 记忆引擎

**路径**:`packages/memory` | **依赖**:core/db/provider/embedding + drizzle-orm/zod

#### 5.5.1 `MemoryEngine`(`src/engine.ts`)— 聚合门面

```typescript
class MemoryEngine {
  public profile = new ProfileManager()
  public store = new MemoryStore()
  public ranker = new MemoryRanker(this.store)

  async getProfileSummary(userId): Promise<string>
  async getMemorySummary(userId, query?, limit?): Promise<string>
  async buildMemoryContext(userId, query?): Promise<string>  // USER PROFILE + RELEVANT MEMORIES(top 15)
}
```

#### 5.5.2 `SessionCompressor`(`src/compressor.ts`)

```typescript
class SessionCompressor {
  async compressSession(sessionId, llm, model): Promise<void>
  async shouldCompress(sessionId, threshold = 50): Promise<boolean>
}
```

四阶段:< 30 条跳过 → Prune(超 200 字符截断)→ Boundaries(head 4 / tail 20 / middle)→ Summary(LLM 生成 Key Facts/User State/Decisions/Plans/Topics)→ Store 写 `sessions.summary`。

常量:`PRUNE_THRESHOLD=200`、`PROTECT_HEAD=4`、`PROTECT_TAIL=20`。

#### 5.5.3 `ReflectionEngine`(`src/reflection.ts`,178 行)

```typescript
interface ExtractionResult {
  profile: { age?; heightCm?; weightKg?; goal?; experience?; equipment?; injuries?; availableMinutes? }
  facts: Array<{ key; content }>
  emotion: { mood; intensity; context }
}

class ReflectionEngine {
  constructor(profile: ProfileManager, store: MemoryStore)
  async reflect(userId, userMessage, assistantReply, llm, model): Promise<void>
}
```

- `EXTRACTION_PROMPT`:要求 LLM 只抽取显式信息,返回 JSON(profile/facts/emotion)
- `extract`:`temperature: 0.1`(低温求稳定),正则 `\{[\s\S]*\}` 抠 JSON,zod 校验
- 分段应用(profile/facts/emotion),每段独立 try/catch,单段失败不影响其他
- facts 以 type `"long_term"` 存入 store;emotion 以 type `"emotional"`、key `mood_${Date.now()}` 存

#### 5.5.4 `ProfileManager`(`src/profile.ts`)

```typescript
class ProfileManager {
  async getOrCreateUser(externalId, channel, name): Promise<string>
  async ensureUser(userId, externalId, channel, name): Promise<string>
  async getProfile(userId): Promise<UserProfile>
  async updateProfile(userId, data): Promise<void>  // 数组字段 JSON.stringify,自动写 lastUpdated
}
```

#### 5.5.5 `MemoryRanker`(`src/ranking.ts`,130 行)— 混合检索

```typescript
class MemoryRanker {
  constructor(store: MemoryStore)
  setEmbedProvider(provider: EmbedProvider): void
  async getTopMemories(userId, query?, limit = 15): Promise<ScoredMemory[]>
  recordAccess(entryId): void
  async getMemoryContext(userId, query?, limit?): Promise<string>
}
```

**打分公式**(`getTopMemories`):
```
score = importance * 0.35
      + min(accessed/10, 1) * 0.1
      + recency * 0.15
      + combinedQuery * 0.4

combinedQuery = queryScore * 0.6 + vectorScore * 0.4
recency = exp(-ageDays / 30)  // 30 天半衰期
```

- 无 embedProvider 时退化为纯关键字
- entry embedding 缓存于 `embedCache: Map<id, number[]>`,截前 1000 字符
- `cosineSimilarity`:标准余弦,长度不一致取 `min`,零模回 0

#### 5.5.6 `MemoryStore`(`src/storage.ts`)

```typescript
class MemoryStore {
  async storeEntry(userId, type, key, content, metadata?): Promise<string>  // upsert
  async getEntries(userId, type?): Promise<MemoryEntry[]>
  async deleteEntry(userId, type, key): Promise<void>
  async searchMessages(userId, query, limit = 10): Promise<...>  // like %query%
  async getSessionSummaries(userId, limit = 20): Promise<...>
}
```

#### 5.5.7 `src/index.ts` 导出

ProfileManager, MemoryStore, MemoryEngine, ReflectionEngine + ExtractionResult, SessionCompressor, MemoryRanker。

---

### 5.6 `@viraha/relationship` 关系引擎

**路径**:`packages/relationship` | **依赖**:core/db + drizzle-orm

#### 5.6.1 `CompanionEngine`(`src/engine.ts`)— 门面

```typescript
class CompanionEngine {
  public relationship = new RelationshipManager()
  async enrichPrompt(userId, basePrompt): Promise<string>  // 注入关系状态到 prompt
  async onInteraction(userId): Promise<void>               // recordInteraction + addXp(10)
}
```

**`enrichPrompt`**:
1. `getOrCreate(userId)` 取关系状态
2. 生成 `Relationship/Trust/Level(Title)/XP` 摘要
3. 追加 `## Relationship State` 段 + 语气适配指令(Level 1 礼貌专业,随等级升高变温暖)
4. **明确禁止**直接提及 XP/等级/游戏机制

#### 5.6.2 `RelationshipManager`(`src/relationship.ts`,139 行)

```typescript
class RelationshipManager {
  async getOrCreate(userId): Promise<RelationshipState>
  async recordInteraction(userId)  // score +1-decay, trust +0.5(上限100)
  async addXp(userId, amount): Promise<{ leveledUp; newLevel }>  // 升级后 xpToNext *= 1.3
  async adjustTrust(userId, delta)  // 双向 clamp [0,100]
  getTitle(level): string  // 1=Acquaintance, 2=Training Partner, 3-4=Coach, 5-6=Mentor, 7-8=Trusted Companion, 9+=Lifetime Partner
  getRelationshipSummary(state): string
}
```

**衰减计算** `calculateDecay`:
- 24 小时内无衰减
- `baseDecay = decayRate * daysSince`
- `attachmentBuff = attachment/100 * 0.5`(attachment 越高衰减越缓)
- 最终 `max(0, min(5, baseDecay * (1 - attachmentBuff)))`,每日上限 5

**缓存策略**:写后失效,所有写操作完成后 `cache.delete(userId)`,下次读强制刷新。

#### 5.6.3 `src/index.ts` 导出

`RelationshipManager`, `CompanionEngine`。

---

### 5.7 `@viraha/identity` 身份引擎

**路径**:`packages/identity`(版本 0.2.0)| **依赖**:仅 core(纯内存,无持久化)

#### 5.7.1 类型(`src/types.ts`,94 行)

```typescript
interface IdentityConfig {
  agentId; name; description; type: "companion"|"assistant"|"coach"|"agent"; version
  capabilities?: Capability[]
  skills?: string[]
  mcpServers?: string[]
  longTermGoal?; coreValues?: string[]; boundaries?: IdentityBoundary[]
  personaId: string          // 必填
  persona: PersonaSnapshot   // 必填
  limits?: Partial<IdentityLimits>
}

class IdentityObject {
  // 大部分字段 readonly,仅 personaId/persona 可变
  setPersona(personaId, snapshot: PersonaSnapshot): void  // 支持热替换
}
```

**默认 limits**:`maxPlanSteps: 10`、`maxTokensPerTurn: 8000`、`maxSkillCallsPerTurn: 20`

#### 5.7.2 `IdentityEngine`(`src/engine.ts`,32 行)

```typescript
class IdentityEngine {
  register(config: IdentityConfig): IdentityObject  // 幂等,已存在直接返回既有实例
  get(agentId): IdentityObject | undefined
  getOrThrow(agentId): IdentityObject  // 缺失抛错
  list(): IdentityObject[]
  remove(agentId): void
}
```

纯内存 Map,进程重启即丢失。适合作为应用启动时装配的运行时身份目录。

#### 5.7.3 `src/index.ts` 导出

`Capability, IdentityBoundary, PersonaSnapshot, IdentityLimits, IdentityConfig, IdentityObject`(types) + `IdentityEngine`(engine)。

---

### 5.8 `@viraha/persona` 人格引擎

**路径**:`packages/persona` | **依赖**:仅 core

#### 5.8.1 `PersonaEngine`(`src/engine.ts`,139 行)

```typescript
interface PersonaDef {
  id; name; description
  systemPrompt: string[]
  source?: "builtin" | "custom" | "distilled"
}

class PersonaEngine {
  constructor()  // 调用 registerDefaults 注册 4 个内置人格
  createFromDescription(description): PersonaDef  // id: custom_${nextId++}
  async distill(sourceText, llm?): Promise<PersonaDef>
  register(persona): void
  get(id): PersonaDef          // 未知 id 回退到 "coach",永不抛错
  list(): PersonaDef[]
  getSystemPrompt(id): string[]
}
```

**4 个内置人格**(`registerDefaults`):

| id | name | 风格 |
|---|---|---|
| `coach` | Coach | 冷静、数据驱动、科学训练 |
| `brother` | Brother | 老哥式:直白、激励、tough love |
| `gentle` | Gentle | 温柔耐心,适合新手/低谷日 |
| `anime` | Anime Training Partner | 少年漫热血训练伙伴 |

**蒸馏** `distill`:
- 无 llm:按 `[。！!\n]` 分句,过滤长度 ≤10,取前 10 句(截 2000 字符)
- 有 llm:prompt 抽取 personality/communication/catchphrases/values,输出 "You..." 句式

#### 5.8.2 `src/index.ts` 导出

`PersonaEngine`, `PersonaDef`。

---

### 5.9 `@viraha/embedding` 本地向量化

**路径**:`packages/embedding` | **依赖**:`@viraha/provider`(类型) + `@xenova/transformers`

#### 5.9.1 实现(`src/index.ts`,41 行单文件包)

```typescript
const MODEL_ID = "Xenova/bge-small-zh-v1.5"  // BAAI bge-small 中文版 v1.5,512 维

interface EmbedProvider {
  name: string
  embed(texts: string[]): Promise<EmbeddingResult[]>
}

class LocalEmbedProvider implements EmbedProvider {
  readonly name = "bge-small-zh"
  async embed(texts: string[]): Promise<EmbeddingResult[]>
}
```

**关键特性**:
- **模型**:`Xenova/bge-small-zh-v1.5`,中文优化,512 维
- **引擎**:`@xenova/transformers`(Transformers.js),纯 JS/WASM 本地推理,**无需 Python、无需 API Key、无需 GPU**
- **任务**:`feature-extraction`
- **单例懒加载**:`extractorPromise` 模块级单例,首次调用触发下载,后续复用 Promise
- **pooling: "mean"** + **normalize: true**(L2 归一化,下游余弦可简化为点积)
- **串行处理**:`for...of` + `await`,逐条推理(非批量并行,内存友好)
- 每条结果携带 `model: MODEL_ID`,便于多 provider 混用溯源

被 `MemoryRanker.setEmbedProvider` 与 `KnowledgeEngine.search` 注入使用。

---

### 5.10 `@viraha/channels` 跨平台通道中枢

**路径**:`packages/channels`(版本 0.1.0)| **依赖**:core/db + drizzle-orm

#### 5.10.1 核心类型(`src/types.ts`)

```typescript
interface IncomingMessage { platform; platformUserId; text; raw?; platformChatId?; timestamp? }
interface OutgoingMessage { platformUserId; text; platformChatId? }
type MessageHandler = (msg: IncomingMessage) => Promise<void>
interface ChannelAdapter {
  readonly platform: string
  start(): Promise<void>; stop(): Promise<void>
  onMessage(handler): void
  send(message: OutgoingMessage): Promise<boolean>
  readonly isRunning: boolean
}
type ChannelAdapterFactory = () => ChannelAdapter | null  // 未配置 env 返回 null
```

#### 5.10.2 `BaseAdapter`(`src/base.ts`)— 抽象基类

```typescript
abstract class BaseAdapter implements ChannelAdapter {
  async start(): Promise<void>   // 幂等,委托 doStart
  async stop(): Promise<void>    // 幂等,委托 doStop
  onMessage(handler): void
  protected async emit(msg): Promise<void>  // fan-out 到所有 handler,错误隔离
  protected abstract doStart()
  protected abstract doStop()
  abstract send(message): Promise<boolean>
}
```

子类只需实现 `doStart/doStop/send`,收到平台消息时调 `emit()`。

#### 5.10.3 `ChannelHub`(`src/hub.ts`)— 中枢

```typescript
class ChannelHub {
  readonly router = new ChannelRouter()
  register(platform, factory: ChannelAdapterFactory): void
  onMessage(handler: MessageHandler): void
  get activePlatforms(): string[]
  discover(): string[]              // 工厂返回非 null 才构造,给 adapter 注册转发器
  async startAll(): Promise<string[]>   // discover + start,错误隔离
  async stopAll(): Promise<void>
  async reply(platform, platformUserId, text, platformChatId?): Promise<boolean>
  async broadcast(platformUserId, text): Promise<string[]>  // 跨平台广播
}
```

**职责**:工厂模式注册 adapter,未配置 env 自动跳过;入站:adapter → IncomingMessage → `dispatch()` → handler(pipeline);出站:companion 调 `reply()` → adapter.send。`dispatch()` 中调 `router.touch()` 更新最后活跃时间。

#### 5.10.4 `ChannelRouter`(`src/router.ts`)— 跨平台身份单一事实源

```typescript
const TOKEN_TTL_MS = 5 * 60 * 1000  // 5 分钟
const TOKEN_LENGTH = 6

class ChannelRouter {
  async resolveUserId(platform, platformUserId, name?): Promise<string>  // 查/建内部 userId
  async lookupBinding(platform, platformUserId): Promise<{ userId; displayName } | null>
  async linkPlatform(targetUserId, platform, platformUserId): Promise<void>  // 合并身份核心
  async listBindingsByUser(userId): Promise<Array<...>>
  async touch(platform, platformUserId): Promise<void>  // 更新 lastSeenAt
  async listByPlatform(platform): Promise<Array<...>>
  async listActiveUsers(limit = 20): Promise<Array<{ userId; lastSeenAt }>>
  createLinkToken(userId): string   // 6 位短 token,字符集避开 0/O/1/I/L
  async consumeLinkToken(token, platform, platformUserId): Promise<string | null>  // 一次性
}
```

**跨平台身份合并典型流程**:
1. web 聊 → `resolveUserId("web", cookie)` → userId=U1
2. web 点"绑定飞书" → `createLinkToken(U1)` → token=T
3. 飞书发 `/bind T` → `consumeLinkToken(T, "feishu", open_id)` → `linkPlatform(U1, "feishu", open_id)`
4. 之后飞书来 → `lookupBinding` 返回 U1(共享同一份记忆/关系)

**`linkPlatform`**:先删除该 `(platform, platformUserId)` 的旧 binding,再插入指向 `targetUserId` 的新 binding。

**`consumeLinkToken`**:大写化 → 查 `pendingLinks` → 立即删除(一次性)→ 调 `linkPlatform` → 返回合并后的 userId。失败返回 null。

#### 5.10.5 `FeishuAdapter`(`src/adapters/feishu.ts`)

```typescript
class FeishuAdapter extends BaseAdapter {
  readonly platform = "feishu"
  static fromEnv(): FeishuAdapter | null  // 读 FEISHU_APP_ID/APP_SECRET/ENCRYPT_KEY/VERIFICATION_TOKEN/WEBHOOK_PORT
  protected async doStart(): Promise<void>  // 起 http server 监听 /webhook/feishu
  async send(message): Promise<boolean>     // POST /im/v1/messages
}
```

**关键实现**:
- 签名验证:`sha256(timestamp + nonce + encryptKey + body)` 对比 `x-lark-signature`
- URL 验证:飞书 challenge 原样回传
- token 校验:对比 `payload.header.token` 与 `verificationToken`
- 3 秒响应要求:立即回 200,异步处理事件
- 仅处理文本消息
- token 缓存:过期前 60 秒刷新

#### 5.10.6 `QQAdapter`(`src/adapters/qq.ts`)

```typescript
class QQAdapter extends BaseAdapter {
  readonly platform = "qq"
  static fromEnv(): QQAdapter | null  // 读 QQ_BOT_APPID/QQ_BOT_TOKEN
  async send(message): Promise<boolean>  // POST /v2/groups/{groupOpenId}/messages
  protected async doStart(): Promise<void>  // no-op,单向模式
}
```

**现状**:单向通道,仅支持 webhook 推送(companion → QQ 群),不支持接收用户消息。

#### 5.10.7 `src/index.ts` 导出

`types, base, hub, router, adapters/feishu, adapters/qq`(全量 re-export)。

---

### 5.11 `@viraha/context` 上下文组装

**路径**:`packages/context`(版本 0.1.0)| **依赖**:core/db/knowledge/provider/embedding

#### 5.11.1 Token 预算(`src/token-budget.ts`)

```typescript
export function estimateTokens(text: string): number  // Math.ceil(text.length / 3.5),约 3.5 字符/token
export function createBudget(maxTokens, percentages): TokenBudget
export function enforceBudget(content, maxTokens, tolerance = 0.1): { trimmed; tokens; truncated }
```

**裁剪策略**:容忍 10% 超额不裁剪;超额时保留开头 60% + 结尾 30%,中间替换为 `\n...[truncated]...\n`。

#### 5.11.2 `ContextBuilder`(`src/builder.ts`)

```typescript
const DEFAULT_CONFIG: ContextBuilderConfig = {
  maxTokens: 24000,
  budget: { systemPrompt: 15, profile: 5, memories: 20, knowledge: 10, relationship: 5, workflow: 5, history: 40 }
}

class ContextBuilder {
  addCollector(collector: ContextCollector): void  // 按 priority 降序排
  async assemble(userId, sessionId, input): Promise<{
    tiers: { stable; context; volatile; ephemeral }
    systemPrompt: string
    tokenUsage: { total; bySource }
  }>
  invalidateCache(userId): void  // 60s TTL 缓存
}
```

**组装流程**:
1. 创建预算
2. 遍历 collectors(按 priority 降序),带 60s 缓存
3. 按 collector name 映射到 4 层:
   - `stable`: system_prompt, persona
   - `context`: profile, relationship, workflow
   - `volatile`: memories, knowledge
   - `ephemeral`: history
4. 超预算时先裁 volatile,再裁 ephemeral
5. `systemPrompt = stable + context + volatile`(不含 ephemeral/history)

#### 5.11.3 内置 Collectors(`src/collectors.ts`)

```typescript
export function createKnowledgeCollector(knowledge, embed?, packName?): ContextCollector  // priority 40
export function createMemoryCollector(): ContextCollector  // 当前为 stub,返回空
```

#### 5.11.4 `src/index.ts` 导出

`ContextBuilder, estimateTokens, enforceBudget, createBudget, createKnowledgeCollector, createMemoryCollector` + 类型。

---

### 5.12 `@viraha/skills` 技能系统

**路径**:`packages/skills`(版本 0.2.0)| **依赖**:core/provider

#### 5.12.1 类型(`src/types.ts`)

```typescript
type IntentType = "query"|"command"|"plan"|"analyze"|"social"|"reflect"|"schedule"|"learn"|"greeting"|"unknown"

interface SkillManifest {
  id; name; version; description
  triggers: { intentTypes: IntentType[]; keywords: string[]; entities: string[] }
  capabilities: { input; output; examples: Array<{ query; response }> }
  dependencies: { skills?; mcp? }
  limits: { maxInputLength?; maxRuntime?; needsUserConfirmation? }
}

type SkillHandler = (input: Record<string, unknown>, context: SkillContext) => Promise<SkillResult>
interface SkillContext { userId?; sessionId?; llm?; model?; memory?; search? }
interface SkillResult { content; data?; isError? }
```

#### 5.12.2 `SkillRegistry`(`src/registry.ts`)

```typescript
class SkillRegistry {
  register(manifest, handler): Skill
  get(id): Skill | undefined
  findRelevant(intentType, message, entities): Skill[]  // 三选一短路:intentType/keyword/entities
  list(): Skill[]
  remove(id): boolean
}
```

#### 5.12.3 `SkillExecutor`(`src/executor.ts`)

```typescript
class SkillExecutor {
  constructor(registry: SkillRegistry)
  async run(skillId, input, context): Promise<SkillResult>          // maxRuntime 次重试
  async runParallel(skills: Array<{ id; input }>, context): Promise<Map<string, SkillResult>>
}
```

注意:`maxRuntime` 同时用作重试次数。

#### 5.12.4 `ToolPolicy`(`src/policy.ts`)

```typescript
type ChannelType = "cli"|"web"|"qq"|"feishu"|"wechat"|"telegram"|"discord"|"sdk"
type RoleLevel = "user"|"admin"|"owner"

class ToolPolicy {
  setPermission(skillId, perm: Partial<ToolPermission>): void
  check(skillId, channel, role = "user"): { allowed; reason? }  // 三层:channel/role/rateLimit
  getPermissions(): ToolPermission[]
}
```

**注意**:`@viraha/skills` 的 `ToolPolicy` 与 `@viraha/runtime` 的 `ToolPolicy` 是**两个不同接口**(skills 版基于 channel/role/rateLimit,runtime 版基于 decide 方法)。

---

### 5.13 `@viraha/mcp` MCP 客户端

**路径**:`packages/mcp`(版本 0.2.0)| **依赖**:仅 core(无外部运行时依赖,用 Node 内置)

#### 5.13.1 `MCPManager`(`src/manager.ts`)

```typescript
class MCPManager {
  async register(config: MCPServerConfig): Promise<void>  // stdio 或 sse
  async call(serverId, tool, args): Promise<MCPCallResult>  // 断线自动重连
  findRelevant(input: string): Array<{ serverId; tool }>    // 朴素关键词匹配
  listTools(): Array<{ serverId; tools }>
  async disconnectAll(): Promise<void>
}
```

**`register`**:`transport === "sse"` → `MCPSSETransport`,否则 → `MCPStdioTransport`(ws 未实现)。连接成功后立即 `listTools()` 缓存。

#### 5.13.2 `MCPStdioTransport`(`src/transports.ts`)

```typescript
class MCPStdioTransport extends EventEmitter {
  async start(command, args = [], env = {}): Promise<void>  // spawn + initialize
  async listTools(): Promise<MCPToolDefinition[]>
  async callTool(name, args): Promise<MCPCallResult>
  async close(): Promise<void>
  isConnected(): boolean
}
```

- spawn 子进程,stdin/stdout 通信
- initialize 协议版本 `"2025-03-26"`,clientInfo `{ name: "viraha", version: "2.0.0" }`
- 每请求 30 秒超时
- 进程退出时 reject 所有 pending 请求

#### 5.13.3 `MCPSSETransport`(`src/sse-transport.ts`)

```typescript
class MCPSSETransport extends EventEmitter {
  constructor(url: string)
  async start(): Promise<void>      // GET 建立 SSE + initialize
  async listTools(): Promise<MCPToolDefinition[]>
  async callTool(name, args): Promise<MCPCallResult>
  async close(): Promise<void>      // abortController.abort()
}
```

- GET 建立 SSE 长连接,从 `x-session-url` header 或 URL 末段解析 sessionId
- 请求通过 POST 发到 `${url}/${sessionId}`
- 响应通过 SSE `data:` 事件流返回

**注意**:在 `AgentPipeline` 中 `MCPManager` 被实例化但**主流程未调用其方法**,作为外部扩展钩子(通过 `get mcpManager()` 暴露)。

---

### 5.14 `@viraha/knowledge` 知识引擎

**路径**:`packages/knowledge` | **依赖**:core/db/provider/embedding

#### 5.14.1 `KnowledgeLoader`(`src/loader.ts`)

```typescript
interface KnowledgeChunk { packName; sourceFile; heading; content; keywords }

class KnowledgeLoader {
  loadPack(packPath, packName): KnowledgeChunk[]   // 只读 .md,按 # 标题切 chunk
  getChunks(packName): KnowledgeChunk[]
  listPacks(): string[]
}
```

每 chunk 提取最多 50 个关键词(长度 > 3 的去重词)。

#### 5.14.2 `KnowledgeEngine`(`src/engine.ts`)

```typescript
interface KnowledgeQuery { query; packName?; maxResults? }

class KnowledgeEngine {
  loadPack(packPath, packName)
  listPacks(): string[]
  async search(query, embedProvider?): Promise<KnowledgeChunk[]>  // 双路:语义 + 关键词
  async buildKnowledgeContext(userId, query, embedProvider?): Promise<string>  // 注入 system prompt
}
```

**`search` 双路检索**:
1. 若提供 embedProvider,尝试语义检索,失败则降级
2. 降级/无 provider → 关键词检索

**`semanticSearch`**:查询向量化 + chunk 向量化(缓存,key=`packName:sourceFile:heading`,截 2000 字符)+ 余弦相似度排序。embed 失败的 chunk 降级用关键词得分。

**`calculateKeywordScore`**:query 分词(长度 > 2),keyword 命中 +2,content 命中 +1,heading 包含 query +5,归一化 `score / queryWords.length`。

---

### 5.15 `@viraha/presence` 主动存在感

**路径**:`packages/presence` | **依赖**:core/db + drizzle-orm + node-cron

#### 5.15.1 `ConditionEvaluator`(`src/conditions.ts`)

```typescript
interface TriggerResult { type: string; priority: number; data: Record<string, unknown> }

class ConditionEvaluator {
  async evaluateAll(userId): Promise<TriggerResult | null>  // 并行 5 检查,返回 priority 最高的
  async getPendingProactiveEvent(userId): Promise<PendingProactiveEvent | null>  // 查未送达的
  async markDelivered(eventId): Promise<void>
}
```

**5 个条件检查**(并行评估,返回 priority 最高的):

| 条件 | priority | 触发 |
|---|---|---|
| `checkNoTraining` | 4/6/8 | 从未训练(4)/ 超 72h(6)/ 超 120h(8) |
| `checkConsistencyStreak` | 7 | 连续 3/5/7/14/21/30 次(每里程碑只发一次) |
| `checkRelationMilestone` | 9 | 关系等级到 2/5/10/15/20 |
| `checkWeekStart` | 3 | 周一 8-10 点 |
| `checkMealTime` | 2 | 早 8-9/午 11-12/晚 17-18,每天每顿一次 |

#### 5.15.2 `PresenceEngine`(`src/engine.ts`)

```typescript
type ProactiveSender = (message, trigger, userId) => Promise<void>

class PresenceEngine {
  setSender(sender: ProactiveSender)
  start(userId, cronExpression = "0 */2 * * *")  // 每 2 小时
  startAllActive(listActiveUsers, checkCron, refreshCron)  // 批量 + 每 10 分钟刷新
  stop(userId) / stopAll()
  async checkUser(userId): Promise<void>  // 核心:先送 pending,再评估条件
}
```

**`checkUser` 流程**:
1. 先查 `getPendingProactiveEvent` — 有未送达的先送
2. 无 pending → `evaluateAll` 评估条件
3. 有 trigger → `getProactiveMessage` 生成消息
4. `persistProactiveEvent` 写入 events 表(`delivered: false`)
5. 调 `sender` 发送,成功后 `markDelivered`;失败保留 pending,下次重试

#### 5.15.3 消息模板(`src/templates.ts`)

```typescript
export function getProactiveMessage(type: string, data: Record<string, unknown>): string
```

支持 type:`no_training_never/3_days/5_days`、`streak_milestone`(按 streak 数)、`level_up`、`week_start`、`meal_check`(按时段)。每个 type 多条随机文案。

---

### 5.16 `@viraha/arete` 参考应用

**路径**:`apps/arete`(版本 0.2.0)| **依赖**:14 个 `@viraha/*` workspace 包 + hono + dotenv

#### 5.16.1 `src/index.ts` — 主入口(装配所有引擎)

```typescript
async function main() {
  // 1. DB 迁移与初始化
  await migrate(dbPath); initDb(dbPath)

  // 2. LLM(DeepSeek 优先,Anthropic 可选)
  const { model, provider, llm } = createLlm()

  // 3. 核心引擎
  const eventStore = new EventStore()
  const events = new EventBus(); events.useStore(eventStore)
  const workRunner = new AgentWorkRunner()
  const scheduler = new DurableScheduler()
  const memory = new MemoryEngine()
  const companion = new CompanionEngine()
  const reflection = new ReflectionEngine(memory.profile, memory.store)
  const embed = new LocalEmbedProvider()
  const knowledge = new KnowledgeEngine()
  const presence = new PresenceEngine()
  memory.ranker.setEmbedProvider(embed)  // 启用向量混合检索

  // 4. 知识包加载
  knowledge.loadPack("../knowledge-packs/fitness-pack", "fitness")

  // 5. Companion Pack 插件(从 COMPANION_PACK_DIRS)
  const plugins = new PluginRegistry()
  for (const dir of COMPANION_PACK_DIRS) plugins.registerPack(await loadLocalCompanionPack(dir))

  // 6. AgentPipeline
  const pipeline = new AgentPipeline({ identity: ARETE_IDENTITY, model, llm, memory, reflection, companion, events, plugins })
  pipeline.registerSkill(workoutCoachManifest, workoutCoachHandler)  // ... 5 个 skill

  // 7. ChannelHub(飞书 + QQ)
  const hub = new ChannelHub()
  hub.register("feishu", () => FeishuAdapter.fromEnv())
  hub.register("qq", () => QQAdapter.fromEnv())

  // 8. 入站消息处理(/bind token 拦截 + pipeline)
  hub.onMessage(async (msg) => { /* ... */ })
  await hub.startAll()

  // 9. Presence(按 userId 路由到绑定平台)
  presence.setSender(async (message, _trigger, userId) => {
    const bindings = await hub.router.listBindingsByUser(userId)
    for (const b of bindings) if (activePlatforms.includes(b.platform)) await hub.reply(b.platform, b.platformUserId, message)
  })

  // 10. Web 服务器
  createAreteWebServer(pipeline, mcp, port, query => knowledge.buildKnowledgeContext("default", query, embed), hub, events, eventStore, workRunner, ...)
}
```

#### 5.16.2 `src/identity.ts` — ARETE_IDENTITY

```typescript
export const ARETE_IDENTITY: IdentityConfig = {
  agentId: "arete", name: "Arete", version: "2.0.0", type: "companion",
  description: "Official Fitness Companion. Bilingual (Chinese and English)...",
  longTermGoal: "Help users achieve their fitness goals...",
  coreValues: [/* 6 条:双语响应/Consistency beats intensity/Progressive overload/Recovery is training/Nutrition is fuel/Sleep is the best supplement */],
  personaId: "coach",
  persona: { name: "Coach", traits: ["calm","confident","data-driven","direct","kind"], style: "Uses science, not bro-science...", catchphrases: [...], humorLevel: 3, formality: 5, empathyLevel: 7 },
  capabilities: [/* 5 项 */],
  skills: ["workout-coach","nutrition-coach","progress-analysis","search","calculator"],
  limits: { maxPlanSteps: 10, maxTokensPerTurn: 8000, maxSkillCallsPerTurn: 20 }
}
```

#### 5.16.3 `src/web.ts` — Hono Web 服务器(462 行)

**跨平台身份解析**(`resolveWebUserId`):
- 读 cookie `viraha_web_id`,无则生成 `crypto.randomUUID()` 并 setCookie(httpOnly, 1 年, sameSite Lax)
- `hub.router.resolveUserId("web", webId)` 把 web cookie 映射到内部统一 userId

**路由清单**:

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/` | 返回聊天 SPA HTML(暗色主题) |
| GET | `/api/status` | identity + skills + MCP 工具列表 |
| GET | `/api/chat/stream` | **SSE 流式对话**(`pipeline.processStream`) |
| POST | `/api/chat` | 同步对话(`workRunner.run` 包裹 `pipeline.process`),记录 trace(保留最近 100 条) |
| GET | `/api/traces` | 最近 20 条 chat trace + `events.getMetrics()` |
| GET | `/api/events` | 事件查询(limit/type/userId/correlationId 过滤) |
| GET | `/api/provider-health` | provider 健康状态 |
| GET | `/api/identity` | 当前 web userId + 已绑定平台 |
| POST | `/api/link` | **跨平台绑定**(body `{platform, platformUserId}` → `linkPlatform`) |
| POST | `/api/link/token` | **生成一次性绑定 token**(5 分钟,用户在飞书发 `/bind <token>`) |

SPA 内含:"绑定飞书" 按钮(弹出含 5 分钟倒计时 modal)、"Traces" 抽屉(chat trace + 事件流,支持按 correlationId 过滤)。

#### 5.16.4 Skills(`src/skills/`)

**5 个 SkillManifest**(`manifests.ts`):

| id | input | 依赖 | maxRuntime |
|---|---|---|---|
| `workout-coach` | action: log/history | - | 3 |
| `nutrition-coach` | action: log, mealType + foods | - | 3 |
| `progress-analysis` | - | workout-coach, nutrition-coach | 5 |
| `search` | query | - | 2 |
| `calculator` | expression | - | 1 |

**5 个 SkillHandler**(`handlers.ts`):
- `workoutCoachHandler`:log → 插 `trainingSessions`;history → 查最近 5 条
- `nutritionCoachHandler`:log → reduce 累加 macros → 插 `foodLogs`
- `progressAnalysisHandler`:查最近 20 条训练 + 20 条饮食,返回汇总
- `searchHandler`:fetch DuckDuckGo Instant Answer API
- `calculatorHandler`:`evaluateMathExpression`,失败返回 `Invalid expression`

#### 5.16.5 域服务

**Training 域**(`src/training/`):
- `TrainingService`:createPlan / logSession / getRecentSessions / getActivePlan / setGoal / getGoalSummary
- `createTrainingTools()`:5 个工具(log_training_session / query_exercises / create_training_plan / get_recent_workouts / set_fitness_goal)
- `exercises.ts`:练习库加载器(读 `knowledge-packs/fitness-pack/exercises.json`)

**Nutrition 域**(`src/nutrition/`):
- `NutritionService`:logFood / getDailySummary / getRecentFoods
- `createNutritionTools()`:3 个工具(log_food / search_food / get_daily_nutrition)
- `foods.ts`:食物库加载器(读 `knowledge-packs/fitness-pack/foods.json`)

**注意**:Arete 同时存在 5 个 skill(粗粒度,面向 intent 路由)与 8 个 ToolDefinition(细粒度,面向 LLM function calling),两者并行,skill 内部可调用 tool。

#### 5.16.6 `src/presence-scheduler.ts`

```typescript
export async function runScheduledPresenceChecks(options: {
  scheduler: DurableScheduler
  listActiveUsers: () => Promise<string[]>
  presence: PresenceCheckService
}): Promise<SchedulerRunResult>
```

为每个活跃用户入队 `{ type: "presence-check" }` 任务,`scheduler.runDue` 一次性执行,handler 委托 `presence.checkUser(job.userId)`。

---

## 6. 依赖关系总览

### 6.1 包间依赖图

```
@viraha/core (基础类型 + math + channels 端口)
    │
    ├── @viraha/identity      (仅 core,纯内存)
    ├── @viraha/persona       (仅 core,纯内存)
    ├── @viraha/provider      (core + zod)
    ├── @viraha/mcp           (仅 core,Node 内置)
    │
    ├── @viraha/db            (core + libsql + drizzle)
    ├── @viraha/relationship  (core + db)
    ├── @viraha/channels      (core + db)
    ├── @viraha/presence      (core + db + node-cron)
    │
    ├── @viraha/embedding     (provider + @xenova/transformers)
    ├── @viraha/skills        (core + provider)
    ├── @viraha/knowledge     (core + db + provider + embedding)
    ├── @viraha/context       (core + db + knowledge + provider + embedding)
    │
    └── @viraha/memory        (core + db + provider + embedding)
              │
              └── @viraha/runtime (core + db + provider + memory + relationship + identity + skills + mcp)
                        │
                        └── @viraha/arete (14 个 @viraha/* 包全覆盖 + hono + dotenv)
```

### 6.2 层级观察

- **最底层**(仅依赖 core):identity、persona、provider、mcp — 纯内存或纯抽象
- **持久化层**:db 是所有持久化包的依赖
- **领域引擎**:memory、relationship、channels、presence、knowledge、context — 依赖 core + db(+ provider/embedding)
- **装配层**:runtime 聚合 8 个内部包
- **应用层**:arete 全覆盖 14 个包

### 6.3 关键解耦设计

`AgentPipeline` 通过自定义的 `AgentMemory`/`AgentReflection`/`AgentCompanion` 三个最小接口**解耦**了 `@viraha/memory` 与 `@viraha/relationship`,使得 pipeline 只依赖 `@viraha/identity`/`@viraha/skills`/`@viraha/mcp` 三个具体引擎 + provider/db/core 的类型。`@viraha/memory` 与 `@viraha/relationship` 仅在 `ports.ts` 的适配器工厂中作为类型出现。

---

## 7. 数据库 Schema

详见 [5.2.1](#521-srcschemats--drizzle-表定义254-行18-张表)。核心表关系:

```
users (id)
  ├── profiles (userId FK)
  ├── memoryEntries (userId FK)
  ├── sessions (userId FK)
  │     └── messages (sessionId FK)
  ├── relationships (userId FK)
  ├── moodHistory (userId FK)
  ├── achievements (userId FK)
  ├── milestones (userId FK)
  ├── scheduledMessages (userId FK)
  ├── goals (userId FK)
  │     └── plans (goalId FK)
  ├── diaryEntries (userId FK)
  ├── events (userId FK)               # 领域事件(用户视角)
  ├── trainingPlans (userId FK)
  │     └── trainingSessions (planId FK, userId FK)
  ├── foodLogs (userId FK)
  └── channelBindings (userId)          # 跨平台身份绑定(无 FK)

scheduledJobs (id)                       # 持久化任务队列(userId 无 FK,允许任意用户)
eventStore (id)                          # 事件存储(审计用,correlationId 必填)

# 额外索引(迁移脚本中)
messages_fts                             # FTS5 全文搜索虚拟表,挂载 messages
idx_scheduled_jobs_due                   # 任务队列查询索引
idx_channel_bindings_platform_user       # 跨平台绑定唯一约束(platform, platform_user_id)
```

---

## 8. 事件系统

### 8.1 事件类型(`@viraha/core` types.ts L259-279)

20 种 `EventType`:

```
UserMessageReceived | AgentThinking | AgentResponseSent | MessageStored
ToolCalled | ToolFailed | MemoryCreated | MemoryUpdated
ReflectionCompleted | RelationshipChanged | TrustChanged | StateTransition
AchievementUnlocked | LevelUp | GoalUpdated | GoalCompleted
PresenceTriggered | SessionCreated | SessionEnded | ErrorOccurred
```

### 8.2 事件信封(`EventEnvelope`)

```typescript
interface EventEnvelope {
  id: string
  type: EventType
  source: string
  timestamp: string
  correlationId: string
  payload: Record<string, unknown>
  metadata: { userId?; sessionId?; priority: "low"|"normal"|"high" }
}
```

### 8.3 事件流(Pipeline 一轮)

```
1. UserMessageReceived          → Pipeline 启动
2. ToolCalled                   → 工具被调用
3. ToolFailed                   → 工具失败(优先级 high)
4. AgentThinking(phase:"llm_final") → 工具结果回灌后第二次 LLM
5. AgentResponseSent            → 响应发送
6. ReflectionCompleted          → 异步反思完成(fire-and-forget)
7. RelationshipChanged(reason:"turn_completed") → 关系记录
8. ErrorOccurred(phase:"reflection"|"relationship") → 异步分支失败
```

### 8.4 持久化与查询

- `EventBus.useStore(store)` 挂载 `EventStore`,默认全类型持久化
- `EventStore.persist` 写 `eventStore` 表(`payload` JSON.stringify)
- `EventStore.query` 支持 type/userId/sessionId/correlationId 过滤,默认按 createdAt 倒序 100 条后 reverse
- Web `/api/events` 端点优先用 `eventStore.query`,回退 `events.getHistory` 内存过滤

---

## 9. 项目运行方式

### 9.1 环境要求

- Node 24
- pnpm 11
- 至少一个 LLM API Key

### 9.2 环境变量(`.env`)

```env
# 必填(至少一个 provider key)
DEEPSEEK_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...

# 默认模型(默认 deepseek-chat)
DEFAULT_MODEL=deepseek-chat

# 可选:Companion Pack 插件目录(分号分隔)
COMPANION_PACK_DIRS=

# 可选:Web 端口(默认 3000)
PORT=3000

# 可选:飞书通道(未配置则跳过)
FEISHU_APP_ID=...
FEISHU_APP_SECRET=...
FEISHU_ENCRYPT_KEY=...
FEISHU_VERIFICATION_TOKEN=...
FEISHU_WEBHOOK_PORT=...

# 可选:QQ 通道(未配置则跳过,单向)
QQ_BOT_APPID=...
QQ_BOT_TOKEN=...
```

### 9.3 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
set DEEPSEEK_API_KEY=sk-...

# 3. 启动开发服务器(热重载)
pnpm web
# 或 pnpm dev
# → http://localhost:3000

# 4. 可选:设置 Claude 模型
set ANTHROPIC_API_KEY=sk-ant-...
set DEFAULT_MODEL=claude-3-5-sonnet-latest
```

### 9.4 完整脚本

| 命令 | 说明 |
|---|---|
| `pnpm web` / `pnpm dev` | 启动 Arete 开发服务器(`tsx watch src/index.ts`) |
| `pnpm build` | 递归构建所有 workspace 包(`pnpm -r build`) |
| `pnpm test` | 快速本地测试套件(core/provider/runtime/context/channels/arete 六包) |
| `pnpm test:full` | 所有包测试(含较重的可选套件) |
| `pnpm lint` | 递归类型检查(`pnpm -r lint` = `tsc --noEmit`) |

### 9.5 单包操作

```bash
pnpm --filter @viraha/runtime build
pnpm --filter @viraha/channels test
pnpm --filter @viraha/db migrate   # 执行迁移
```

### 9.6 跨平台绑定流程

1. 在 Web 上聊天(自动创建 cookie 身份)
2. 点击 SPA "绑定飞书" 按钮 → 调 `/api/link/token` 获取 6 位 token(5 分钟有效)
3. 在飞书中向 Arete 发送 `/bind <token>`
4. 绑定成功后,飞书与 Web 共享同一份记忆与关系状态

### 9.7 数据库迁移

```bash
# 独立迁移(默认 data/companion.db)
pnpm --filter @viraha/db migrate

# 或在代码中
import { migrate } from "@viraha/db"
await migrate(dbPath)  // 自动创建表 + 索引 + FTS5
```

---

## 10. 测试与 CI

### 10.1 测试配置(`vitest.config.ts`)

```typescript
export default defineConfig({
  test: {
    globals: true,          // 全局 API(describe/it/expect 无需 import)
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "dist"]
  }
})
```

各包 `test` script:`vitest run --passWithNoTests || true`(无测试不阻断 CI)。

### 10.2 测试覆盖

| 包 | 测试文件数 | 覆盖 |
|---|---|---|
| core | 2 | math, types |
| provider | 1 | registry |
| runtime | 13 | event-bus, event-store, pipeline(companion/events/memory/stream/tools), plugin-loader, plugins, queue, scheduler, tool-policy, work-runner |
| context | 1 | token-budget |
| channels | 1 | channels(含 linkPlatform 合并测试) |
| memory | - | embedding 测试依赖模型下载,不适合 CI |
| arete | 2 | e2e, presence-scheduler |

### 10.3 CI 流程(`.github/workflows/ci.yml`)

触发:push 到 `main` 或 PR 到 `main`。

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build          # 递归构建
      - run: pnpm test           # 六包快速测试
        env: { NODE_ENV: test }
      - run: pnpm -r lint        # 递归 tsc --noEmit
      - name: Check for any type escapes
        run: grep -r "as any" --include="*.ts" packages/  # 仅扫 packages/,apps/ 豁免
```

### 10.4 评估测试

```bash
pnpm --filter @viraha/arete eval:smoke
# 运行 evals/smoke.json 冒烟测试用例
```

---

## 11. 附录:关键设计决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 架构分层 | 框架层零领域代码 + 应用层 Companion Pack | 领域可复用,框架可独立演进 |
| 依赖关系 | 依赖倒置(Ports 接口) | runtime 依赖 MemoryPort/CompanionPort/ContextPort,非具体实现 |
| 两套 Runtime 并存 | AgentPipeline + Runtime | pipeline 更集成化(arete 使用),runtime 更轻量(Ports 化) |
| 跨平台身份 | ChannelRouter 单一事实源 | `(platform, platformUserId) → userId` 映射 + linkPlatform 合并 |
| 记忆检索 | 关键字 + 向量混合(0.6:0.4) | 无 embedProvider 退化为纯关键字,有则启用向量 |
| 向量化 | 本地 BGE(Xenova/bge-small-zh-v1.5) | 无需 Python/API Key/GPU,中文优化 |
| 反思 | 异步非阻塞(fire-and-forget) | 不阻塞主流程,单段失败不影响其他 |
| 关系状态 | 写后失效缓存 | 保证一致性,下次读强制刷新 |
| 任务调度 | 持久化 SQLite + UPDATE...RETURNING | 原子抢占,进程重启不丢失 |
| 事件系统 | EventBus + 可选 EventStore 持久化 | 默认内存,需要审计时挂载 store |
| Provider 容错 | 熔断器(3 次失败开 60 秒)+ 回退 | 同 model 多 provider 按 priority 排序 |
| 工具策略 | 策略模式(allowAll/deny) | 可注入自定义 policy |
| CI 类型严格 | 仅 packages/ 禁止 as any | apps/ 处于快速迭代阶段,豁免 |
| SPA | 内嵌 HTML(无构建步骤) | 零前端构建依赖,单文件部署 |

---

> 本文档基于 `d:\viraha` 仓库源码生成。如需更新,重新运行代码分析即可。
