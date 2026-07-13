import { IdentityEngine, type IdentityConfig } from "@viraha/identity"
import type { Clock } from "@viraha/companion-core"
import { evaluateMathExpression } from "@viraha/core"
import { SkillRegistry, SkillExecutor, type SkillHandler, type SkillManifest } from "@viraha/skills"
import { MCPManager } from "@viraha/mcp"
import type { LLMProvider, ToolDefinition, ChatMessage } from "@viraha/provider"
import type { EventEnvelope, EventType } from "@viraha/core"
import { EventBus } from "./event-bus.js"
import { NodeClock } from "./node-clock.js"
import type { PluginRegistry } from "./plugins.js"
import { allowAllToolPolicy, type ToolPolicy } from "./tool-policy.js"
import { BoundaryScanner, hardBoundaryReply, softBoundaryReminder, type SafetyFlag } from "./boundary-scanner.js"
import crypto from "crypto"

interface AgentMemory {
  profile: {
    getOrCreateUser(externalId: string, channel: string, name: string): Promise<string>
    ensureUser?(userId: string, externalId: string, channel: string, name: string): Promise<string>
  }
  buildMemoryContext(userId: string, query?: string): Promise<string>
}

interface AgentReflection {
  reflect(userId: string, userMessage: string, assistantReply: string, llm: LLMProvider, model: string): Promise<void>
}

interface AgentCompanion {
  /** Inject relationship summary into the system prompt so the LLM adapts tone. */
  enrichPrompt(userId: string, basePrompt: string): Promise<string>
  /** Called after each successful turn — record interaction, add XP, etc. */
  onInteraction(userId: string): Promise<void>
}

/** 情绪层接口 —— 让 pipeline 不直接依赖 emotion 包 */
interface AgentEmotion {
  /** 从用户消息识别并记录情绪 */
  detectAndRecord(userId: string, message: string, source?: "inferred" | "explicit"): Promise<{ emotion: string; intensity: number } | null>
  /** 生成情绪上下文片段，注入 system prompt */
  buildEmotionContext(userId: string): Promise<string>
}

export type StreamEvent =
  | { type: "token"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "done"; reply: string; tokensUsed: number }
  | { type: "error"; message: string }

export interface AgentConfig {
  identity: IdentityConfig
  model: string
  llm: LLMProvider
  memory?: AgentMemory
  reflection?: AgentReflection
  companion?: AgentCompanion
  emotion?: AgentEmotion
  events?: EventBus
  plugins?: PluginRegistry
  toolPolicy?: ToolPolicy
  clock?: Clock
}

export interface AgentInput {
  message: string
  userId?: string
  userIdKind?: "external" | "internal"
  channel?: string
  history?: Array<{ role: string; content: string }>
  search?: (query: string) => Promise<string>
  /** Optional: retrieve relevant knowledge chunks and inject into context */
  knowledge?: (query: string) => Promise<string>
}

export interface AgentOutput {
  reply: string
  tokensUsed: number
  /**
   * Safety flags raised during this turn. Present when a boundary rule matched
   * the user's message. Hard flags mean the LLM was bypassed and a caring
   * redirect was returned instead; soft flags mean the LLM ran with a safety
   * reminder injected into the system prompt.
   */
  safetyFlags?: SafetyFlag[]
}

export class AgentPipeline {
  private identity: IdentityEngine
  private skills: SkillRegistry
  private skillExecutor: SkillExecutor
  private mcp: MCPManager
  private config: AgentConfig
  private boundaryScanner: BoundaryScanner
  private readonly clock: Clock
  private static eventCounter = 0

  constructor(config: AgentConfig) {
    this.config = config
    this.clock = config.clock ?? new NodeClock()
    this.identity = new IdentityEngine()
    this.skills = new SkillRegistry()
    this.skillExecutor = new SkillExecutor(this.skills)
    this.mcp = new MCPManager()
    this.boundaryScanner = new BoundaryScanner()
    this.identity.register(config.identity)
  }

  registerSkill(manifest: SkillManifest, handler: SkillHandler) {
    this.skills.register(manifest, handler)
  }

  get skillsRegistry() { return this.skills }
  get mcpManager() { return this.mcp }
  get identityEngine() { return this.identity }

  async process(input: AgentInput): Promise<AgentOutput> {
    const tokens = { total: 0 }
    let reply = ""
    const externalUserId = input.userId ?? "default"
    const channel = input.channel ?? "web"
    const userId = await this.resolveUserId(externalUserId, channel, input.userIdKind ?? "external")
    const correlationId = crypto.randomUUID()

    await this.emitEvent("UserMessageReceived", userId, correlationId, {
      channel,
      content: input.message,
      externalUserId,
      userIdKind: input.userIdKind ?? "external",
    })

    // ===== Safety boundary scan (transparent, rule-based — see boundary-scanner.ts) =====
    const safetyFlags = this.boundaryScanner.scan(input.message)
    const hardFlag = safetyFlags.find(f => f.level === "hard")
    if (hardFlag) {
      // Hard boundary: bypass the LLM so no dangerous actionable steps are
      // returned. Emit a high-priority safety event, then respond with a
      // caring, localized redirect that points to professional / emergency help.
      const redirect = hardBoundaryReply(input.message, safetyFlags) ?? ""
      await this.emitEvent("SafetyBoundaryTriggered", userId, correlationId, {
        level: "hard",
        flags: safetyFlags,
        bypassedLlm: true,
      }, "high")
      await this.emitEvent("AgentResponseSent", userId, correlationId, {
        reply: redirect,
        tokensUsed: 0,
        safetyBypass: true,
      })
      return { reply: redirect, tokensUsed: 0, safetyFlags }
    }
    if (safetyFlags.length > 0) {
      // Soft boundary: the LLM still runs, but a localized reminder is injected
      // into the system prompt so the model keeps an appropriate distance.
      await this.emitEvent("SafetyBoundaryTriggered", userId, correlationId, {
        level: "soft",
        flags: safetyFlags,
        bypassedLlm: false,
      }, "normal")
    }
    const safetyReminder = softBoundaryReminder(input.message, safetyFlags)

    // Build tool definitions
    const toolDefs = this.buildToolDefinitions()

    // 情绪识别：在构建上下文前识别本次消息情绪
    if (this.config.emotion) {
      try {
        await this.config.emotion.detectAndRecord(userId, input.message, "inferred")
      } catch {
        // 情绪识别失败不影响对话
      }
    }

    const messages = await this.buildMessages(input, userId, correlationId, safetyReminder)

    // First LLM call — with tools
    await this.emitEvent("AgentThinking", userId, correlationId, {
      phase: "llm_call",
      toolCount: toolDefs.length,
    })

    let result = await this.config.llm.chat({
      model: this.config.model,
      messages,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      temperature: 0.5,
      maxTokens: 2000,
    })

    tokens.total += result.usage.inputTokens + result.usage.outputTokens

    // Handle tool calls
    if (result.toolCalls && result.toolCalls.length > 0) {
      await this.emitEvent("ToolCalled", userId, correlationId, {
        toolCalls: result.toolCalls.map(tc => ({ id: tc.id, name: tc.name, arguments: tc.arguments })),
      })

      // Store the assistant's response
      messages.push({ role: "assistant", content: result.content || "" })

      for (const tc of result.toolCalls) {
        const resultText = await this.executeTool(tc.name, tc.arguments, input, userId, correlationId)
        messages.push({ role: "user", content: `[Tool ${tc.name} returned: ${resultText}]` })
      }

      // Second LLM call — generate final response with tool results
      await this.emitEvent("AgentThinking", userId, correlationId, {
        phase: "llm_final",
        toolCallCount: result.toolCalls.length,
      })

      const final = await this.config.llm.chat({
        model: this.config.model,
        messages,
        temperature: 0.5,
        maxTokens: 2000,
      })
      tokens.total += final.usage.inputTokens + final.usage.outputTokens
      reply = final.content
    } else {
      reply = result.content
    }

    await this.emitEvent("AgentResponseSent", userId, correlationId, {
      reply,
      tokensUsed: tokens.total,
    })

    this.reflectAfterTurn(userId, input.message, reply, correlationId)
    this.recordCompanionInteraction(userId, correlationId)

    return { reply, tokensUsed: tokens.total, safetyFlags: safetyFlags.length > 0 ? safetyFlags : undefined }
  }

  async *processStream(input: AgentInput): AsyncGenerator<StreamEvent> {
    try {
      const externalUserId = input.userId ?? "default"
      const channel = input.channel ?? "web"
      const userId = await this.resolveUserId(externalUserId, channel, input.userIdKind ?? "external")
      const correlationId = crypto.randomUUID()

      await this.emitEvent("UserMessageReceived", userId, correlationId, {
        channel,
        content: input.message,
        externalUserId,
        userIdKind: input.userIdKind ?? "external",
      })

      // 情绪识别：在构建上下文前识别本次消息情绪，让情绪上下文包含当前状态
      if (this.config.emotion) {
        try {
          await this.config.emotion.detectAndRecord(userId, input.message, "inferred")
        } catch {
          // 情绪识别失败不影响对话
        }
      }

      const messages = await this.buildMessages(input, userId, correlationId)

      let reply = ""
      let usedFallback = false
      for await (const chunk of this.config.llm.chatStream({
        model: this.config.model,
        messages,
        temperature: 0.5,
        maxTokens: 2000,
      })) {
        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          const full = await this.process(input)
          yield { type: "done", reply: full.reply, tokensUsed: full.tokensUsed }
          usedFallback = true
          break
        }
        if (chunk.content) {
          reply += chunk.content
          yield { type: "token", text: chunk.content }
        }
      }

      if (!usedFallback) {
        await this.emitEvent("AgentResponseSent", userId, correlationId, { reply, tokensUsed: 0 })
        yield { type: "done", reply, tokensUsed: 0 }
      }
    } catch (err: any) {
      yield { type: "error", message: err.message }
      yield { type: "done", reply: "Sorry, an error occurred.", tokensUsed: 0 }
    }
  }

  private async buildMessages(input: AgentInput, userId: string, correlationId: string, safetyReminder = ""): Promise<ChatMessage[]> {
    const identity = this.identity.get(this.config.identity.agentId)
    const systemMsg = identity ? [
      `You are ${identity.name}. ${identity.description}.`,
      `Core values: ${identity.coreValues.join(". ")}.`,
      `Always match the user's language.`,
      `\nWhen you need to use a tool, the function calling system will handle it. Just respond naturally.`,
    ].join("\n") : "You are a helpful assistant."

    let memoryContext = ""
    if (this.config.memory) {
      try {
        await this.emitEvent("AgentThinking", userId, correlationId, { phase: "memory_context" })
        memoryContext = await this.config.memory.buildMemoryContext(userId, input.message)
      } catch {
        // Memory should improve the reply, not block it.
      }
    }

    let knowledgeContext = ""
    if (input.knowledge) {
      try {
        await this.emitEvent("AgentThinking", userId, correlationId, { phase: "knowledge_context" })
        knowledgeContext = await input.knowledge(input.message)
      } catch { /* silently fall through */ }
    }

    const basePrompt = [
      systemMsg,
      memoryContext ? `## User Memory\n${memoryContext}\n\nUse this memory to personalize the reply. If the user mentions injuries, pain, goals, or constraints, respect them.` : "",
      knowledgeContext ? `## Relevant Knowledge\n${knowledgeContext}\n\nUse the above knowledge to inform your response where relevant.` : "",
    ].filter(Boolean).join("\n\n")

    let fullSystemPrompt = basePrompt
    if (this.config.companion) {
      try {
        await this.emitEvent("AgentThinking", userId, correlationId, { phase: "relationship_context" })
        fullSystemPrompt = await this.config.companion.enrichPrompt(userId, basePrompt)
      } catch {
        // Relationship context is enrichment, not a hard dependency.
      }
    }
    // 情绪上下文：在关系之后注入，让 LLM 感知用户当前情绪并调整调性
    if (this.config.emotion) {
      try {
        await this.emitEvent("AgentThinking", userId, correlationId, { phase: "emotion_context" })
        const emotionCtx = await this.config.emotion.buildEmotionContext(userId)
        if (emotionCtx) {
          fullSystemPrompt = `${fullSystemPrompt}\n\n${emotionCtx}`
        }
      } catch {
        // Emotion context is enrichment, not a hard dependency.
      }
    }
    if (safetyReminder) {
      fullSystemPrompt = `${fullSystemPrompt}\n\n${safetyReminder}`
    }

    return [
      { role: "system", content: fullSystemPrompt },
      ...(input.history ?? []).slice(-10).map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: input.message },
    ]
  }

  private buildToolDefinitions(): ToolDefinition[] {
    const defs: ToolDefinition[] = []
    const seen = new Set<string>()
    const addTool = (def: ToolDefinition) => {
      if (seen.has(def.name)) throw new Error(`Tool "${def.name}" already exposed to pipeline`)
      seen.add(def.name)
      defs.push(def)
    }

    addTool({
      name: "calculator",
      description: "Evaluate a math expression. Example: '2 + 2', '150 * 0.453'",
      inputSchema: { type: "object", properties: { expression: { type: "string", description: "Math expression" } }, required: ["expression"] },
    })

    addTool({
      name: "web_search",
      description: "Search the web for current information",
      inputSchema: { type: "object", properties: { query: { type: "string", description: "Search query" } }, required: ["query"] },
    })

    for (const skill of this.skills.list()) {
      const name = skill.manifest.id
      // Skip duplicates that have built-in equivalents
      if (name === "calculator" || name === "search") continue
      addTool({
        name: `skill_${name}`,
        description: skill.manifest.description,
        inputSchema: skill.manifest.capabilities.input,
      })
    }

    for (const tool of this.config.plugins?.tools ?? []) {
      addTool(tool)
    }

    return defs
  }

  private async executeTool(name: string, args: Record<string, unknown>, input: AgentInput, userId: string, correlationId: string): Promise<string> {
    try {
      const policy = this.config.toolPolicy ?? allowAllToolPolicy
      const decision = await policy.decide({
        toolName: name,
        args,
        userId,
        channel: input.channel ?? "web",
      })
      if (!decision.allow) {
        await this.emitEvent("ToolFailed", userId, correlationId, {
          toolName: name,
          reason: decision.reason ?? "denied",
        }, "high")
        return `Tool ${name} denied: ${decision.reason ?? "denied"}`
      }
      if (name === "calculator") {
        const expr = String(args.expression ?? "")
        try { return `= ${evaluateMathExpression(expr)}` } catch { return "Invalid expression" }
      }
      if (name === "web_search" && input.search) {
        return await input.search(String(args.query ?? input.message))
      }
      const pluginHandler = this.config.plugins?.resolveToolHandler(name)
      if (pluginHandler) {
        const result = await pluginHandler(args, userId)
        return result.content
      }
      const skillName = name.startsWith("skill_") ? name.slice(6) : name
      const result = await this.skillExecutor.run(skillName, args, { userId, memory: this.config.memory })
      return result.content
    } catch (err: any) {
      return `Error: ${err.message}`
    }
  }

  private async resolveUserId(userId: string, channel: string, kind: "external" | "internal"): Promise<string> {
    if (!this.config.memory) return userId

    if (kind === "internal" && this.config.memory.profile.ensureUser) {
      return this.config.memory.profile.ensureUser(userId, userId, channel, userId)
    }

    return this.config.memory.profile.getOrCreateUser(userId, channel, userId)
  }

  private reflectAfterTurn(userId: string, userMessage: string, reply: string, correlationId: string): void {
    if (!this.config.reflection || !reply) return

    void this.config.reflection
      .reflect(userId, userMessage, reply, this.config.llm, this.config.model)
      .then(() => this.emitEvent("ReflectionCompleted", userId, correlationId, {
        inputChars: userMessage.length,
        replyChars: reply.length,
      }))
      .catch(err => {
        console.error("[AgentPipeline] reflection failed:", err instanceof Error ? err.message : err)
        void this.emitEvent("ErrorOccurred", userId, correlationId, {
          phase: "reflection",
          error: err instanceof Error ? err.message : String(err),
        }, "high")
      })
  }

  private recordCompanionInteraction(userId: string, correlationId: string): void {
    if (!this.config.companion) return

    void this.config.companion
      .onInteraction(userId)
      .then(() => this.emitEvent("RelationshipChanged", userId, correlationId, {
        reason: "turn_completed",
      }))
      .catch(err => {
        console.error("[AgentPipeline] companion interaction failed:", err instanceof Error ? err.message : err)
        void this.emitEvent("ErrorOccurred", userId, correlationId, {
          phase: "relationship",
          error: err instanceof Error ? err.message : String(err),
        }, "high")
      })
  }

  private async emitEvent(
    type: EventType,
    userId: string,
    correlationId: string,
    payload: Record<string, unknown>,
    priority: EventEnvelope["metadata"]["priority"] = "normal",
  ): Promise<void> {
    if (!this.config.events) return

    const now = this.clock.now()

    const event: EventEnvelope = {
      id: `evt_${now.epochMs}_${++AgentPipeline.eventCounter}`,
      type,
      source: "agent-pipeline",
      timestamp: now.iso,
      correlationId,
      payload,
      metadata: { userId, priority },
    }

    try {
      await this.config.events.emit(event)
    } catch (err) {
      console.error("[AgentPipeline] event emit failed:", err instanceof Error ? err.message : err)
    }
  }
}
