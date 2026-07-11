import { IdentityObject, type IdentityConfig } from "./types.js"

export class IdentityEngine {
  private instances = new Map<string, IdentityObject>()

  register(config: IdentityConfig): IdentityObject {
    const existing = this.instances.get(config.agentId)
    if (existing) return existing

    const identity = new IdentityObject(config)
    this.instances.set(config.agentId, identity)
    return identity
  }

  get(agentId: string): IdentityObject | undefined {
    return this.instances.get(agentId)
  }

  getOrThrow(agentId: string): IdentityObject {
    const identity = this.instances.get(agentId)
    if (!identity) throw new Error(`No identity registered for agent: ${agentId}`)
    return identity
  }

  list(): IdentityObject[] {
    return Array.from(this.instances.values())
  }

  remove(agentId: string): void {
    this.instances.delete(agentId)
  }
}
