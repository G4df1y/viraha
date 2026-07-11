export type ChannelType = "cli" | "web" | "qq" | "feishu" | "wechat" | "telegram" | "discord" | "sdk"
export type RoleLevel = "user" | "admin" | "owner"

export interface ToolPermission {
  skillId: string
  allowedChannels: ChannelType[]
  minRole: RoleLevel
  rateLimitPerMinute?: number
  requiresConfirmation?: boolean
}

export class ToolPolicy {
  private permissions = new Map<string, ToolPermission>()
  private usageCount = new Map<string, { count: number; windowStart: number }>()

  setPermission(skillId: string, perm: Partial<ToolPermission>) {
    const existing = this.permissions.get(skillId) ?? {
      skillId, allowedChannels: ["cli", "web", "sdk"], minRole: "user" as RoleLevel,
    }
    Object.assign(existing, perm)
    this.permissions.set(skillId, existing)
  }

  check(skillId: string, channel: string, role: RoleLevel = "user"): { allowed: boolean; reason?: string } {
    const perm = this.permissions.get(skillId)
    if (!perm) return { allowed: true }

    // Check channel
    if (!perm.allowedChannels.includes(channel as ChannelType)) {
      return { allowed: false, reason: `Skill "${skillId}" not allowed on ${channel}` }
    }

    // Check role
    const roleOrder: Record<RoleLevel, number> = { user: 0, admin: 1, owner: 2 }
    if (roleOrder[role] < roleOrder[perm.minRole]) {
      return { allowed: false, reason: `Skill "${skillId}" requires role: ${perm.minRole}` }
    }

    // Check rate limit
    if (perm.rateLimitPerMinute) {
      const key = `${skillId}:${channel}`
      const now = Date.now()
      const usage = this.usageCount.get(key) ?? { count: 0, windowStart: now }
      if (now - usage.windowStart > 60000) {
        usage.count = 0
        usage.windowStart = now
      }
      usage.count++
      this.usageCount.set(key, usage)
      if (usage.count > perm.rateLimitPerMinute) {
        return { allowed: false, reason: `Skill "${skillId}" rate limited (${perm.rateLimitPerMinute}/min)` }
      }
    }

    return { allowed: true }
  }

  getPermissions(): ToolPermission[] {
    return Array.from(this.permissions.values())
  }
}
