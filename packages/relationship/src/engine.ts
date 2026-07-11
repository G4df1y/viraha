import { RelationshipManager } from "./relationship.js"

export class CompanionEngine {
  public relationship = new RelationshipManager()

  async enrichPrompt(userId: string, basePrompt: string): Promise<string> {
    const rel = await this.relationship.getOrCreate(userId)
    const summary = this.relationship.getRelationshipSummary(rel)
    const title = this.relationship.getTitle(rel.level)

    return `${basePrompt}\n\n## Relationship State\n${summary}\nTitle: ${title}\n\nAdapt your tone to the relationship level. At level 1 (Acquaintance), be polite and professional. As the level grows, become warmer and more familiar, referencing shared history when natural. Never mention XP, levels, or game mechanics directly.`
  }

  async onInteraction(userId: string): Promise<void> {
    await this.relationship.recordInteraction(userId)
    await this.relationship.addXp(userId, 10)
  }
}

