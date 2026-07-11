import { EventBus, SessionManager, TurnQueue } from "./index.js"
import type { TurnInput, MemoryPort, CompanionPort, ContextPort, EventEnvelope } from "@viraha/core"
import type { ProviderRegistry, ToolDefinition } from "@viraha/provider"

export type ToolHandler = (name: string, args: Record<string, unknown>, userId: string) => Promise<{ content: string; isError?: boolean }>

export interface RuntimeConfig {
  providerRegistry: ProviderRegistry
  model: string
  memory: MemoryPort
  companion: CompanionPort
  context: ContextPort
  tools?: ToolDefinition[]
  handleToolCall?: ToolHandler
}

export class Runtime {
  public events: EventBus
  public sessions: SessionManager
  public queue: TurnQueue
  private config!: RuntimeConfig
  private static idCounter = 0

  private nextId(): string { return `evt_${Date.now()}_${++Runtime.idCounter}` }

  constructor() {
    this.events = new EventBus()
    this.sessions = new SessionManager()
    this.queue = new TurnQueue()
  }

  async start(config: RuntimeConfig) {
    this.config = config
  }

  async runTurn(externalId: string, input: TurnInput): Promise<string> {
    const provider = this.config.providerRegistry.resolve(this.config.model)
    const correlationId = crypto.randomUUID()
    const { memory, companion, context } = this.config

    // 1. Ensure user exists
    const internalUserId = await memory.getOrCreateUser(externalId, input.channel, externalId)

    // 2. Get/create session
    const { id: sessionId } = await this.sessions.getOrCreateSession(internalUserId, input.channel)

    // 3. Emit UserMessageReceived
    await this.events.emit({
      id: this.nextId(), type: "UserMessageReceived", source: "runtime",
      timestamp: new Date().toISOString(), correlationId,
      payload: { userId: internalUserId, content: input.content, channel: input.channel },
      metadata: { userId: internalUserId, sessionId, priority: "normal" },
    })

    // 4. Assemble context
    await this.events.emit({
      id: this.nextId(), type: "AgentThinking", source: "runtime",
      timestamp: new Date().toISOString(), correlationId,
      payload: { phase: "context", userId: internalUserId },
      metadata: { userId: internalUserId, sessionId, priority: "normal" },
    })

    const assembled = await context.assemble(internalUserId, sessionId, input.content)
    const history = await this.sessions.getSessionMessages(sessionId)

    const messages = [
      { role: "system" as const, content: assembled.systemPrompt },
      ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: input.content },
    ]

    await this.sessions.storeMessage(sessionId, "user", input.content)

    // 5. LLM call with tool loop
    const tools = this.config.tools ?? []
    let finalContent = ""
    let iteration = 0
    const maxIterations = 5

    while (iteration < maxIterations) {
      await this.events.emit({
        id: this.nextId(), type: "AgentThinking", source: "runtime",
        timestamp: new Date().toISOString(), correlationId,
        payload: { phase: "llm_call", iteration },
        metadata: { userId: internalUserId, sessionId, priority: "normal" },
      })

      const result = await provider.chat({
        model: this.config.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      })

      if (result.toolCalls && result.toolCalls.length > 0 && this.config.handleToolCall) {
        await this.events.emit({
          id: this.nextId(), type: "ToolCalled", source: "viraha-runtime",
          timestamp: new Date().toISOString(), correlationId,
          payload: { toolCalls: result.toolCalls },
          metadata: { userId: internalUserId, sessionId, priority: "normal" },
        })

        await this.sessions.storeMessage(sessionId, "assistant", result.content, {
          toolCalls: JSON.stringify(result.toolCalls),
          tokens: result.usage.outputTokens,
        })

        let toolResults = ""
        for (const tc of result.toolCalls) {
          try {
            const toolResult = await this.config.handleToolCall(tc.name, tc.arguments, internalUserId)
            toolResults += `\n[Tool: ${tc.name}] Result: ${toolResult.content}`
            if (toolResult.isError) {
              await this.events.emit({
                id: this.nextId(), type: "ToolFailed", source: "runtime",
                timestamp: new Date().toISOString(), correlationId,
                payload: { toolName: tc.name, error: toolResult.content },
                metadata: { userId: internalUserId, sessionId, priority: "high" },
              })
            }
          } catch (err: any) {
            toolResults += `\n[Tool: ${tc.name}] Error: ${err.message}`
            await this.events.emit({
              id: this.nextId(), type: "ToolFailed", source: "runtime",
              timestamp: new Date().toISOString(), correlationId,
              payload: { toolName: tc.name, error: err.message },
              metadata: { userId: internalUserId, sessionId, priority: "high" },
            })
          }
        }

        messages.push({ role: "assistant", content: result.content })
        messages.push({ role: "user", content: `Tool results:${toolResults}` })
        finalContent = result.content
        iteration++
      } else {
        finalContent = result.content
        await this.sessions.storeMessage(sessionId, "assistant", result.content, {
          tokens: result.usage.outputTokens,
        })
        break
      }
    }

    // 6. Emit AgentResponseSent
    await this.events.emit({
      id: this.nextId(), type: "AgentResponseSent", source: "runtime",
      timestamp: new Date().toISOString(), correlationId,
      payload: { reply: finalContent, input: input.content, sessionId },
      metadata: { userId: internalUserId, sessionId, priority: "normal" },
    })

    // 7. Update relationship + reflection via events (async, non-blocking)
    companion.recordInteraction(internalUserId)
    companion.addXp(internalUserId, 3)

    return finalContent
  }
}

import crypto from "crypto"


