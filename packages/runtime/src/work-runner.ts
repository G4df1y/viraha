import { TurnQueue } from "./queue.js"

export interface WorkInput {
  userId: string
  channel: string
  content: string
  images?: string[]
}

export interface AgentWorkRunnerConfig {
  concurrency?: number
}

export class AgentWorkRunner {
  private queue: TurnQueue

  constructor(config: AgentWorkRunnerConfig = {}) {
    this.queue = new TurnQueue(config.concurrency ?? 4)
  }

  run<T>(input: WorkInput, handler: () => Promise<T>): Promise<T> {
    return this.queue.enqueue(
      this.laneKey(input),
      { content: input.content, images: input.images },
      "steer",
      handler,
    )
  }

  interrupt<T>(input: WorkInput, handler: () => Promise<T>): Promise<T> {
    return this.queue.enqueue(
      this.laneKey(input),
      { content: input.content, images: input.images },
      "interrupt",
      handler,
    )
  }

  private laneKey(input: Pick<WorkInput, "userId" | "channel">): string {
    return `${input.channel}:${input.userId}`
  }
}
