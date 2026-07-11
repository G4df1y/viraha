export interface Capability {
  id: string
  name: string
  description: string
  type: "skill" | "mcp" | "tool" | "knowledge"
}

export interface IdentityBoundary {
  topic: string
  type: "hard" | "soft"
  description: string
}

export interface PersonaSnapshot {
  name: string
  traits: string[]
  style: string
  catchphrases?: string[]
  humorLevel: number
  formality: number
  empathyLevel: number
}

export interface IdentityLimits {
  maxPlanSteps: number
  maxTokensPerTurn: number
  maxSkillCallsPerTurn: number
}

export interface IdentityConfig {
  agentId: string
  name: string
  description: string
  type: "companion" | "assistant" | "coach" | "agent"
  version: string

  capabilities?: Capability[]
  skills?: string[]
  mcpServers?: string[]
  longTermGoal?: string
  coreValues?: string[]
  boundaries?: IdentityBoundary[]

  personaId: string
  persona: PersonaSnapshot

  limits?: Partial<IdentityLimits>
}

export class IdentityObject {
  readonly agentId: string
  readonly name: string
  readonly description: string
  readonly type: string
  readonly version: string

  readonly capabilities: Capability[]
  readonly skills: string[]
  readonly mcpServers: string[]
  readonly longTermGoal: string
  readonly coreValues: string[]
  readonly boundaries: IdentityBoundary[]

  personaId: string
  persona: PersonaSnapshot

  readonly limits: IdentityLimits

  constructor(config: IdentityConfig) {
    this.agentId = config.agentId
    this.name = config.name
    this.description = config.description
    this.type = config.type
    this.version = config.version
    this.capabilities = config.capabilities ?? []
    this.skills = config.skills ?? []
    this.mcpServers = config.mcpServers ?? []
    this.longTermGoal = config.longTermGoal ?? ""
    this.coreValues = config.coreValues ?? []
    this.boundaries = config.boundaries ?? []
    this.personaId = config.personaId
    this.persona = config.persona
    this.limits = {
      maxPlanSteps: config.limits?.maxPlanSteps ?? 10,
      maxTokensPerTurn: config.limits?.maxTokensPerTurn ?? 8000,
      maxSkillCallsPerTurn: config.limits?.maxSkillCallsPerTurn ?? 20,
    }
  }

  setPersona(personaId: string, snapshot: PersonaSnapshot): void {
    this.personaId = personaId
    this.persona = snapshot
  }
}
