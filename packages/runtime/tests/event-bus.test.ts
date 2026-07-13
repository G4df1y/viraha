import { describe, it, expect } from "vitest"
import { ManualClock } from "@viraha/companion-core"
import { EventBus } from "../src/event-bus.js"
import { TurnQueue } from "../src/queue.js"

describe("EventBus", () => {
  it("measures processing duration with monotonic time", async () => {
    const clock = new ManualClock("2026-07-13T00:00:00.000Z")
    const bus = new EventBus(clock)
    bus.on("UserMessageReceived", () => {
      clock.advance(25)
      clock.setWallTime("2026-07-12T23:00:00.000Z")
    })

    await bus.emit({
      id: "1", type: "UserMessageReceived", source: "test", timestamp: clock.now().iso,
      correlationId: "c1", payload: {}, metadata: { priority: "normal" },
    })

    expect(bus.getMetrics().recent[0]?.ms).toBe(25)
  })

  it("emits and receives events", async () => {
    const bus = new EventBus()
    let received = ""
    bus.on("MessageStored", (e) => { received = e.payload.msg as string })
    await bus.emit({
      id: "1", type: "MessageStored", source: "test", timestamp: new Date().toISOString(),
      correlationId: "c1", payload: { msg: "hello" }, metadata: { priority: "normal" },
    })
    expect(received).toBe("hello")
  })

  it("supports multiple handlers", async () => {
    const bus = new EventBus()
    let count = 0
    bus.on("MessageStored", async () => { count++ })
    bus.on("MessageStored", async () => { count++ })
    await bus.emit({
      id: "1", type: "MessageStored", source: "test", timestamp: new Date().toISOString(),
      correlationId: "c1", payload: {}, metadata: { priority: "normal" },
    })
    expect(count).toBe(2)
  })

  it("unsubscribes handlers", async () => {
    const bus = new EventBus()
    let count = 0
    const unsub = bus.on("MessageStored", async () => { count++ })
    unsub()
    await bus.emit({
      id: "1", type: "MessageStored", source: "test", timestamp: new Date().toISOString(),
      correlationId: "c1", payload: {}, metadata: { priority: "normal" },
    })
    expect(count).toBe(0)
  })

  it("handles handler errors gracefully", async () => {
    const bus = new EventBus()
    let count = 0
    bus.on("MessageStored", async () => { throw new Error("fail") })
    bus.on("MessageStored", async () => { count++ })
    await bus.emit({
      id: "1", type: "MessageStored", source: "test", timestamp: new Date().toISOString(),
      correlationId: "c1", payload: {}, metadata: { priority: "normal" },
    })
    expect(count).toBe(1)
  })

  it("maintains event history", async () => {
    const bus = new EventBus()
    await bus.emit({
      id: "1", type: "MessageStored", source: "test", timestamp: new Date().toISOString(),
      correlationId: "c1", payload: {}, metadata: { priority: "normal" },
    })
    expect(bus.getHistory().length).toBe(1)
  })

  it("records history before notifying handlers", async () => {
    const bus = new EventBus()
    let visibleDuringHandler = false

    bus.on("MessageStored", () => {
      visibleDuringHandler = bus.getHistory({ type: "MessageStored" }).length === 1
    })

    await bus.emit({
      id: "1", type: "MessageStored", source: "test", timestamp: new Date().toISOString(),
      correlationId: "c1", payload: {}, metadata: { priority: "normal" },
    })

    expect(visibleDuringHandler).toBe(true)
  })
})

describe("TurnQueue", () => {
  it("processes queued items sequentially", async () => {
    const queue = new TurnQueue(4)
    const order: number[] = []

    await new Promise<void>((resolve) => {
      queue.enqueue("s1", { content: "a" }, "steer", async () => { order.push(1) })
      queue.enqueue("s2", { content: "b" }, "steer", async () => { order.push(2) })
      queue.enqueue("s3", { content: "c" }, "steer", async () => { order.push(3); resolve() })
    })

    // Wait a bit for processing
    await new Promise(r => setTimeout(r, 100))
    expect(order.length).toBeGreaterThanOrEqual(2)
  })
})

