/**
 * viraha setup — 交互式接入向导。
 *
 * 类似 Hermes 的 `hermes gateway setup`：
 *   1. 选择要接入的平台（飞书 / QQ / 都要 / 跳过只用 Web）
 *   2. 针对每个平台：显示注册步骤 → 引导填凭证 → 测试连接 → 写入 .env
 *   3. 配置 LLM provider key
 *   4. 完成 → 提示 pnpm web
 *
 * 用法：pnpm setup
 */

import readline from "readline/promises"
import { stdin, stdout } from "process"
import fs from "fs"
import path from "path"

// ===== 类型 =====

interface EnvEntry {
  key: string
  value: string
  comment?: string
}

// ===== 工具函数 =====

const rl = readline.createInterface({ input: stdin, output: stdout })

function header(title: string): void {
  console.log()
  console.log("─".repeat(60))
  console.log(`  ${title}`)
  console.log("─".repeat(60))
}

function step(n: number, text: string): void {
  console.log(`  ${n}. ${text}`)
}

async function ask(prompt: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : ""
  const answer = await rl.question(`  ${prompt}${suffix}: `)
  return answer.trim() || defaultValue || ""
}

async function askSecret(prompt: string): Promise<string> {
  const answer = await rl.question(`  ${prompt}: `)
  return answer.trim()
}

async function choose(options: string[], prompt = "选择"): Promise<number> {
  console.log()
  options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`))
  while (true) {
    const answer = await rl.question(`\n  ${prompt} (输入序号): `)
    const n = parseInt(answer.trim(), 10)
    if (n >= 1 && n <= options.length) return n - 1
    console.log("  无效输入,请重新选择")
  }
}

async function confirm(prompt: string, defaultValue = true): Promise<boolean> {
  const hint = defaultValue ? "Y/n" : "y/N"
  const answer = await rl.question(`  ${prompt} [${hint}]: `)
  if (answer.trim() === "") return defaultValue
  return answer.trim().toLowerCase() === "y"
}

// ===== .env 读写 =====

function parseEnvFile(content: string): Map<string, EnvEntry> {
  const entries = new Map<string, EnvEntry>()
  const lines = content.split("\n")
  let lastComment = ""

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("#")) {
      lastComment = trimmed.replace(/^#\s*/, "")
      continue
    }
    if (!trimmed) {
      lastComment = ""
      continue
    }
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    entries.set(key, { key, value, comment: lastComment || undefined })
    lastComment = ""
  }
  return entries
}

function writeEnvFile(
  filePath: string,
  entries: Map<string, EnvEntry>,
  header: string,
): void {
  const lines: string[] = [`# ${header}`, `# 由 viraha setup 生成于 ${new Date().toISOString()}`, ""]

  // 分组写入
  const grouped: Record<string, EnvEntry[]> = {}
  for (const entry of entries.values()) {
    const prefix = entry.key.split("_")[0]
    if (!grouped[prefix]) grouped[prefix] = []
    grouped[prefix].push(entry)
  }

  for (const [prefix, items] of Object.entries(grouped)) {
    lines.push(`# ===== ${prefix} =====`)
    for (const item of items) {
      if (item.comment) lines.push(`# ${item.comment}`)
      lines.push(`${item.key}=${item.value}`)
    }
    lines.push("")
  }

  fs.writeFileSync(filePath, lines.join("\n"), "utf-8")
}

// ===== 连接测试 =====

async function testFeishuConnection(appId: string, appSecret: string): Promise<boolean> {
  try {
    const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    })
    const data: any = await res.json()
    if (data.code === 0 && data.app_access_token) {
      console.log("  ✓ 连接成功!app_access_token 已获取")
      return true
    }
    console.log(`  ✗ 连接失败:${data.msg || JSON.stringify(data)}`)
    return false
  } catch (err) {
    console.log(`  ✗ 网络错误:${err instanceof Error ? err.message : err}`)
    return false
  }
}

async function testQQConnection(appId: string, clientSecret: string): Promise<boolean> {
  try {
    const res = await fetch("https://bots.qq.com/app/getAppAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, clientSecret }),
    })
    const data: any = await res.json()
    if (data.access_token) {
      console.log("  ✓ 连接成功!access_token 已获取")
      return true
    }
    console.log(`  ✗ 连接失败:${JSON.stringify(data)}`)
    return false
  } catch (err) {
    console.log(`  ✗ 网络错误:${err instanceof Error ? err.message : err}`)
    return false
  }
}

async function testDeepSeekConnection(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.deepseek.com/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` },
    })
    if (res.ok) {
      console.log("  ✓ API Key 有效")
      return true
    }
    const data: any = await res.json().catch(() => ({}))
    console.log(`  ✗ API Key 无效:${data.error?.message || res.statusText}`)
    return false
  } catch (err) {
    console.log(`  ✗ 网络错误:${err instanceof Error ? err.message : err}`)
    return false
  }
}

// ===== 各平台向导 =====

async function setupFeishu(entries: Map<string, EnvEntry>): Promise<void> {
  header("飞书接入向导")
  console.log()
  console.log("  飞书用 WebSocket 长连接模式,无需公网 IP / 穿透工具。")
  console.log()
  console.log("  获取凭证步骤:")
  step(1, "打开 https://open.feishu.cn/app 登录飞书开放平台")
  step(2, "点击「创建企业自建应用」,填写应用名称和描述")
  step(3, "进入应用 → 「凭证与基础信息」→ 复制 App ID 和 App Secret")
  step(4, "进入「添加应用能力」→ 开启「机器人」")
  step(5, '进入「事件订阅」→ 订阅方式选「使用长连接接收事件」')
  step(6, "在事件订阅里添加事件:im.message.receive_v1(接收消息)")
  step(7, "进入「权限管理」→ 开通 im:message(发送/接收消息)")
  step(8, "提交版本发布 → 等待管理员审批(个人测试空间可秒过)")
  console.log()
  console.log("  📖 详细图文教程:https://open.feishu.cn/document/home/introduction")
  console.log()

  const appId = await ask("FEISHU_APP_ID (cli_xxx)")
  const appSecret = await askSecret("FEISHU_APP_SECRET")

  if (!appId || !appSecret) {
    console.log("  跳过飞书(未填写凭证)")
    return
  }

  // 测试连接
  console.log()
  console.log("  正在测试连接...")
  const ok = await testFeishuConnection(appId, appSecret)
  if (!ok) {
    const continueAnyway = await confirm("连接失败,仍然保存这些凭证吗?", false)
    if (!continueAnyway) return
  }

  entries.set("FEISHU_APP_ID", { key: "FEISHU_APP_ID", value: appId })
  entries.set("FEISHU_APP_SECRET", { key: "FEISHU_APP_SECRET", value: appSecret })
  entries.set("FEISHU_CONNECTION_MODE", {
    key: "FEISHU_CONNECTION_MODE",
    value: "websocket",
    comment: "websocket=长连接(推荐,无需公网) | webhook=需公网URL",
  })
  console.log("  ✓ 飞书配置已保存")
}

async function setupQQ(entries: Map<string, EnvEntry>): Promise<void> {
  header("QQ Bot 接入向导")
  console.log()
  console.log("  QQ 用 WebSocket 长连接模式,无需公网 IP / 穿透工具。")
  console.log("  支持接收:用户单聊消息 + 群里 @机器人")
  console.log()
  console.log("  获取凭证步骤:")
  step(1, "打开 https://q.qq.com 登录 QQ 机器人开放平台")
  step(2, "选择「机器人」→「创建机器人」,填写信息")
  step(3, "在机器人管理页 → 「开发设置」→ 复制 AppID 和 ClientSecret")
  step(4, "在「功能配置」里开启你需要的场景(单聊 / 群聊)")
  step(5, "提交审核 → 等待通过(个人开发者通常很快)")
  console.log()
  console.log("  📖 详细文档:https://bot.q.qq.com/wiki/develop/api-v2/")
  console.log()

  const appId = await ask("QQ_BOT_APPID")
  const clientSecret = await askSecret("QQ_BOT_SECRET (ClientSecret)")

  if (!appId || !clientSecret) {
    console.log("  跳过 QQ(未填写凭证)")
    return
  }

  console.log()
  console.log("  正在测试连接...")
  const ok = await testQQConnection(appId, clientSecret)
  if (!ok) {
    const continueAnyway = await confirm("连接失败,仍然保存这些凭证吗?", false)
    if (!continueAnyway) return
  }

  entries.set("QQ_BOT_APPID", { key: "QQ_BOT_APPID", value: appId })
  entries.set("QQ_BOT_SECRET", {
    key: "QQ_BOT_SECRET",
    value: clientSecret,
    comment: "ClientSecret,用于动态获取 access_token",
  })
  console.log("  ✓ QQ 配置已保存")
}

async function setupLLM(entries: Map<string, EnvEntry>): Promise<void> {
  header("LLM Provider 配置")
  console.log()
  console.log("  Arete 需要一个 LLM provider 来生成回复。")
  console.log("  推荐 DeepSeek(便宜好用),也支持 Anthropic Claude。")
  console.log()

  const choice = await choose(["DeepSeek (推荐)", "Anthropic Claude", "两个都配", "跳过(稍后手动配)"])

  if (choice === 3) {
    console.log("  跳过 LLM 配置,稍后可手动编辑 .env")
    return
  }

  if (choice === 0 || choice === 2) {
    console.log()
    console.log("  获取 DeepSeek API Key:")
    step(1, "打开 https://platform.deepseek.com 注册登录")
    step(2, "进入「API Keys」→「创建 API Key」")
    step(3, "复制 sk- 开头的 key")
    console.log()
    const apiKey = await askSecret("DEEPSEEK_API_KEY (sk-xxx)")
    if (apiKey) {
      console.log("  正在测试连接...")
      await testDeepSeekConnection(apiKey)
      entries.set("DEEPSEEK_API_KEY", { key: "DEEPSEEK_API_KEY", value: apiKey })
      entries.set("DEFAULT_MODEL", { key: "DEFAULT_MODEL", value: "deepseek-chat" })
      console.log("  ✓ DeepSeek 配置已保存")
    }
  }

  if (choice === 1 || choice === 2) {
    console.log()
    console.log("  获取 Anthropic API Key:")
    step(1, "打开 https://console.anthropic.com 注册登录")
    step(2, "进入「API Keys」→「Create Key」")
    step(3, "复制 sk-ant- 开头的 key")
    console.log()
    const apiKey = await askSecret("ANTHROPIC_API_KEY (sk-ant-xxx)")
    if (apiKey) {
      entries.set("ANTHROPIC_API_KEY", { key: "ANTHROPIC_API_KEY", value: apiKey })
      if (!entries.has("DEFAULT_MODEL")) {
        entries.set("DEFAULT_MODEL", { key: "DEFAULT_MODEL", value: "claude-sonnet-4-20250514" })
      }
      console.log("  ✓ Anthropic 配置已保存")
    }
  }
}

// ===== 主流程 =====

async function main(): Promise<void> {
  console.log()
  console.log("╔══════════════════════════════════════════════════════════╗")
  console.log("║          Viraha Setup — 交互式接入向导                   ║")
  console.log("║          对齐 Hermes gateway setup 体验                  ║")
  console.log("╚══════════════════════════════════════════════════════════╝")
  console.log()
  console.log("  这个向导会带你完成:")
  console.log("    • 选择要接入的消息平台(飞书 / QQ)")
  console.log("    • 配置 LLM provider")
  console.log("    • 测试连接")
  console.log("    • 生成 .env 文件")
  console.log()

  // 读取现有 .env(如果有)
  const envPath = path.resolve(process.cwd(), ".env")
  let entries: Map<string, EnvEntry> = new Map()

  if (fs.existsSync(envPath)) {
    console.log(`  发现现有 .env 文件,将在此基础上更新`)
    entries = parseEnvFile(fs.readFileSync(envPath, "utf-8"))
  } else if (fs.existsSync(path.resolve(process.cwd(), ".env.example"))) {
    console.log(`  从 .env.example 创建初始配置`)
    entries = parseEnvFile(fs.readFileSync(path.resolve(process.cwd(), ".env.example"), "utf-8"))
    // 清空示例值
    for (const [key, entry] of entries) {
      if (entry.value.includes("xxx") || entry.value.includes("...")) {
        entries.set(key, { ...entry, value: "" })
      }
    }
  }

  // 1. 选择平台
  header("选择要接入的平台")
  const platformChoice = await choose([
    "飞书(推荐,最简单)",
    "QQ Bot",
    "飞书 + QQ 都要",
    "暂时只用 Web 版(不接平台)",
  ])

  // 2. 各平台向导
  if (platformChoice === 0 || platformChoice === 2) {
    await setupFeishu(entries)
  }
  if (platformChoice === 1 || platformChoice === 2) {
    await setupQQ(entries)
  }
  if (platformChoice === 3) {
    console.log()
    console.log("  好的,跳过平台接入。你可以直接用 Web 版和 Arete 对话。")
    console.log("  以后想接平台,随时再跑 pnpm setup")
  }

  // 3. LLM 配置
  await setupLLM(entries)

  // 4. Web 端口
  if (!entries.has("PORT")) {
    header("Web 服务配置")
    const port = await ask("PORT", "3000")
    entries.set("PORT", { key: "PORT", value: port })
  }

  // 5. 写入 .env
  header("生成 .env 文件")

  // 清理空值条目
  for (const [key, entry] of entries) {
    if (!entry.value && !entry.comment) {
      entries.delete(key)
    }
  }

  writeEnvFile(envPath, entries, "Viraha / Arete 配置")
  console.log(`  ✓ .env 已写入: ${envPath}`)
  console.log()

  // 6. 完成
  header("配置完成!")
  console.log()
  console.log("  下一步:")
  console.log()
  console.log("    pnpm web")
  console.log()
  console.log("  然后浏览器打开 http://localhost:3000 和 Arete 对话。")
  if (platformChoice === 0 || platformChoice === 2) {
    console.log()
    console.log("  飞书:在飞书里给 bot 发消息,Arete 会自动回复。")
    console.log("  (首次需要在飞书开放平台发布应用版本)")
  }
  if (platformChoice === 1 || platformChoice === 2) {
    console.log()
    console.log("  QQ:在 QQ 里单聊或群里 @bot,Arete 会自动回复。")
    console.log("  (首次需要在 q.qq.com 提交审核)")
  }
  console.log()
  console.log("  想重新配置?随时再跑 pnpm setup")
  console.log()

  rl.close()
}

main().catch(err => {
  console.error("Setup failed:", err)
  rl.close()
  process.exit(1)
})
