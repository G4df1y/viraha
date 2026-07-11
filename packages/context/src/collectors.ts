import { ContextBuilder } from "./builder.js"
import type { ContextCollector, CollectorContext, CollectorResult } from "./types.js"
import type { KnowledgeEngine } from "@viraha/knowledge"
import type { EmbedProvider } from "@viraha/embedding"

export function createKnowledgeCollector(
  knowledge: KnowledgeEngine,
  embed?: EmbedProvider,
  packName?: string
): ContextCollector {
  return {
    name: "knowledge",
    priority: 40,
    collect: async (ctx: CollectorContext): Promise<CollectorResult> => {
      if (!ctx.input || ctx.input.length < 5) {
        return { content: "", tokens: 0 }
      }

      const results = await knowledge.search({
        query: ctx.input,
        packName,
        maxResults: 3,
      }, embed)

      if (results.length === 0) return { content: "", tokens: 0 }

      const content = results.map(r =>
        `[${r.sourceFile.replace(".md", "")}] ${r.heading}:\n${r.content}`
      ).join("\n\n")

      return { content, tokens: Math.ceil(content.length / 3.5) }
    },
  }
}

export function createMemoryCollector(): ContextCollector {
  return {
    name: "memories",
    priority: 50,
    collect: async (ctx: CollectorContext): Promise<CollectorResult> => {
      return { content: "", tokens: 0 }
    },
  }
}


