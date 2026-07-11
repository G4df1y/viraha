import http from "http"
import crypto from "crypto"
import * as lark from "@larksuiteoapi/node-sdk"
import { BaseAdapter } from "../base.js"
import type { IncomingMessage, OutgoingMessage } from "../types.js"

/**
 * FeishuAdapter — 飞书自定义应用双向通道。
 *
 * 两种连接模式（对齐 Hermes 的"长连接优先"架构）：
 *
 *   1. WebSocket 长连接（默认，推荐）：
 *      - 通过 @larksuiteoapi/node-sdk 的 WSClient 与飞书建立 WS 全双工通道
 *      - 无需公网 IP / 域名 / 内网穿透（ngrok/cloudflared）
 *      - SDK 内置鉴权，建连后明文推送，无需验签/解密
 *      - 只需本地能访问公网即可
 *
 *   2. Webhook 模式（备选，向后兼容）：
 *      - 起一个 http server 接收飞书推送
 *      - 需要公网 URL 指向 webhook 端口
 *      - 配置了 encryptKey 时强制签名校验
 *
 * 配置（.env）：
 *   FEISHU_APP_ID=cli_xxx
 *   FEISHU_APP_SECRET=xxx
 *   FEISHU_CONNECTION_MODE=websocket   # websocket（默认）| webhook
 *   # webhook 模式专用：
 *   FEISHU_ENCRYPT_KEY=xxx             # 可选，事件订阅时配置的 Encrypt Key
 *   FEISHU_VERIFICATION_TOKEN=xxx      # 事件订阅时配置的 Verification Token
 *   FEISHU_WEBHOOK_PORT=3001           # webhook server 端口，默认 3001
 */

const FEISHU_BASE = "https://open.feishu.cn/open-apis"

export type FeishuConnectionMode = "websocket" | "webhook"

interface FeishuConfig {
  appId: string
  appSecret: string
  /** 连接模式：websocket（默认，长连接）或 webhook（备选，需公网） */
  connectionMode?: FeishuConnectionMode
  /** webhook 模式专用：Encrypt Key */
  encryptKey?: string
  /** webhook 模式专用：Verification Token */
  verificationToken?: string
  /** webhook 模式专用：监听端口，默认 3001 */
  webhookPort?: number
}

/**
 * Verify a Feishu webhook signature. Pure function — no I/O, testable in isolation.
 *
 * Transparency: when encryptKey is configured, ALL three headers
 * (x-lark-signature, x-lark-request-timestamp, x-lark-request-nonce) must be
 * present and the SHA256 must match. Missing any header is a rejection, not a
 * silent pass-through — an attacker stripping headers must not bypass verification.
 * When encryptKey is not configured the adapter runs unsigned (logged at start).
 *
 * 仅 webhook 模式使用。WebSocket 模式由 SDK 内置鉴权，无需验签。
 */
export function verifyFeishuSignature(opts: {
  encryptKey?: string
  headers: http.IncomingMessage["headers"]
  body: string
}): { ok: boolean; reason?: string } {
  const { encryptKey, headers, body } = opts
  if (!encryptKey) return { ok: true }

  const signature = headers["x-lark-signature"]
  const timestamp = headers["x-lark-request-timestamp"]
  const nonce = headers["x-lark-request-nonce"]

  if (!signature || !timestamp || !nonce) {
    return { ok: false, reason: "missing-signature-headers" }
  }

  const expected = crypto
    .createHash("sha256")
    .update(String(timestamp) + String(nonce) + encryptKey + body)
    .digest("hex")

  if (signature !== expected) {
    return { ok: false, reason: "signature-mismatch" }
  }
  return { ok: true }
}

/**
 * 解析飞书 im.message.receive_v1 事件为 IncomingMessage。
 * 纯函数，websocket 和 webhook 模式共用。
 */
export function parseFeishuMessageEvent(payload: unknown): IncomingMessage | null {
  const p = payload as {
    header?: { event_type?: string }
    event?: {
      message?: {
        message_type?: string
        content?: string
        chat_id?: string
        create_time?: string
      }
      sender?: { sender_id?: { open_id?: string } }
    }
  }

  if (p?.header?.event_type !== "im.message.receive_v1") return null
  const event = p.event
  if (!event?.message || !event?.sender) return null
  if (event.message.message_type !== "text") return null

  let text = ""
  try {
    const content = JSON.parse(event.message.content || "{}")
    text = content.text || ""
  } catch {
    text = ""
  }
  if (!text.trim()) return null

  const openId = event.sender.sender_id?.open_id
  if (!openId) return null

  return {
    platform: "feishu",
    platformUserId: openId,
    text,
    platformChatId: event.message.chat_id,
    timestamp: event.message.create_time
      ? new Date(parseInt(event.message.create_time, 10)).toISOString()
      : undefined,
    raw: payload,
  }
}

export class FeishuAdapter extends BaseAdapter {
  readonly platform = "feishu"

  private config: FeishuConfig
  private server: http.Server | null = null
  private tokenCache: { token: string; expiresAt: number } | null = null
  private larkClient: lark.Client | null = null
  private wsClient: lark.WSClient | null = null

  constructor(config: FeishuConfig) {
    super()
    this.config = config
  }

  /** 从环境变量构造，未配置返回 null */
  static fromEnv(): FeishuAdapter | null {
    const appId = process.env.FEISHU_APP_ID
    const appSecret = process.env.FEISHU_APP_SECRET
    if (!appId || !appSecret) return null

    const mode = (process.env.FEISHU_CONNECTION_MODE || "websocket").toLowerCase()
    return new FeishuAdapter({
      appId,
      appSecret,
      connectionMode: mode === "webhook" ? "webhook" : "websocket",
      encryptKey: process.env.FEISHU_ENCRYPT_KEY,
      verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
      webhookPort: parseInt(process.env.FEISHU_WEBHOOK_PORT || "3001", 10),
    })
  }

  get connectionMode(): FeishuConnectionMode {
    return this.config.connectionMode ?? "websocket"
  }

  protected async doStart(): Promise<void> {
    if (this.connectionMode === "websocket") {
      await this.startWebSocket()
    } else {
      await this.startWebhook()
    }
  }

  protected async doStop(): Promise<void> {
    if (this.wsClient) {
      // WSClient 没有 stop 方法，靠 close server 间接关闭
      // SDK 内部管理连接生命周期，进程退出时自动清理
      this.wsClient = null
    }
    if (this.server) {
      await new Promise<void>(resolve => this.server!.close(() => resolve()))
      this.server = null
    }
  }

  /** 发消息到飞书指定用户（open_id） */
  async send(message: OutgoingMessage): Promise<boolean> {
    // 优先用 SDK Client（WS 和 webhook 都能用）
    if (this.larkClient) {
      try {
        await this.larkClient.im.v1.message.create({
          params: { receive_id_type: "open_id" },
          data: {
            receive_id: message.platformUserId,
            msg_type: "text",
            content: JSON.stringify({ text: message.text }),
          },
        })
        return true
      } catch (err) {
        console.error("[Feishu] send via SDK failed:", err instanceof Error ? err.message : err)
        return false
      }
    }
    // 降级：手动 token + fetch（向后兼容）
    return this.sendViaFetch(message)
  }

  // ===== WebSocket 长连接模式 =====

  private async startWebSocket(): Promise<void> {
    const baseConfig = {
      appId: this.config.appId,
      appSecret: this.config.appSecret,
    }

    this.larkClient = new lark.Client(baseConfig)
    this.wsClient = new lark.WSClient({ ...baseConfig, loggerLevel: lark.LoggerLevel.info })

    const eventDispatcher = new lark.EventDispatcher({}).register({
      "im.message.receive_v1": async (data: unknown) => {
        const incoming = parseFeishuMessageEvent(data)
        if (incoming) {
          await this.emit(incoming)
        }
      },
    })

    await this.wsClient.start({ eventDispatcher })
    console.log("[Feishu] WebSocket 长连接已建立，无需公网/穿透/验签")
  }

  // ===== Webhook 模式（向后兼容）=====

  private async startWebhook(): Promise<void> {
    // webhook 模式也初始化 larkClient 供 send() 使用
    this.larkClient = new lark.Client({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
    })

    const port = this.config.webhookPort ?? 3001
    this.server = http.createServer((req, res) => this.handleWebhookRequest(req, res))
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(port, () => {
        console.log(`[Feishu] webhook listening on :${port}/webhook/feishu (需公网 URL)`)
        resolve()
      })
      this.server!.on("error", reject)
    })
  }

  /** 处理飞书 webhook 请求 */
  private async handleWebhookRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== "POST" || req.url !== "/webhook/feishu") {
      res.writeHead(404)
      res.end("not found")
      return
    }

    const body = await readBody(req)

    // 签名验证（配置了 Encrypt Key 时强制校验，缺失任一头即拒绝）
    if (this.config.encryptKey) {
      const sigResult = verifyFeishuSignature({
        encryptKey: this.config.encryptKey,
        headers: req.headers,
        body,
      })
      if (!sigResult.ok) {
        console.warn(`[Feishu] ${sigResult.reason}, rejecting`)
        res.writeHead(401)
        res.end("bad signature")
        return
      }
    }

    let payload: any
    try {
      payload = JSON.parse(body)
    } catch {
      res.writeHead(400)
      res.end("invalid json")
      return
    }

    // URL 验证（飞书配置事件订阅时发的 challenge）
    if (payload.type === "url_verification" && payload.challenge) {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ challenge: payload.challenge }))
      return
    }

    // token 校验（配置了 Verification Token 时）
    if (this.config.verificationToken && payload.header?.token) {
      if (payload.header.token !== this.config.verificationToken) {
        console.warn("[Feishu] token mismatch, rejecting")
        res.writeHead(401)
        res.end("bad token")
        return
      }
    }

    // 立即响应 200，飞书要求 3 秒内返回
    res.writeHead(200)
    res.end("ok")

    // 异步处理事件（不阻塞响应）
    const incoming = parseFeishuMessageEvent(payload)
    if (incoming) {
      this.emit(incoming).catch(err => {
        console.error("[Feishu] event handling failed:", err instanceof Error ? err.message : err)
      })
    }
  }

  /** 降级发送：手动 token + fetch */
  private async sendViaFetch(message: OutgoingMessage): Promise<boolean> {
    const token = await this.getAppAccessToken()
    const res = await fetch(`${FEISHU_BASE}/im/v1/messages?receive_id_type=open_id`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receive_id: message.platformUserId,
        msg_type: "text",
        content: JSON.stringify({ text: message.text }),
      }),
    })
    return res.ok
  }

  /** 获取 app_access_token（带缓存，仅降级模式使用） */
  private async getAppAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 60000) {
      return this.tokenCache.token
    }

    const res = await fetch(`${FEISHU_BASE}/auth/v3/app_access_token/internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: this.config.appId,
        app_secret: this.config.appSecret,
      }),
    })
    const data: any = await res.json()
    if (data.code !== 0) {
      throw new Error(`Feishu token error: ${data.msg}`)
    }

    this.tokenCache = {
      token: data.app_access_token,
      expiresAt: Date.now() + (data.expire || 7200) * 1000,
    }
    return this.tokenCache.token
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ""
    req.on("data", chunk => { data += chunk })
    req.on("end", () => resolve(data))
    req.on("error", reject)
  })
}
