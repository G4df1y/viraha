import fs from "fs/promises"
import path from "path"
import { z } from "zod"
import type { CompanionPack } from "./plugins.js"

const ToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.unknown()),
})

const PackSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  tools: z.array(ToolSchema).optional(),
  knowledgePacks: z.record(z.string()).optional(),
  personas: z.array(z.object({
    id: z.string(),
    name: z.string(),
    systemPrompt: z.array(z.string()),
  })).optional(),
})

export async function loadLocalCompanionPack(dir: string): Promise<CompanionPack> {
  const raw = await fs.readFile(path.join(dir, "pack.json"), "utf8")
  const parsed = PackSchema.parse(JSON.parse(raw))
  return parsed
}
