import { performance } from "node:perf_hooks"
import { createInstant, type Clock, type Instant } from "@viraha/companion-core"

export class NodeClock implements Clock {
  now(): Instant {
    return createInstant(Date.now(), "server")
  }

  monotonicMs(): number {
    return performance.now()
  }
}
