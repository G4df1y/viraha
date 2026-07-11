import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

import { AgentPipeline } from "@viraha/runtime"
import type { ChatChunk, ChatParams, ChatResponse, LLMProvider } from "@viraha/provider"
import { ARETE_IDENTITY } from "../src/identity.js"

const here = dirname(fileURLToPath(import.meta.url))
// Dataset name comes from argv (e.g. `tsx run-evals.ts crisis`), default "smoke".
// Each dataset lives at ../evals/<name>.json and uses the same mustContain /
// mustNotContain schema, so hard-boundary crisis scenarios reuse this runner.
const datasetName = process.argv[2] ?? "smoke"
const datasetPath = join(here, "..", "evals", `${datasetName}.json`)
const dataset = JSON.parse(readFileSync(datasetPath, "utf8")) as Array<{
  name: string
  input: string
  mustContain: string[]
  mustNotContain: string[]
}>

const MOCK_REPLY =
  "For your knee, a 30 minute low-impact session works. Aim for enough protein and don't skip meals."

function mockLlm(): LLMProvider {
  return {
    name: "mock",
    async chat(_params: ChatParams): Promise<ChatResponse> {
      return {
        content: MOCK_REPLY,
        finishReason: "stop",
        toolCalls: [],
        usage: { inputTokens: 1, outputTokens: 1 },
      }
    },
    async *chatStream(): AsyncIterable<ChatChunk> {},
  }
}

async function realLlm(): Promise<LLMProvider> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!deepseekKey && !anthropicKey) {
    throw new Error("EVAL_REAL_PROVIDER=1 requires DEEPSEEK_API_KEY or ANTHROPIC_API_KEY to be set.")
  }
  const { ProviderRegistry, DeepSeekProvider, AnthropicProvider } = await import("@viraha/provider")
  const registry = new ProviderRegistry()
  const model = process.env.DEFAULT_MODEL ?? "deepseek-chat"
  if (deepseekKey) registry.register("deepseek", new DeepSeekProvider({ apiKey: deepseekKey }), ["deepseek-chat", "deepseek-reasoner"])
  if (anthropicKey) registry.register("anthropic", new AnthropicProvider({ apiKey: anthropicKey }), ["claude-3-5-sonnet-latest"])
  return registry.resolve(model)
}

async function main() {
  const useReal = process.env.EVAL_REAL_PROVIDER === "1"
  const llm = useReal ? await realLlm() : mockLlm()

  const pipeline = new AgentPipeline({
    identity: ARETE_IDENTITY,
    model: useReal ? (process.env.DEFAULT_MODEL ?? "deepseek-chat") : "mock-model",
    llm,
  })

  const failures: string[] = []

  for (const item of dataset) {
    const result = await pipeline.process({ message: item.input, userId: `eval-${item.name}` })
    const reply = (result.reply ?? "").toLowerCase()

    for (const token of item.mustContain) {
      if (!reply.includes(token.toLowerCase())) {
        failures.push(`[${item.name}] missing required token "${token}" (reply: "${result.reply}")`)
      }
    }
    for (const token of item.mustNotContain) {
      if (reply.includes(token.toLowerCase())) {
        failures.push(`[${item.name}] contained forbidden token "${token}" (reply: "${result.reply}")`)
      }
    }
  }

  if (failures.length > 0) {
    console.error(`${datasetName.toUpperCase()} EVAL FAILED:`)
    for (const f of failures) console.error("  - " + f)
    console.error(`${failures.length} check(s) failed across ${dataset.length} case(s).`)
    process.exit(1)
  }

  console.log(`${datasetName.toUpperCase()} EVAL PASSED: ${dataset.length} case(s) passed all checks.`)
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
