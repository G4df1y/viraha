import { describe, expect, it } from "vitest"
import { TurnQueue } from "../src/queue.js"

describe("TurnQueue", () => {
  it("resolves with the handler result", async () => {
    const queue = new TurnQueue(1)

    await expect(queue.enqueue("lane-a", { content: "hello" }, "steer", async () => "done")).resolves.toBe("done")
  })

  it("runs jobs from the same lane sequentially", async () => {
    const queue = new TurnQueue(2)
    const first = deferred<void>()
    const order: string[] = []

    const firstJob = queue.enqueue("same", { content: "1" }, "steer", async () => {
      order.push("first:start")
      await first.promise
      order.push("first:end")
      return "first"
    })

    const secondJob = queue.enqueue("same", { content: "2" }, "steer", async () => {
      order.push("second:start")
      return "second"
    })

    await tick()
    expect(order).toEqual(["first:start"])

    first.resolve()
    await expect(firstJob).resolves.toBe("first")
    await expect(secondJob).resolves.toBe("second")
    expect(order).toEqual(["first:start", "first:end", "second:start"])
  })

  it("runs jobs from different lanes concurrently up to global concurrency", async () => {
    const queue = new TurnQueue(2)
    const release = deferred<void>()
    const starts: string[] = []

    const a = queue.enqueue("a", { content: "a" }, "steer", async () => {
      starts.push("a")
      await release.promise
      return "a"
    })
    const b = queue.enqueue("b", { content: "b" }, "steer", async () => {
      starts.push("b")
      await release.promise
      return "b"
    })
    const c = queue.enqueue("c", { content: "c" }, "steer", async () => {
      starts.push("c")
      return "c"
    })

    await tick()
    expect(starts.sort()).toEqual(["a", "b"])

    release.resolve()
    await expect(Promise.all([a, b, c])).resolves.toEqual(["a", "b", "c"])
    expect(starts).toContain("c")
  })

  it("rejects failed jobs and keeps processing later jobs", async () => {
    const queue = new TurnQueue(1)

    const failed = queue.enqueue("same", { content: "bad" }, "steer", async () => {
      throw new Error("boom")
    })
    const next = queue.enqueue("same", { content: "good" }, "steer", async () => "ok")

    await expect(failed).rejects.toThrow("boom")
    await expect(next).resolves.toBe("ok")
  })

  it("interrupt clears pending jobs in the lane", async () => {
    const queue = new TurnQueue(1)
    const release = deferred<void>()
    const order: string[] = []

    const running = queue.enqueue("same", { content: "running" }, "steer", async () => {
      order.push("running")
      await release.promise
      return "running"
    })
    const pending = queue.enqueue("same", { content: "pending" }, "followup", async () => {
      order.push("pending")
      return "pending"
    })
    const pendingResult = pending.then(
      value => ({ status: "fulfilled" as const, value }),
      error => ({ status: "rejected" as const, error }),
    )
    const interrupt = queue.enqueue("same", { content: "interrupt" }, "interrupt", async () => {
      order.push("interrupt")
      return "interrupt"
    })

    await tick()
    release.resolve()

    await expect(running).resolves.toBe("running")
    await expect(pendingResult).resolves.toMatchObject({
      status: "rejected",
      error: expect.objectContaining({ message: expect.stringContaining("interrupted") }),
    })
    await expect(interrupt).resolves.toBe("interrupt")
    expect(order).toEqual(["running", "interrupt"])
  })
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}
