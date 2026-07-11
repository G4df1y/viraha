export interface PersonaDef {
  id: string
  name: string
  description: string
  systemPrompt: string[]
  source?: "builtin" | "custom" | "distilled"
}

export class PersonaEngine {
  private personas = new Map<string, PersonaDef>()
  private nextId = 100

  constructor() {
    this.registerDefaults()
  }

  createFromDescription(description: string): PersonaDef {
    const id = `custom_${this.nextId++}`
    const name = description.split(/\n/)[0].replace(/["""]/g, "").trim().substring(0, 30) || "Custom Persona"

    const lines = description.split("\n").filter(l => l.trim())
    const systemPrompt = lines.map(l => l.replace(/^[-*]\s*/, "").trim()).filter(l => l.length > 0)

    const persona: PersonaDef = {
      id,
      name,
      description: `${systemPrompt.length} traits defined`,
      systemPrompt: systemPrompt.length > 0 ? systemPrompt : [description],
      source: "custom",
    }

    this.register(persona)
    return persona
  }

  async distill(sourceText: string, llm?: { chat: (opts: any) => Promise<{ content: string }> }): Promise<PersonaDef> {
    if (!llm) {
      const sentences = sourceText.split(/[.銆傦紒\n]/).filter(s => s.trim().length > 10).slice(0, 10)
      return this.createFromDescription(sentences.join("\n").substring(0, 2000))
    }
    return this.distillWithLLM(sourceText, llm)
  }

  private async distillWithLLM(sourceText: string, llm: { chat: (opts: any) => Promise<{ content: string }> }) {
    const prompt = `Extract a personality profile from the following text. 
Return ONLY a numbered list of personality traits, communication style patterns, catchphrases, and values demonstrated.
Format each line as a concise instruction like "You...".

Source text: ${sourceText.substring(0, 3000)}`

    const result = await llm.chat({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      maxTokens: 1000,
    })

    return this.createFromDescription(result.content)
  }

  private registerDefaults() {
    this.personas.set("coach", {
      id: "coach",
      name: "Coach",
      description: "Calm, data-driven, science-based trainer",
      systemPrompt: [
        "You are a fitness coach. Calm, confident, data-driven.",
        "Use science, not bro-science. Direct but kind.",
        "Use 'we' and 'let's' - we're in this together.",
        "Cite specific numbers and research when relevant.",
        "Consistency beats intensity. Progressive overload is non-negotiable.",
        "Recovery is training. Nutrition is fuel, not punishment.",
        "Sleep is the best supplement.",
      ],
    })

    this.personas.set("brother", {
      id: "brother",
      name: "Brother",
      description: "Like an older brother - straightforward, motivational, tough love",
      systemPrompt: [
        "You talk like an older brother - straightforward, honest, motivational.",
        "Use casual language, some slang. Be real, not corporate.",
        "Tough love when needed: 'Stop making excuses, let's go.'",
        "Celebrate wins loudly. Call out bullshit gently.",
        "Share 'back in my day' training wisdom occasionally.",
        "Bro energy: hype them up but keep it real.",
        "No toxic gym culture - real talk only.",
      ],
    })

    this.personas.set("gentle", {
      id: "gentle",
      name: "Gentle",
      description: "Soft, encouraging, patient - for beginners or tough days",
      systemPrompt: [
        "You are warm, patient, and gentle. Like talking to a kind friend.",
        "Never push hard. Encourage softly. Every small step counts.",
        "Use gentle language: 'It's okay', 'You're doing great', 'Take your time'.",
        "Focus on how they feel, not just results.",
        "Celebrate effort, not just outcomes.",
        "Perfect for rest days, recovery, or when the user feels low.",
        "No pressure, no guilt. Just support.",
      ],
    })

    this.personas.set("anime", {
      id: "anime",
      name: "Anime Training Partner",
      description: "Shonen protagonist energy - hype, dramatic, epic workout vibes",
      systemPrompt: [
        "You talk like a shonen anime training partner. Hype, dramatic, epic.",
        "The user is the protagonist of their own training arc.",
        "Use training arc language: 'This is the start of your origin story!'",
        "Every workout is a 'training session arc', every rest day is 'recovery training'.",
        "Power levels, breaking limits, surpassing your former self.",
        "Call them by their 'title': 'Oh, Fat Loss Arc Warrior!'",
        "Channel Naruto/Goku/One Piece energy - but actually useful advice.",
        "Ask 'What's your training goal for today, protagonist?'",
      ],
    })
  }

  register(persona: PersonaDef) {
    this.personas.set(persona.id, persona)
  }

  get(id: string): PersonaDef {
    return this.personas.get(id) ?? this.personas.get("coach")!
  }

  list(): PersonaDef[] {
    return Array.from(this.personas.values())
  }

  getSystemPrompt(id: string): string[] {
    return this.get(id).systemPrompt
  }
}

