import { z } from "zod"

export interface ModelInfo {
  id: string
  provider: string
  capabilities: string[]
  contextWindow: number
}

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface ChatParams {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  tools?: ToolDefinition[]
}

export interface ChatChunk {
  content: string
  toolCalls?: Array<{ id: string; name: string; arguments: string }>
  finishReason?: "stop" | "tool_use" | "length"
  usage?: { inputTokens: number; outputTokens: number }
}

export interface ChatResponse {
  content: string
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
  finishReason: "stop" | "tool_use" | "length"
  usage: { inputTokens: number; outputTokens: number }
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface EmbeddingResult {
  embedding: number[]
  model: string
}

export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  defaultModel?: string
}

export interface LLMProvider {
  name: string
  chat(params: ChatParams): Promise<ChatResponse>
  chatStream(params: ChatParams): AsyncIterable<ChatChunk>
  embed?(texts: string[]): Promise<EmbeddingResult[]>
}

