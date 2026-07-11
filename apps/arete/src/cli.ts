/**
 * Arete CLI / TUI 入口
 *
 * 终端交互式对话，复用 AgentPipeline。对标 Claude Code / Codex 的交互质感：
 * 流式输出、思考过程可视化、工具调用回显、Ctrl+C 中断、多行输入。
 *
 * 用法：pnpm cli
 */
import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"
import fs from "fs"
import readline from "readline"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") })

import { migrate, initDb } from "@viraha/db"
import { AgentPipeline, EventBus } from "@viraha/runtime"
import { AnthropicProvider, DeepSeekProvider, ProviderRegistry } from "@viraha/provider"
import type { LLMProvider } from "@viraha/provider"
import { MemoryEngine, ReflectionEngine } from "@viraha/memory"
import { CompanionEngine } from "@viraha/relationship"
import { EmotionEngine, emotionLabel } from "@viraha/emotion"
import { JournalEngine } from "@viraha/journal"
import { PersonaEngine } from "@viraha/persona"
import { KnowledgeEngine } from "@viraha/knowledge"
import { LocalEmbedProvider } from "@viraha/embedding"
import { ARETE_IDENTITY } from "./identity.js"
import {
  workoutCoachManifest, nutritionCoachManifest,
  progressAnalysisManifest, searchManifest, calculatorManifest,
} from "./skills/manifests.js"
import {
  workoutCoachHandler, nutritionCoachHandler,
  progressAnalysisHandler, searchHandler, calculatorHandler,
} from "./skills/handlers.js"

// ===== ANSI（无外部依赖） =====
const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
}

function hasRealKey(value: string | undefined): value is string {
  return Boolean(value && !value.includes("..."))
}

function createLlm(): { model: string; llm: LLMProvider } {
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
    throw new Error(`No configured provider can serve model "${model}". Set DEEPSEEK_API_KEY or ANTHROPIC_API_KEY in .env`)
  }
  return { model, llm: provider.resolve(model) }
}

// 思考阶段标签
const phaseLabel: Record<string, string> = {
  memory_context: "回忆",
  knowledge_context: "检索知识",
  relationship_context: "关系",
  llm_call: "推理",
  llm_final: "整理回复",
}

async function main() {
  const DATA_DIR = path.join(process.cwd(), "data")
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  const dbPath = path.join(DATA_DIR, "arete.db")
  await migrate(dbPath)
  initDb(dbPath)

  const { model, llm } = createLlm()
  const memory = new MemoryEngine()
  const companion = new CompanionEngine()
  const emotion = new EmotionEngine()
  const journal = new JournalEngine()
  const reflection = new ReflectionEngine(memory.profile, memory.store)
  const persona = new PersonaEngine()
  const embed = new LocalEmbedProvider()
  const knowledge = new KnowledgeEngine()
  memory.ranker.setEmbedProvider(embed)

  const knowledgePath = path.join(process.cwd(), "..", "..", "knowledge-packs", "fitness-pack")
  let knowledgeChunks = 0
  if (fs.existsSync(knowledgePath)) {
    knowledgeChunks = knowledge.loadPack(knowledgePath, "fitness").length
  }

  // ===== EventBus：实时显示思考阶段与工具调用 =====
  const events = new EventBus()
  const phaseLines: string[] = [] // 缓存思考阶段，token 开始前一次性显示
  let streaming = false // 是否已开始流式输出
  events.on("AgentThinking", (e: any) => {
    const phase = e.payload?.phase as string | undefined
    if (!phase) return
    const label = phaseLabel[phase] ?? phase
    if (streaming) {
      // 流式中途收到思考事件（fallback 场景）：换行显示
      process.stdout.write(`\n${c.dim}  ⟳ ${label}${c.reset}\n`)
    } else {
      phaseLines.push(label)
    }
  })
  events.on("ToolCalled", (e: any) => {
    const names = (e.payload?.toolCalls as Array<{ name: string }>[])?.map((t: any) => t.name).join(", ")
    process.stdout.write(`${c.dim}  ⚙ 调用 ${names}${c.reset}\n`)
  })

  const pipeline = new AgentPipeline({
    identity: ARETE_IDENTITY,
    model,
    llm,
    memory,
    reflection,
    companion,
    emotion,
    events,
  })
  pipeline.registerSkill(workoutCoachManifest, workoutCoachHandler)
  pipeline.registerSkill(nutritionCoachManifest, nutritionCoachHandler)
  pipeline.registerSkill(progressAnalysisManifest, progressAnalysisHandler)
  pipeline.registerSkill(searchManifest, searchHandler)
  pipeline.registerSkill(calculatorManifest, calculatorHandler)

  const userId = "cli-user"
  const history: Array<{ role: string; content: string }> = []
  let generating = false
  let cancelled = false
  let multilineBuffer = ""
  let stdinClosed = false

  // ===== Banner（简洁，无硬框） =====
  const skills = pipeline.skillsRegistry.list().map(s => s.manifest.name)
  console.clear()
  console.log()
  console.log(`${c.bold}  Arete${c.reset} ${c.dim}v0.2.0${c.reset}`)
  console.log(`${c.gray}  ${ARETE_IDENTITY.description}${c.reset}`)
  console.log(`${c.gray}  ${model} · ${skills.length} skills · ${knowledgeChunks} knowledge${c.reset}`)
  console.log()
  console.log(`${c.dim}  /help 命令 · Ctrl+C 中断 · 输入多行用 \\ 续行${c.reset}`)
  console.log()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${c.green}❯ ${c.reset}`,
  })

  rl.prompt()

  rl.on("line", async (input: string) => {
    // 生成中：忽略新输入
    if (generating) return

    // 多行续行：\ 结尾时缓冲
    if (input.endsWith("\\")) {
      multilineBuffer += input.slice(0, -1) + "\n"
      process.stdout.write(`${c.dim}… ${c.reset}`)
      return
    }
    const text = (multilineBuffer + input).trim()
    multilineBuffer = ""
    if (!text) { rl.prompt(); return }

    // ===== 命令 =====
    if (text.startsWith("/")) {
      const [cmd] = text.slice(1).split(/\s+/)
      switch (cmd) {
        case "help":
          console.log(`${c.dim}  /help     帮助${c.reset}`)
          console.log(`${c.gray}  /skills   技能${c.reset}`)
          console.log(`${c.gray}  /model    模型${c.reset}`)
          console.log(`${c.gray}  /mood     查看情绪状态${c.reset}`)
          console.log(`${c.gray}  /journal  写日记（/journal 内容）${c.reset}`)
          console.log(`${c.gray}  /diary    看近期日记${c.reset}`)
          console.log(`${c.gray}  /reset    清空历史${c.reset}`)
          console.log(`${c.gray}  /clear    清屏${c.reset}`)
          console.log(`${c.gray}  /exit     退出${c.reset}`)
          break
        case "skills":
          for (const s of pipeline.skillsRegistry.list()) {
            console.log(`${c.gray}  • ${s.manifest.name} — ${s.manifest.description ?? ""}${c.reset}`)
          }
          break
        case "model":
          console.log(`${c.gray}  ${c.yellow}${model}${c.reset}`)
          break
        case "mood": {
          const state = await emotion.getState(userId)
          console.log(`${c.gray}  当前情绪：${c.yellow}${emotionLabel[state.current]}${c.reset} ${c.dim}(强度 ${state.intensity}/5)${c.reset}`)
          if (state.trend.length > 0) {
            console.log(`${c.gray}  近期趋势：${state.trend.map(e => emotionLabel[e]).join(" → ")}${c.reset}`)
          }
          console.log(`${c.gray}  正向占比：${Math.round(state.positivityRatio * 100)}%${c.reset}`)
          break
        }
        case "journal": {
          const content = text.slice(text.indexOf(" ") + 1).trim()
          if (!content || content === "/journal") {
            console.log(`${c.dim}  用法：/journal 今天的心情或事情${c.reset}`)
            break
          }
          const entry = await journal.writeUserEntry(userId, content)
          console.log(`${c.dim}  ✓ 已写入日记（${entry.date}）${c.reset}`)
          console.log(`${c.gray}  Arete 正在写回应...${c.reset}`)
          // Arete 共写日记
          const moodSummary = (await emotion.getState(userId)).current
          const areteEntry = await journal.writeAreteEntry(
            { userId, date: entry.date, userEntry: content, moodSummary: emotionLabel[moodSummary as keyof typeof emotionLabel] ?? moodSummary },
            llm, model,
          )
          console.log(`${c.cyan}  Arete：${c.reset}${c.gray}${areteEntry.content}${c.reset}`)
          break
        }
        case "diary": {
          const entries = await journal.getRecent(userId, 7)
          if (entries.length === 0) {
            console.log(`${c.dim}  还没有日记${c.reset}`)
            break
          }
          for (const e of entries) {
            const who = e.generatedBy === "user" ? `${c.green}你${c.reset}` : `${c.cyan}Arete${c.reset}`
            const mood = e.moodTags ? ` ${c.dim}[${e.moodTags}]${c.reset}` : ""
            console.log(`${c.dim}  ${e.date}${c.reset} ${who}${mood}`)
            console.log(`${c.gray}    ${e.content.substring(0, 100)}${e.content.length > 100 ? "..." : ""}${c.reset}`)
          }
          break
        }
        case "reset":
          history.length = 0
          console.log(`${c.dim}  已清空${c.reset}`)
          break
        case "clear":
          console.clear()
          break
        case "exit":
        case "quit":
          console.log(`${c.dim}  再见${c.reset}`)
          process.exit(0)
        default:
          console.log(`${c.red}  未知: /${cmd}${c.reset}`)
      }
      rl.prompt()
      return
    }

    // ===== 对话 =====
    history.push({ role: "user", content: text })
    generating = true
    cancelled = false
    streaming = false
    phaseLines.length = 0

    const start = Date.now()
    let reply = ""
    let errMsg = ""
    try {
      for await (const event of pipeline.processStream({
        message: text,
        userId,
        userIdKind: "internal",
        channel: "cli",
        history,
        knowledge: async (q: string) => knowledge.buildKnowledgeContext(userId, q, embed),
      })) {
        if (cancelled) break

        if (event.type === "token") {
          // 第一个 token：先把累积的思考阶段刷出来，再开始流式输出
          if (!streaming) {
            streaming = true
            for (const p of phaseLines) {
              process.stdout.write(`${c.dim}  ⟳ ${p}${c.reset}\n`)
            }
            process.stdout.write(`${c.reset}`)
          }
          process.stdout.write(event.text)
          reply += event.text
        } else if (event.type === "error") {
          errMsg = event.message
        } else if (event.type === "done") {
          if (!reply && event.reply) {
            reply = event.reply
            // fallback 场景：非流式结果，先刷思考阶段
            if (!streaming) {
              for (const p of phaseLines) {
                process.stdout.write(`${c.dim}  ⟳ ${p}${c.reset}\n`)
              }
              process.stdout.write(`${c.gray}${reply}${c.reset}`)
            }
          }
        }
      }
      process.stdout.write("\n")
      const ms = Date.now() - start
      if (reply) history.push({ role: "assistant", content: reply })
      console.log()
      if (errMsg) {
        console.log(`${c.red}  ✗ ${errMsg}${c.reset}`)
      }
      console.log(`${c.dim}  ${ms}ms${c.reset}`)
    } catch (err: any) {
      process.stdout.write("\n")
      console.log(`${c.red}  ✗ ${err.message}${c.reset}`)
    } finally {
      generating = false
      console.log()
      if (stdinClosed) {
        process.exit(0)
      }
      rl.prompt()
    }
  })

  // Ctrl+C：生成中则中断，否则退出
  rl.on("SIGINT", () => {
    if (generating) {
      cancelled = true
      process.stdout.write(`\n${c.yellow}  ⏹ 已中断${c.reset}\n`)
    } else {
      console.log(`\n${c.dim}  再见${c.reset}`)
      process.exit(0)
    }
  })

  // stdin 关闭（管道模式）：等当前生成完成后退出
  rl.on("close", () => {
    stdinClosed = true
    if (!generating) process.exit(0)
  })
}

main().catch(err => { console.error(err); process.exit(1) })
