import type { Clock } from "@viraha/companion-core"
import type { EventEnvelope } from "@viraha/core"
import { EventStore } from "./event-store.js"
import { NodeClock } from "./node-clock.js"

type EventHandler = (event: EventEnvelope) => void | Promise<void>

interface TimedEvent extends EventEnvelope {
  _receivedAt: number
  _processingMs: number
}

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>()
  private history: TimedEvent[] = []
  private store?: EventStore
  private persistFilter: Set<string> = new Set()

  constructor(private readonly clock: Clock = new NodeClock()) {}

  useStore(store: EventStore, persistTypes?: string[]) {
    this.store = store
    if (persistTypes) persistTypes.forEach(t => this.persistFilter.add(t))
  }

  on(event: string, handler: EventHandler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  async emit(event: EventEnvelope) {
    const receivedAt = this.clock.now()
    const startedAt = this.clock.monotonicMs()
    const timed = event as TimedEvent
    timed._receivedAt = receivedAt.epochMs
    this.history.push(timed)

    if (this.store && (this.persistFilter.has(event.type) || this.persistFilter.size === 0)) {
      await this.store.persist(event)
    }

    const handlers = this.handlers.get(event.type)
    if (handlers) {
      await Promise.all(
        Array.from(handlers).map(h =>
          Promise.resolve(h(event)).catch(err =>
            console.error(`[EventBus] ${event.type}:`, err)
          )
        )
      )
    }

    timed._processingMs = this.clock.monotonicMs() - startedAt
  }

  getHistory(filter?: { type?: string; userId?: string; limit?: number }): TimedEvent[] {
    let result = this.history
    if (filter?.type) result = result.filter(e => e.type === filter.type)
    if (filter?.userId) result = result.filter(e => e.metadata.userId === filter.userId)
    if (filter?.limit) result = result.slice(-filter.limit)
    return result
  }

  getMetrics() {
    const byType = new Map<string, { count: number; totalMs: number; avgMs: number }>()
    for (const event of this.history) {
      const existing = byType.get(event.type) ?? { count: 0, totalMs: 0, avgMs: 0 }
      existing.count++
      existing.totalMs += event._processingMs ?? 0
      existing.avgMs = Math.round(existing.totalMs / existing.count)
      byType.set(event.type, existing)
    }

    const traces = this.history.slice(-50).map(e => ({
      type: e.type,
      source: e.source,
      ms: e._processingMs,
      at: new Date(e._receivedAt).toISOString().substring(11, 23),
    }))

    return {
      total: this.history.length,
      byType: Object.fromEntries(byType),
      recent: traces,
    }
  }

  removeAll() {
    this.handlers.clear()
  }
}
