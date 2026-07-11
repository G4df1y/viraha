import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"
import fs from "fs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") })

import { migrate, initDb } from "@viraha/db"
import { AgentPipeline, AgentWorkRunner, DurableScheduler, EventBus, EventStore, PluginRegistry, loadLocalCompanionPack } from "@viraha/runtime"
import { AnthropicProvider, DeepSeekProvider, ProviderRegistry } from "@viraha/provider"
import type { LLMProvider } from "@viraha/provider"
import { MemoryEngine, SessionCompressor, ReflectionEngine } from "@viraha/memory"
import { CompanionEngine } from "@viraha/relationship"
import { EmotionEngine } from "@viraha/emotion"
import { JournalEngine } from "@viraha/journal"
import { MCPManager } from "@viraha/mcp"
import { PersonaEngine } from "@viraha/persona"
import { KnowledgeEngine } from "@viraha/knowledge"
import { LocalEmbedProvider } from "@viraha/embedding"
import { PresenceEngine } from "@viraha/presence"
import { ChannelHub, FeishuAdapter, QQAdapter } from "@viraha/channels"
import type { EventEnvelope, EventType } from "@viraha/core"
import crypto from "crypto"
import { ARETE_IDENTITY } from "./identity.js"
import {
  workoutCoachManifest, nutritionCoachManifest,
  progressAnalysisManifest, searchManifest, calculatorManifest,
} from "./skills/manifests.js"
import {
  workoutCoachHandler, nutritionCoachHandler,
  progressAnalysisHandler, searchHandler, calculatorHandler,
} from "./skills/handlers.js"
import { createAreteWebServer } from "./web.js"
import { runScheduledPresenceChecks } from "./presence-scheduler.js"

const DATA_DIR = path.join(process.cwd(), "data")
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

function createLlm(): { model: string; provider: ProviderRegistry; llm: LLMProvider } {
  const deepseekKey = process.env.DEEPSEEK_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const model = process.env.DEFAULT_MODEL
    ?? (hasRealKey(deepseekKey) ? "deepseek-chat" : "claude-3-5-sonnet-latest")

  const provider = new ProviderRegistry()

  if (hasRealKey(deepseekKey)) {
    const models = new Set(["deepseek-chat", "deepseek-reasoner"])
    if (model.startsWith("deepseek-")) models.add(model)
    provider.register("deepseek", new DeepSeekProvider({ apiKey: deepseekKey }), [...models])
  }

  if (hasRealKey(anthropicKey)) {
    const models = new Set(["claude-3-5-sonnet-latest"])
    if (model.startsWith("claude-")) models.add(model)
    provider.register("anthropic", new AnthropicProvider({ apiKey: anthropicKey }), [...models])
  }

  if (!provider.hasModel(model)) {
    throw new Error(`No configured provider can serve model "${model}". Set DEEPSEEK_API_KEY for deepseek-* models or ANTHROPIC_API_KEY for claude-* models.`)
  }

  return { model, provider, llm: provider.resolve(model) }
}

function hasRealKey(value: string | undefined): value is string {
  return Boolean(value && !value.includes("..."))
}

async function main() {
  const dbPath = path.join(DATA_DIR, "arete.db")
  await migrate(dbPath)
  initDb(dbPath)

  const { model, provider, llm } = createLlm()
  const eventStore = new EventStore()
  const events = new EventBus()
  events.useStore(eventStore)
  const workRunner = new AgentWorkRunner()
  const scheduler = new DurableScheduler()

  const memory = new MemoryEngine()
  const companion = new CompanionEngine()
  const emotion = new EmotionEngine()
  const journal = new JournalEngine()
  const reflection = new ReflectionEngine(memory.profile, memory.store)
  const compressor = new SessionCompressor()
  const persona = new PersonaEngine()
  const embed = new LocalEmbedProvider()
  const knowledge = new KnowledgeEngine()
  const presence = new PresenceEngine()
  memory.ranker.setEmbedProvider(embed)

  const knowledgePath = path.join(process.cwd(), "..", "..", "knowledge-packs", "fitness-pack")
  if (fs.existsSync(knowledgePath)) {
    knowledge.loadPack(knowledgePath, "fitness")
    console.log("[Knowledge] Loaded fitness pack")
  }

  const plugins = new PluginRegistry()
  for (const dir of (process.env.COMPANION_PACK_DIRS ?? "").split(";").map(s => s.trim()).filter(Boolean)) {
    const pack = await loadLocalCompanionPack(dir)
    plugins.registerPack(pack)
    console.log(`[Plugins] Loaded ${pack.name}@${pack.version}`)
  }

  const pipeline = new AgentPipeline({
    identity: ARETE_IDENTITY,
    model,
    llm,
    memory,
    reflection,
    companion,
    emotion,
    events,
    plugins,
  })

  pipeline.registerSkill(workoutCoachManifest, workoutCoachHandler)
  pipeline.registerSkill(nutritionCoachManifest, nutritionCoachHandler)
  pipeline.registerSkill(progressAnalysisManifest, progressAnalysisHandler)
  pipeline.registerSkill(searchManifest, searchHandler)
  pipeline.registerSkill(calculatorManifest, calculatorHandler)
  console.log("[Skills] 5 registered")

  // ===== ChannelHub: 统一管理所有平台通道 =====
  const hub = new ChannelHub()
  hub.register("feishu", () => FeishuAdapter.fromEnv())
  hub.register("qq", () => QQAdapter.fromEnv())

  // P0.1: 出站发送回执 → EventStore。成功写 ChannelMessageSent，失败写
  // ChannelSendFailed（高优先级），让渠道 API 故障也能在 Trace Cockpit 看到。
  hub.setEventSink(async (e) => {
    const type: EventType = e.kind === "sent" ? "ChannelMessageSent" : "ChannelSendFailed"
    const envelope: EventEnvelope = {
      id: crypto.randomUUID(),
      type,
      source: "channel-hub",
      timestamp: e.timestamp,
      correlationId: crypto.randomUUID(),
      payload: {
        platform: e.platform,
        platformUserId: e.platformUserId,
        textSnippet: e.textSnippet,
        success: e.kind === "sent",
        ...(e.error ? { error: e.error } : {}),
      },
      metadata: {
        priority: e.kind === "failed" ? "high" : "normal",
      },
    }
    await eventStore.persist(envelope)
    await events.emit(envelope)
  })

  // 入站消息处理：平台用户 → 路由到内部 userId → pipeline → 回复
  hub.onMessage(async (msg) => {
    // 拦截 /bind <token> 指令：跨平台身份绑定
    const bindMatch = msg.text.trim().match(/^\/bind\s+([A-Z0-9]{6})$/i)
    if (bindMatch) {
      const token = bindMatch[1].toUpperCase()
      const mergedUserId = await hub.router.consumeLinkToken(token, msg.platform, msg.platformUserId)
      if (mergedUserId) {
        await hub.reply(
          msg.platform,
          msg.platformUserId,
          "绑定成功！现在我们在飞书和 web 上共享同一份记忆了。",
          msg.platformChatId,
        )
      } else {
        await hub.reply(
          msg.platform,
          msg.platformUserId,
          "绑定失败：token 不存在或已过期。请在 web 上重新生成 token（5 分钟内有效）。",
          msg.platformChatId,
        )
      }
      return
    }

    const userId = await hub.router.resolveUserId(msg.platform, msg.platformUserId)
    const result = await workRunner.run({ userId, channel: msg.platform, content: msg.text }, () =>
      pipeline.process({
        message: msg.text,
        userId,
        userIdKind: "internal",
        channel: msg.platform,
        knowledge: async (q: string) => knowledge.buildKnowledgeContext(userId, q, embed),
      })
    )
    if (result.reply) {
      await hub.reply(msg.platform, msg.platformUserId, result.reply, msg.platformChatId)
    }
  })

  // 启动所有已配置的平台通道
  const activePlatforms = await hub.startAll()
  if (activePlatforms.length > 0) {
    console.log(`[Channels] Active: ${activePlatforms.join(", ")}`)

    // 可配置的主动消息调度频率（默认 2 小时），同时作为同用户冷却窗口防止重复骚扰
    const presenceIntervalMs = Number.parseInt(process.env.PRESENCE_CHECK_INTERVAL_MS ?? "", 10)
      || 2 * 60 * 60 * 1000

    // presence 主动推送：按 userId 路由到该用户绑定的所有平台（跨平台一致体验的关键）
    presence.setSender(async (message, _trigger, userId) => {
      const bindings = await hub.router.listBindingsByUser(userId)
      if (bindings.length === 0) return
      // 只往该用户已绑定的平台推（绑定关系决定了消息发到哪）
      for (const b of bindings) {
        if (activePlatforms.includes(b.platform)) {
          await hub.reply(b.platform, b.platformUserId, message)
        }
      }
    })
    const runPresenceChecks = async () => runScheduledPresenceChecks({
      scheduler,
      presence,
      cooldownMs: presenceIntervalMs,
      listActiveUsers: async () => {
        const users = await hub.router.listActiveUsers(50)
        return users.map(user => user.userId)
      },
    })
    void runPresenceChecks().catch(err => console.error("[Presence] scheduled run failed:", err))
    const presenceInterval = setInterval(() => {
      void runPresenceChecks().catch(err => console.error("[Presence] scheduled run failed:", err))
    }, presenceIntervalMs)
    presenceInterval.unref()
    console.log(`[Presence] Durable worker active for all known users on ${activePlatforms.length} channel(s) (interval ${presenceIntervalMs}ms)`)
  }

  const mcp = new MCPManager()

  const port = parseInt(process.env.PORT || "3000", 10)
  createAreteWebServer(
    pipeline,
    mcp,
    port,
    query => knowledge.buildKnowledgeContext("default", query, embed),
    hub,
    events,
    eventStore,
    workRunner,
    () => ({
      model,
      providers: provider.list().map(p => p.name),
    }),
    scheduler,
    memory,
    companion,
    emotion,
    journal,
  )

  void compressor
  void persona
}

main().catch(err => { console.error(err); process.exit(1) })
