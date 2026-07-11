import type { LLMProvider, ChatParams, ChatResponse, ChatChunk, EmbeddingResult, ProviderConfig } from "./types.js"

export class DeepSeekProvider implements LLMProvider {
  name = "deepseek"
  private apiKey: string
  private baseUrl: string

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl ?? "https://api.deepseek.com/v1"
  }

  private buildMessages(params: ChatParams) {
    return params.messages.map(m => ({
      role: m.role,
      content: m.content,
    }))
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      messages: this.buildMessages(params),
    }
    if (params.temperature !== undefined) body.temperature = params.temperature
    if (params.tools?.length) {
      body.tools = params.tools.map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }))
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`DeepSeek API error (${res.status}): ${err}`)
    }

    const data = await res.json() as {
      choices: Array<{
        message: {
          content: string | null
          tool_calls?: Array<{
            id: string
            function: { name: string; arguments: string }
          }>
        }
        finish_reason: string
      }>
      usage: { prompt_tokens: number; completion_tokens: number }
    }

    const choice = data.choices[0]
    const toolCalls = choice.message.tool_calls?.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }))

    return {
      content: choice.message.content ?? "",
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      finishReason: choice.finish_reason === "tool_calls" ? "tool_use" : "stop",
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    }
  }

  async *chatStream(params: ChatParams): AsyncIterable<ChatChunk> {
    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      messages: this.buildMessages(params),
      stream: true,
    }
    if (params.temperature !== undefined) body.temperature = params.temperature

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`DeepSeek stream error (${res.status}): ${err}`)
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const jsonStr = line.slice(6).trim()
        if (!jsonStr || jsonStr === "[DONE]") continue

        try {
          const event = JSON.parse(jsonStr) as {
            choices: Array<{
              delta: { content?: string; tool_calls?: Array<unknown> }
              finish_reason?: string
            }>
            usage?: { prompt_tokens: number; completion_tokens: number }
          }

          const delta = event.choices?.[0]?.delta
          if (delta?.content) {
            yield { content: delta.content }
          }
          if (event.choices?.[0]?.finish_reason) {
            yield {
              content: "",
              finishReason: event.choices[0].finish_reason === "tool_calls" ? "tool_use" : "stop",
              usage: event.usage
                ? { inputTokens: event.usage.prompt_tokens, outputTokens: event.usage.completion_tokens }
                : undefined,
            }
          }
        } catch {
          // skip parse errors
        }
      }
    }
  }

  async embed(_texts: string[]): Promise<EmbeddingResult[]> {
    throw new Error("DeepSeek does not provide an embeddings API. Configure an embedding provider (e.g. OpenAI) to enable semantic search.")
  }
}

