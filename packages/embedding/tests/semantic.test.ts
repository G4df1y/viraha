import { describe, it, expect } from "vitest"
import { LocalEmbedProvider } from "../src/index.js"

function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

describe("LocalEmbedProvider semantic recall", () => {
  it("produces normalized vectors and ranks synonyms above unrelated text", async () => {
    const provider = new LocalEmbedProvider()
    // 单次 embed 调用会触发模型下载（~60MB），后续调用复用缓存
    const [probe] = await provider.embed(["测试句子"])

    // 1. 向量维度合理 + L2 归一化（bge-small-zh 是 512 维）
    expect(probe.embedding.length).toBeGreaterThan(100)
    const norm = Math.sqrt(probe.embedding.reduce((s, v) => s + v * v, 0))
    expect(norm).toBeGreaterThan(0.99)
    expect(norm).toBeLessThan(1.01)

    // 2. 语义召回：同义词查询应比无关查询相似度更高
    const [memory] = await provider.embed(["我深蹲的时候右膝盖会疼"])
    const [synonym] = await provider.embed(["最近髌骨有点不适"]) // 髌骨 = 膝盖解剖学术语，关键词完全不同
    const [unrelated] = await provider.embed(["今天天气真不错"])

    const synonymSim = cosine(memory.embedding, synonym.embedding)
    const unrelatedSim = cosine(memory.embedding, unrelated.embedding)

    console.log(`膝盖疼 vs 髌骨不适: ${synonymSim.toFixed(4)}`)
    console.log(`膝盖疼 vs 今天天气: ${unrelatedSim.toFixed(4)}`)

    expect(synonymSim).toBeGreaterThan(unrelatedSim)
    expect(synonymSim).toBeGreaterThan(0.5) // 同义应足够相似
  }, 120000)
})
