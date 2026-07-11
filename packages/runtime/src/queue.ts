type QueueMode = "steer" | "followup" | "interrupt"

interface QueueItem {
  laneKey: string
  input: { content: string; images?: string[] }
  mode: QueueMode
  handler: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

export class TurnQueue {
  private queues = new Map<string, QueueItem[]>()
  private activeLanes = new Set<string>()
  private globalConcurrency: number
  private activeCount = 0

  constructor(concurrency = 4) {
    this.globalConcurrency = concurrency
  }

  enqueue<T>(
    laneKey: string,
    input: { content: string; images?: string[] },
    mode: QueueMode,
    handler: () => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.queues.has(laneKey)) {
        this.queues.set(laneKey, [])
      }

      const queue = this.queues.get(laneKey)!

      if (mode === "interrupt") {
        const interrupted = queue.splice(0)
        for (const item of interrupted) {
          item.reject(new Error(`Queue item interrupted for lane ${laneKey}`))
        }
      }

      const item: QueueItem = {
        laneKey,
        input,
        mode,
        handler,
        resolve: value => resolve(value as T),
        reject,
      }

      if (mode === "interrupt") {
        queue.unshift(item)
      } else {
        queue.push(item)
      }

      this.processNext()
    })
  }

  private processNext(): void {
    while (this.activeCount < this.globalConcurrency) {
      const next = this.takeNextReadyItem()
      if (!next) return

      void this.runItem(next.laneKey, next.item)
    }
  }

  private takeNextReadyItem(): { laneKey: string; item: QueueItem } | undefined {
    for (const [laneKey, items] of this.queues) {
      if (items.length === 0) {
        this.queues.delete(laneKey)
        continue
      }

      if (this.activeLanes.has(laneKey)) continue

      const item = items.shift()!
      if (items.length === 0) this.queues.delete(laneKey)
      return { laneKey, item }
    }

    return undefined
  }

  private async runItem(laneKey: string, item: QueueItem): Promise<void> {
    this.activeCount++
    this.activeLanes.add(laneKey)

    try {
      item.resolve(await item.handler())
    } catch (err) {
      item.reject(err)
    } finally {
      this.activeCount--
      this.activeLanes.delete(laneKey)
      this.processNext()
    }
  }
}
