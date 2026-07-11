import { describe, expect, it } from "vitest"
import { AgentWorkRunner } from "../src/work-runner.js"

describe("AgentWorkRunner", () => {
  it("serializes work for the same user and channel", async () => {
    const runner = new AgentWorkRunner({ concurrency: 2 })
    const release = deferred<void>()
    const order: string[] = []

    const first = runner.run({ userId: "u1", channel: "web", content: "first" }, async () => {
      order.push("first:start")
      await release.promise
      order.push("first:end")
      return "first"
    })
    const second = runner.run({ userId: "u1", channel: "web", content: "second" }, async () => {
      order.push("second:start")
      return "second"
    })

    await tick()
    expect(order).toEqual(["first:start"])

    release.resolve()
    await expect(first).resolves.toBe("first")
    await expect(second).resolves.toBe("second")
    expect(order).toEqual(["first:start", "first:end", "second:start"])
  })

  it("allows different users to run concurrently", async () => {
    const runner = new AgentWorkRunner({ concurrency: 2 })
    const release = deferred<void>()
    const starts: string[] = []

    const first = runner.run({ userId: "u1", channel: "web", content: "first" }, async () => {
      starts.push("u1")
      await release.promise
      return "u1"
    })
    const second = runner.run({ userId: "u2", channel: "web", content: "second" }, async () => {
      starts.push("u2")
      await release.promise
      return "u2"
    })

    await tick()
    expect(starts.sort()).toEqual(["u1", "u2"])

    release.resolve()
    await expect(Promise.all([first, second])).resolves.toEqual(["u1", "u2"])
  })
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}
