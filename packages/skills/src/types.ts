export type IntentType = "query" | "command" | "plan" | "analyze" | "social" | "reflect" | "schedule" | "learn" | "greeting" | "unknown"

export interface SkillTrigger {
  intentTypes: IntentType[]
  keywords: string[]
  entities: string[]
}

export interface SkillCapability {
  input: Record<string, unknown>
  output: Record<string, unknown>
  examples: Array<{ query: string; response: string }>
}

export interface SkillLimit {
  maxInputLength?: number
  maxRuntime?: number
  needsUserConfirmation?: boolean
}

export interface SkillManifest {
  id: string
  name: string
  version: string
  description: string
  author?: string
  triggers: SkillTrigger
  capabilities: SkillCapability
  dependencies: { skills?: string[]; mcp?: string[] }
  limits: SkillLimit
}

export type SkillHandler = (input: Record<string, unknown>, context: SkillContext) => Promise<SkillResult>

export interface SkillContext {
  userId?: string
  sessionId?: string
  llm?: { name: string; chat: (opts: any) => Promise<{ content: string }> }
  model?: string
  memory?: any
  search?: (query: string) => Promise<string>
}

export interface SkillResult {
  content: string
  data?: Record<string, unknown>
  isError?: boolean
}

export class Skill {
  constructor(
    public manifest: SkillManifest,
    public handler: SkillHandler,
  ) {}
}
