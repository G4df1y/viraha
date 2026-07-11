import { Skill, type SkillManifest, type SkillHandler, type IntentType } from "./types.js"

export class SkillRegistry {
  private skills = new Map<string, Skill>()

  register(manifest: SkillManifest, handler: SkillHandler): Skill {
    const skill = new Skill(manifest, handler)
    this.skills.set(manifest.id, skill)
    return skill
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id)
  }

  findRelevant(intentType: string, message: string, entities: string[]): Skill[] {
    const lower = message.toLowerCase()
    const results: Skill[] = []

    for (const skill of this.skills.values()) {
      const t = skill.manifest.triggers

      // Match by intent type
      if (t.intentTypes.includes(intentType as IntentType)) {
        results.push(skill)
        continue
      }

      // Match by keyword
      if (t.keywords.some(k => lower.includes(k))) {
        results.push(skill)
        continue
      }

      // Match by entity
      if (entities.some(e => t.entities.includes(e))) {
        results.push(skill)
      }
    }

    return results
  }

  list(): Skill[] {
    return Array.from(this.skills.values())
  }

  remove(id: string): boolean {
    return this.skills.delete(id)
  }
}
