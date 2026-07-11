import type { ChannelAdapter, IncomingMessage, MessageHandler, OutgoingMessage } from "./types.js"

/**
 * Base class for channel adapters.
 *
 * Subclasses implement platform-specific start/stop/send behavior and call
 * emit() when they receive a normalized inbound message.
 */
export abstract class BaseAdapter implements ChannelAdapter {
  abstract readonly platform: string

  private _isRunning = false
  private handlers: MessageHandler[] = []

  get isRunning(): boolean {
    return this._isRunning
  }

  async start(): Promise<void> {
    if (this._isRunning) return
    await this.doStart()
    this._isRunning = true
  }

  async stop(): Promise<void> {
    if (!this._isRunning) return
    await this.doStop()
    this._isRunning = false
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler)
  }

  abstract send(message: OutgoingMessage): Promise<boolean>

  protected async emit(msg: IncomingMessage): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(msg)
      } catch (err) {
        console.error(
          `[${this.platform}] handler threw:`,
          err instanceof Error ? err.message : err,
        )
      }
    }
  }

  protected abstract doStart(): Promise<void> | void
  protected abstract doStop(): Promise<void> | void
}
