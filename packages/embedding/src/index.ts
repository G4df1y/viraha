import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers"
import type { EmbeddingResult } from "@viraha/provider"

export interface EmbedProvider {
  name: string
  embed(texts: string[]): Promise<EmbeddingResult[]>
}

const MODEL_ID = "Xenova/bge-small-zh-v1.5"

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "feature-extraction",
      MODEL_ID,
    ) as unknown as Promise<FeatureExtractionPipeline>
  }
  return extractorPromise
}

export class LocalEmbedProvider implements EmbedProvider {
  readonly name = "bge-small-zh"

  async embed(texts: string[]): Promise<EmbeddingResult[]> {
    const extractor = await getExtractor()
    const results: EmbeddingResult[] = []

    for (const text of texts) {
      const output = await extractor(text, { pooling: "mean", normalize: true })
      const data = (output as { data?: unknown }).data
      results.push({
        embedding: Array.from(data as Float32Array),
        model: MODEL_ID,
      })
    }

    return results
  }
}
