import type { ToolDefinition } from "@viraha/provider"
import type { ToolHandler } from "./runtime.js"

export interface CompanionPack {
  name: string
  version: string
  description: string
  tools?: ToolDefinition[]
  toolHandler?: (toolName: string, args: Record<string, unknown>, userId: string) => Promise<{ content: string; isError?: boolean }>
  knowledgePacks?: Record<string, string>
  personas?: Array<{ id: string; name: string; systemPrompt: string[] }>
}

export class PluginRegistry {
  private _tools = new Map<string, ToolDefinition>()
  private _handlers = new Map<string, (args: Record<string, unknown>, userId: string) => Promise<{ content: string; isError?: boolean }>>()
  private _packs: CompanionPack[] = []

  registerPack(pack: CompanionPack): void {
    if (pack.tools) {
      for (const tool of pack.tools) {
        if (this._tools.has(tool.name)) {
          throw new Error(`Tool "${tool.name}" already registered`)
        }
      }
    }

    this._packs.push(pack)

    if (pack.tools) {
      for (const tool of pack.tools) {
        this._tools.set(tool.name, tool)
      }
    }

    if (pack.toolHandler) {
      for (const tool of pack.tools ?? []) {
        this._handlers.set(tool.name, (args, userId) => pack.toolHandler!(tool.name, args, userId))
      }
    }
  }

  get tools(): ToolDefinition[] {
    return Array.from(this._tools.values())
  }

  get packs(): CompanionPack[] {
    return [...this._packs]
  }

  resolveToolHandler(name: string): ((args: Record<string, unknown>, userId: string) => Promise<{ content: string; isError?: boolean }>) | undefined {
    return this._handlers.get(name)
  }

  getHandler(): ToolHandler | undefined {
    if (this._handlers.size === 0) return undefined

    return async (name: string, args: Record<string, unknown>, userId: string) => {
      const handler = this._handlers.get(name)
      if (!handler) return { content: `Unknown tool: ${name}`, isError: true }
      return handler(args, userId)
    }
  }
}


