import type { LLMProvider, ChatParams, ChatResponse, ChatChunk, EmbeddingResult, ProviderConfig } from "./types.js"

export class AnthropicProvider implements LLMProvider {
  name = "anthropic"
  private apiKey: string
  private baseUrl: string

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1"
  }

  private buildMessages(params: ChatParams) {
    const systemMsg = params.messages.find(m => m.role === "system")
    const nonSystem = params.messages.filter(m => m.role !== "system")

    return {
      system: systemMsg?.content,
      messages: nonSystem.map(m => ({
        role: m.role,
        content: m.content,
      })),
    }
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const { system, messages } = this.buildMessages(params)
    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      messages,
    }
    if (system) body.system = system
    if (params.temperature !== undefined) body.temperature = params.temperature
    if (params.tools?.length) {
      body.tools = params.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }))
    }

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Anthropic API error (${res.status}): ${err}`)
    }

    const data = await res.json() as {
      content: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown>; id?: string }>
      usage: { input_tokens: number; output_tokens: number }
      stop_reason: string
    }

    const toolCalls = data.content
      .filter(c => c.type === "tool_use")
      .map(c => ({ id: c.id!, name: c.name!, arguments: c.input! }))

    const textContent = data.content
      .filter(c => c.type === "text")
      .map(c => c.text)
      .join("")

    return {
      content: textContent,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      finishReason: data.stop_reason === "end_turn" ? "stop" : data.stop_reason === "tool_use" ? "tool_use" : "stop",
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    }
  }

  async *chatStream(params: ChatParams): AsyncIterable<ChatChunk> {
    const { system, messages } = this.buildMessages(params)
    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      messages,
      stream: true,
    }
    if (system) body.system = system
    if (params.temperature !== undefined) body.temperature = params.temperature
    if (params.tools?.length) {
      body.tools = params.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }))
    }

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Anthropic stream error (${res.status}): ${err}`)
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
            type: string
            delta?: { text?: string }
            content_block?: { type: string; id?: string; name?: string; input?: Record<string, unknown> }
            message?: { usage?: { input_tokens: number; output_tokens: number }; stop_reason?: string }
          }

          if (event.type === "content_block_delta" && event.delta?.text) {
            yield { content: event.delta.text }
          }
          if (event.type === "message_delta" && event.delta) {
            if (event.message?.usage) {
              yield {
                content: "",
                finishReason: event.message.stop_reason === "end_turn" ? "stop" : "tool_use",
                usage: {
                  inputTokens: event.message.usage.input_tokens,
                  outputTokens: event.message.usage.output_tokens,
                },
              }
            }
          }
        } catch {
          // skip parse errors
        }
      }
    }
  }

  async embed(_texts: string[]): Promise<EmbeddingResult[]> {
    throw new Error("Anthropic does not support embeddings")
  }
}

