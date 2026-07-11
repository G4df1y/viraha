/**
 * Channel primitives.
 *
 * A ChannelAdapter is one bidirectional transport for a platform such as web,
 * Feishu, QQ, Telegram, or Discord. Adapters normalize inbound messages into
 * IncomingMessage and send OutgoingMessage back to the platform. They do not
 * know about internal Viraha user ids; ChannelHub and ChannelRouter own that.
 */

export interface IncomingMessage {
  /** Platform id, for example "web", "feishu", or "qq". */
  platform: string
  /** Platform-side user id, for example open_id, chat_id, or user_id. */
  platformUserId: string
  /** Normalized text content. */
  text: string
  /** Raw platform event for debugging. Companion logic should not depend on it. */
  raw?: unknown
  /** Optional platform conversation id, such as a group chat id. */
  platformChatId?: string
  /** ISO timestamp. ChannelHub fills this when an adapter omits it. */
  timestamp?: string
}

export interface OutgoingMessage {
  /** Platform-side target user id. */
  platformUserId: string
  /** Text content to send. */
  text: string
  /** Optional platform conversation context. */
  platformChatId?: string
}

export type MessageHandler = (msg: IncomingMessage) => Promise<void>

export interface ChannelAdapter {
  readonly platform: string
  start(): Promise<void> | void
  stop(): Promise<void> | void
  onMessage(handler: MessageHandler): void
  send(message: OutgoingMessage): Promise<boolean>
  readonly isRunning: boolean
}

export type ChannelAdapterFactory = () => ChannelAdapter | null

/**
 * Outbound receipt emitted by ChannelHub.reply() after a send attempt.
 *
 * The hub owns transport; it does not know about the runtime's EventEnvelope
 * (that would create a workspace cycle). Arete adapts this into EventStore
 * entries (ChannelMessageSent / ChannelSendFailed) so failures surface in Trace.
 */
export interface ChannelOutboundEvent {
  kind: "sent" | "failed"
  platform: string
  platformUserId: string
  /** First 80 chars of the reply text — enough to correlate in Trace, not a full transcript. */
  textSnippet: string
  /** Present only when kind === "failed". */
  error?: string
  timestamp: string
}

export type ChannelEventSink = (event: ChannelOutboundEvent) => void | Promise<void>
