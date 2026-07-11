import type { TurnInput } from "@viraha/core"

export interface PromptTier {
  stable: string[]
  context: string[]
  volatile: string[]
  ephemeral: string[]
}

export class ContextAssembler {
  assemble(tiers: PromptTier): string {
    const parts: string[] = []

    if (tiers.stable.length) {
      parts.push(tiers.stable.join("\n"))
    }
    if (tiers.context.length) {
      if (parts.length) parts.push("")
      parts.push(tiers.context.join("\n"))
    }
    if (tiers.volatile.length) {
      if (parts.length) parts.push("")
      parts.push(tiers.volatile.join("\n"))
    }
    if (tiers.ephemeral.length) {
      if (parts.length) parts.push("")
      parts.push(tiers.ephemeral.join("\n"))
    }

    return parts.join("\n")
  }

  buildTurnMessages(tiers: PromptTier, input: TurnInput, systemPrompt: string): Array<{ role: "system" | "user"; content: string }> {
    const messages: Array<{ role: "system" | "user"; content: string }> = []

    messages.push({ role: "system", content: systemPrompt })
    messages.push({ role: "user", content: input.content })

    return messages
  }
}


