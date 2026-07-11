import type {
  ChannelAdapter,
  ChannelAdapterFactory,
  ChannelEventSink,
  ChannelOutboundEvent,
  IncomingMessage,
  MessageHandler,
  OutgoingMessage,
} from "./types.js"
import { ChannelRouter } from "./router.js"

/**
 * ChannelHub — 所有平台通道的中枢。
 *
 * 职责：
 *   1. 注册/发现 adapter（工厂模式，未配置 env 的 adapter 自动跳过）
 *   2. 启动/停止所有 adapter
 *   3. 入站：adapter → IncomingMessage → router 解析 userId → handler(pipeline)
 *   4. 出站：companion 调 reply(platform, platformUserId, text) → adapter.send
 *   5. 错误隔离：一个 adapter 崩了不影响其他
 *
 * 典型用法：
 *   const hub = new ChannelHub()
 *   hub.register("feishu", () => FeishuAdapter.fromEnv())
 *   hub.register("telegram", () => TelegramAdapter.fromEnv())
 *   hub.onMessage(async (msg) => {
 *     const userId = await hub.router.resolveUserId(msg.platform, msg.platformUserId)
 *     const result = await pipeline.process({ message: msg.text, userId })
 *     await hub.reply(msg.platform, msg.platformUserId, result.reply)
 *   })
 *   await hub.startAll()
 */
export class ChannelHub {
  readonly router = new ChannelRouter()

  private adapters = new Map<string, ChannelAdapter>()
  private factories = new Map<string, ChannelAdapterFactory>()
  private handlers: MessageHandler[] = []
  private eventSink?: ChannelEventSink

  /** 注册一个 adapter 工厂。未配置 env 时工厂返回 null，自动跳过。 */
  register(platform: string, factory: ChannelAdapterFactory): void {
    this.factories.set(platform, factory)
  }

  /** 注册入站消息处理器（通常只有一个，包装 pipeline.process）。 */
  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler)
  }

  /**
   * 注入出站回执接收器。reply() 每次发送后会调用 sink，成功写 "sent"、
   * 失败写 "failed"。Arete 把 sink 适配成 EventStore 的
   * ChannelMessageSent / ChannelSendFailed 事件，让渠道发送失败也能进 Trace。
   */
  setEventSink(sink: ChannelEventSink): void {
    this.eventSink = sink
  }

  /** 已激活的平台列表 */
  get activePlatforms(): string[] {
    return Array.from(this.adapters.keys())
  }

  /**
   * 实例化所有已配置的 adapter（工厂返回非 null 的）。
   * 不调用 start，仅构造。用于启动前的检查。
   */
  discover(): string[] {
    const activated: string[] = []
    for (const [platform, factory] of this.factories) {
      if (this.adapters.has(platform)) continue
      try {
        const adapter = factory()
        if (adapter) {
          this.adapters.set(platform, adapter)
          // hub 给 adapter 注册一个转发器，把入站消息 fan-out 到所有 handlers
          adapter.onMessage(async (msg) => {
            await this.dispatch(msg)
          })
          activated.push(platform)
        }
      } catch (err) {
        console.error(`[ChannelHub] factory for "${platform}" threw:`, err instanceof Error ? err.message : err)
      }
    }
    return activated
  }

  /** 启动所有已发现的 adapter */
  async startAll(): Promise<string[]> {
    const newlyDiscovered = this.discover()
    for (const [platform, adapter] of this.adapters) {
      if (adapter.isRunning) continue
      try {
        await adapter.start()
        console.log(`[ChannelHub] ${platform} started`)
      } catch (err) {
        console.error(`[ChannelHub] failed to start ${platform}:`, err instanceof Error ? err.message : err)
        this.adapters.delete(platform)
      }
    }
    return newlyDiscovered
  }

  /** 停止所有 adapter */
  async stopAll(): Promise<void> {
    for (const [platform, adapter] of this.adapters) {
      try {
        await adapter.stop()
        console.log(`[ChannelHub] ${platform} stopped`)
      } catch (err) {
        console.error(`[ChannelHub] error stopping ${platform}:`, err instanceof Error ? err.message : err)
      }
    }
  }

  /**
   * 给指定平台的指定用户发消息。
   * @returns true 表示发送成功
   */
  async reply(
    platform: string,
    platformUserId: string,
    text: string,
    platformChatId?: string,
  ): Promise<boolean> {
    const adapter = this.adapters.get(platform)
    if (!adapter) {
      console.warn(`[ChannelHub] no active adapter for platform "${platform}"`)
      this.emitReceipt("failed", platform, platformUserId, text, "no-adapter")
      return false
    }

    const msg: OutgoingMessage = { platformUserId, text, platformChatId }
    try {
      const ok = await adapter.send(msg)
      this.emitReceipt(ok ? "sent" : "failed", platform, platformUserId, text, ok ? undefined : "adapter-returned-false")
      return ok
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`[ChannelHub] send failed on ${platform}:`, errMsg)
      this.emitReceipt("failed", platform, platformUserId, text, errMsg)
      return false
    }
  }

  /** 内部：发送出站回执到 sink（如有）。不抛错，避免回执本身影响主流程。 */
  private emitReceipt(
    kind: ChannelOutboundEvent["kind"],
    platform: string,
    platformUserId: string,
    text: string,
    error?: string,
  ): void {
    if (!this.eventSink) return
    const event: ChannelOutboundEvent = {
      kind,
      platform,
      platformUserId,
      textSnippet: text.slice(0, 80),
      timestamp: new Date().toISOString(),
      ...(error ? { error } : {}),
    }
    Promise.resolve(this.eventSink(event)).catch(err =>
      console.error("[ChannelHub] eventSink threw:", err instanceof Error ? err.message : err),
    )
  }

  /** 广播到所有平台的指定用户（通常用于主动推送，跨平台同步） */
  async broadcast(platformUserId: string, text: string): Promise<string[]> {
    const sentTo: string[] = []
    for (const platform of this.adapters.keys()) {
      const ok = await this.reply(platform, platformUserId, text)
      if (ok) sentTo.push(platform)
    }
    return sentTo
  }

  /** 内部：把入站消息 fan-out 到所有 handlers，错误隔离 */
  private async dispatch(msg: IncomingMessage): Promise<void> {
    // 补全时间戳
    if (!msg.timestamp) msg.timestamp = new Date().toISOString()

    // 更新最后活跃时间（不阻塞主流程）
    this.router.touch(msg.platform, msg.platformUserId).catch(() => {})

    for (const handler of this.handlers) {
      try {
        await handler(msg)
      } catch (err) {
        console.error(
          `[ChannelHub] handler threw on ${msg.platform}:${msg.platformUserId}:`,
          err instanceof Error ? err.message : err,
        )
      }
    }
  }
}
