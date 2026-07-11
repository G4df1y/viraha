// Channel adapter ports — moved from packages/channels

export interface InboundMessage {
  id: string
  channel: string
  userId: string
  userName: string
  content: string
  images?: string[]
  timestamp: Date
}

export interface OutboundMessage {
  target: string
  content: string
}

export type MessageHandler = (msg: InboundMessage) => Promise<string | void>

export interface ChannelAdapter {
  readonly name: string
  start(handler: MessageHandler): Promise<void>
  stop(): Promise<void>
}

export interface ChannelAdapterConfig {
  adapter: ChannelAdapter
  processMessage: (userId: string, channel: string, content: string) => Promise<string>
}

export async function runAdapter(config: ChannelAdapterConfig) {
  await config.adapter.start(async (msg) => {
    try {
      return await config.processMessage(msg.userId, msg.channel, msg.content)
    } catch (err: any) {
      return `Sorry, I encountered an error: ${err.message}`
    }
  })
}
