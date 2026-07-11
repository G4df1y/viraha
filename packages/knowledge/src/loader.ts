import fs from "fs"
import path from "path"

export interface KnowledgeChunk {
  packName: string
  sourceFile: string
  heading: string
  content: string
  keywords: string[]
}

export class KnowledgeLoader {
  private packs = new Map<string, KnowledgeChunk[]>()

  loadPack(packPath: string, packName: string): KnowledgeChunk[] {
    const chunks: KnowledgeChunk[] = []

    if (!fs.existsSync(packPath)) {
      console.warn(`[Knowledge] Pack not found: ${packPath}`)
      return chunks
    }

    const files = fs.readdirSync(packPath).filter(f => f.endsWith(".md"))

    for (const file of files) {
      const content = fs.readFileSync(path.join(packPath, file), "utf-8")
      const fileChunks = this.chunkMarkdown(content, packName, file)
      chunks.push(...fileChunks)
    }

    this.packs.set(packName, chunks)
    console.log(`[Knowledge] Loaded ${packName}: ${chunks.length} chunks from ${files.length} files`)
    return chunks
  }

  getChunks(packName: string): KnowledgeChunk[] {
    return this.packs.get(packName) ?? []
  }

  listPacks(): string[] {
    return Array.from(this.packs.keys())
  }

  private chunkMarkdown(md: string, packName: string, fileName: string): KnowledgeChunk[] {
    const lines = md.split("\n")
    const chunks: KnowledgeChunk[] = []
    let currentHeading = "General"
    let currentContent: string[] = []

    for (const line of lines) {
      if (line.startsWith("#")) {
        if (currentContent.length > 0) {
          chunks.push(this.makeChunk(packName, fileName, currentHeading, currentContent))
        }
        currentHeading = line.replace(/^#+\s*/, "").trim()
        currentContent = []
      } else {
        currentContent.push(line)
      }
    }

    if (currentContent.length > 0) {
      chunks.push(this.makeChunk(packName, fileName, currentHeading, currentContent))
    }

    return chunks
  }

  private makeChunk(packName: string, fileName: string, heading: string, lines: string[]): KnowledgeChunk {
    const content = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
    if (!content) return { packName, sourceFile: fileName, heading, content: "", keywords: [] }

    const words = content.toLowerCase().split(/\W+/).filter(w => w.length > 3)
    const keywords = [...new Set(words)].slice(0, 50)

    return { packName, sourceFile: fileName, heading, content, keywords }
  }
}

