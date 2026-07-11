import { BaseAdapter } from "../base.js"
import type { IncomingMessage, OutgoingMessage } from "../types.js"

/**
 * QQAdapter — QQ 官方 Bot 双向通道。
 *
 * 基于 QQ Bot API v2 的 WebSocket 长连接（对齐 Hermes 的"长连接优先"架构）。
 * 无需公网 IP / 域名 / 内网穿透。
 *
 * 支持的事件（intents = GROUP_AND_C2C_EVENT = 1 << 25）：
 *   - C2C_MESSAGE_CREATE       用户单聊发消息给机器人
 *   - GROUP_AT_MESSAGE_CREATE  用户在群里 @ 机器人
 *
 * 配置（.env）：
 *   QQ_BOT_APPID=xxx                 # 开放平台 AppID
 *   QQ_BOT_SECRET=xxx                # 开放平台 ClientSecret（用于动态获取 access_token）
 *   QQ_BOT_TOKEN=xxx                 # 可选，旧版静态 token（向后兼容，优先用 SECRET）
 *   QQ_GROUP_OPENID=xxx              # 可选，默认推送的群
 *
 * 注：QQ Bot API v2 的 access_token 现在通过 POST /app/getAppAccessToken 动态获取，
 *     不再使用静态 token。为向后兼容，如果只配了 QQ_BOT_TOKEN（没配 SECRET），
 *     会降级为旧的单向推送模式。
 */

const QQ_OPENAPI = "https://api.sgroup.qq.com"
const QQ_TOKEN_API = "https://bots.qq.com/app/getAppAccessToken"

/** intents 位运算：GROUP_AND_C2C_EVENT = 1 << 25 */
const INTENT_GROUP_AND_C2C = 1 << 25

export type QQConnectionMode = "websocket" | "push-only"

interface QQConfig {
  appId: string
  /** ClientSecret，用于动态获取 access_token（推荐） */
  clientSecret?: string
  /** 旧版静态 token（向后兼容） */
  token?: string
  groupOpenId?: string
}

/**
 * 解析 QQ Bot 消息事件为 IncomingMessage。
 * 纯函数，websocket 和 webhook 共用。
 *
 * 支持 GROUP_AT_MESSAGE_CREATE（群@）和 C2C_MESSAGE_CREATE（单聊）。
 */
export function parseQQMessageEvent(payload: unknown): IncomingMessage | null {
  const p = payload as {
    op?: number
    s?: number
    t?: string
    d?: {
      id?: string
      content?: string
      author?: { id?: string; member_openid?: string; union_openid?: string }
      group_openid?: string
      group_id?: string
    }
  }

  if (p?.op !== 0) return null
  if (p.t !== "C2C_MESSAGE_CREATE" && p.t !== "GROUP_AT_MESSAGE_CREATE") return null

  const d = p.d
  if (!d) return null

  let text = d.content || ""
  // 去掉 @机器人 的前缀（QQ 群消息 content 格式为 "<@!bot_id> 实际内容"）
  text = text.replace(/^<@!\d+>\s*/, "").trim()
  if (!text) return null

  // 群消息用 author.id 作为 platformUserId（用户在该群的 openid），
  // 单聊用 author.user_openid
  const platformUserId =
    d.author?.member_openid ||
    d.author?.union_openid ||
    d.author?.id ||
    ""

  if (!platformUserId) return null

  return {
    platform: "qq",
    platformUserId,
    text,
    platformChatId: d.group_openid || d.group_id,
    raw: payload,
  }
}

export class QQAdapter extends BaseAdapter {
  readonly platform = "qq"

  private config: QQConfig
  private ws: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private lastSeq: number | null = null
  private accessTokenCache: { token: string; expiresAt: number } | null = null

  constructor(config: QQConfig) {
    super()
    this.config = config
  }

  static fromEnv(): QQAdapter | null {
    const appId = process.env.QQ_BOT_APPID
    const clientSecret = process.env.QQ_BOT_SECRET || process.env.QQ_BOT_CLIENT_SECRET
    const token = process.env.QQ_BOT_TOKEN

    // 优先用 clientSecret（新版动态 token），其次用旧版静态 token
    if (!appId) return null
    if (!clientSecret && !token) return null

    return new QQAdapter({
      appId,
      clientSecret,
      token,
      groupOpenId: process.env.QQ_GROUP_OPENID,
    })
  }

  /** 连接模式：有 secret 用 websocket 双向，只有 token 则降级 push-only */
  get connectionMode(): QQConnectionMode {
    return this.config.clientSecret ? "websocket" : "push-only"
  }

  protected async doStart(): Promise<void> {
    if (this.connectionMode === "websocket") {
      await this.startWebSocket()
    } else {
      console.log("[QQ] running in push-only mode (no QQ_BOT_SECRET configured, inbound disabled)")
    }
  }

  protected async doStop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.ws) {
      try {
        this.ws.close()
      } catch {}
      this.ws = null
    }
  }

  /** 发消息到 QQ */
  async send(message: OutgoingMessage): Promise<boolean> {
    const accessToken = await this.getAccessToken()

    // 群消息 vs 单聊消息
    if (message.platformChatId) {
      // 群消息
      const res = await fetch(`${QQ_OPENAPI}/v2/groups/${message.platformChatId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `QQBot ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: message.text,
          msg_type: 0,
        }),
      })
      return res.ok
    } else {
      // 单聊消息
      const res = await fetch(`${QQ_OPENAPI}/v2/users/${message.platformUserId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `QQBot ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: message.text,
          msg_type: 0,
        }),
      })
      return res.ok
    }
  }

  // ===== WebSocket 长连接模式 =====

  private async startWebSocket(): Promise<void> {
    const accessToken = await this.getAccessToken()
    const gatewayUrl = await this.getGatewayUrl(accessToken)
    console.log(`[QQ] connecting to gateway: ${gatewayUrl}`)

    this.ws = new WebSocket(gatewayUrl)

    this.ws.addEventListener("open", () => {
      console.log("[QQ] WebSocket connected, waiting for Hello...")
    })

    this.ws.addEventListener("message", event => {
      this.handleWSMessage(event.data as string).catch(err => {
        console.error("[QQ] WS message handler failed:", err instanceof Error ? err.message : err)
      })
    })

    this.ws.addEventListener("close", event => {
      console.log(`[QQ] WebSocket closed: ${event.code} ${event.reason}`)
      this.cleanupHeartbeat()
      // TODO: 指数退避重连 + Resume
    })

    this.ws.addEventListener("error", event => {
      console.error("[QQ] WebSocket error:", event)
    })
  }

  private async handleWSMessage(raw: string): Promise<void> {
    const payload = JSON.parse(raw) as { op: number; s?: number; t?: string; d?: any }
    const { op, s, t, d } = payload

    // 记录最新序列号
    if (typeof s === "number") {
      this.lastSeq = s
    }

    switch (op) {
      case 10: {
        // Hello — 收到心跳间隔，发 Identify
        const heartbeatInterval = d?.heartbeat_interval ?? 45000
        console.log(`[QQ] Hello received, heartbeat_interval=${heartbeatInterval}ms`)
        await this.sendIdentify()
        this.startHeartbeat(heartbeatInterval)
        break
      }
      case 0: {
        // Dispatch — 事件推送
        if (t === "READY") {
          console.log(`[QQ] Ready: session=${d?.session_id}, bot=${d?.user?.username}`)
        } else if (t === "RESUMED") {
          console.log("[QQ] Resumed: missed events replayed")
        } else {
          // 尝试解析为消息事件
          const incoming = parseQQMessageEvent(payload)
          if (incoming) {
            await this.emit(incoming)
          }
        }
        break
      }
      case 11: {
        // Heartbeat ACK
        break
      }
      case 7: {
        // Reconnect — 服务端要求重连
        console.log("[QQ] server requested reconnect")
        this.ws?.close()
        break
      }
    }
  }

  private async sendIdentify(): Promise<void> {
    const accessToken = await this.getAccessToken()
    const identify = {
      op: 2,
      d: {
        token: `QQBot ${accessToken}`,
        intents: INTENT_GROUP_AND_C2C,
        shard: [0, 1],
        properties: {
          $os: process.platform,
          $browser: "viraha",
          $device: "viraha",
        },
      },
    }
    this.ws?.send(JSON.stringify(identify))
    console.log("[QQ] Identify sent")
  }

  private startHeartbeat(intervalMs: number): Promise<void> {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const heartbeat = { op: 1, d: this.lastSeq }
        this.ws.send(JSON.stringify(heartbeat))
      }
    }, intervalMs)
    return Promise.resolve()
  }

  private cleanupHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  // ===== API 调用 =====

  /** 获取 access_token（动态，带缓存） */
  private async getAccessToken(): Promise<string> {
    if (this.config.token && !this.config.clientSecret) {
      return this.config.token // 旧版静态 token
    }

    if (this.accessTokenCache && Date.now() < this.accessTokenCache.expiresAt - 60000) {
      return this.accessTokenCache.token
    }

    const res = await fetch(QQ_TOKEN_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appId: this.config.appId,
        clientSecret: this.config.clientSecret,
      }),
    })
    const data: any = await res.json()
    if (!data.access_token) {
      throw new Error(`QQ token error: ${JSON.stringify(data)}`)
    }

    this.accessTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
    }
    return this.accessTokenCache.token
  }

  /** 获取 WSS gateway URL */
  private async getGatewayUrl(accessToken: string): Promise<string> {
    const res = await fetch(`${QQ_OPENAPI}/gateway`, {
      headers: { "Authorization": `QQBot ${accessToken}` },
    })
    const data: any = await res.json()
    if (!data.url) {
      throw new Error(`QQ gateway error: ${JSON.stringify(data)}`)
    }
    return data.url as string
  }
}
