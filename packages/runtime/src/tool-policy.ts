export interface ToolPolicyDecision {
  allow: boolean
  reason?: string
}

export interface ToolPolicyInput {
  toolName: string
  args: Record<string, unknown>
  userId: string
  channel: string
}

export interface ToolPolicy {
  decide(input: ToolPolicyInput): Promise<ToolPolicyDecision>
}

export const allowAllToolPolicy: ToolPolicy = {
  async decide() {
    return { allow: true }
  },
}

export function denyToolPolicy(reason: string): ToolPolicy {
  return {
    async decide() {
      return { allow: false, reason }
    },
  }
}
