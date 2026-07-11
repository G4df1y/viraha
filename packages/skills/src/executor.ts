import { SkillRegistry } from "./registry.js"
import type { SkillContext, SkillResult } from "./types.js"

export class SkillExecutor {
  private registry: SkillRegistry

  constructor(registry: SkillRegistry) {
    this.registry = registry
  }

  async run(skillId: string, input: Record<string, unknown>, context: SkillContext): Promise<SkillResult> {
    const skill = this.registry.get(skillId)
    if (!skill) return { content: `Skill not found: ${skillId}`, isError: true }

    const maxRetries = skill.manifest.limits.maxRuntime ?? 1
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await skill.handler(input, context)
      } catch (err: any) {
        lastError = err
        if (attempt < maxRetries) {
          // Could add exponential backoff here
        }
      }
    }

    return { content: `Skill ${skillId} failed after ${maxRetries} retries: ${lastError?.message}`, isError: true }
  }

  async runParallel(skills: Array<{ id: string; input: Record<string, unknown> }>, context: SkillContext): Promise<Map<string, SkillResult>> {
    const results = new Map<string, SkillResult>()
    await Promise.all(
      skills.map(async (s) => {
        const result = await this.run(s.id, s.input, context)
        results.set(s.id, result)
      })
    )
    return results
  }
}
