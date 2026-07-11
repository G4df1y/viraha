import { MCPStdioTransport } from "./transports.js"
import { MCPSSETransport } from "./sse-transport.js"
import type { MCPServerConfig, MCPToolDefinition, MCPCallResult } from "./types.js"

interface MCPServerInstance {
  config: MCPServerConfig
  transport: MCPStdioTransport | MCPSSETransport
  tools: MCPToolDefinition[]
  connected: boolean
}

export class MCPManager {
  private servers = new Map<string, MCPServerInstance>()

  async register(config: MCPServerConfig): Promise<void> {
    if (this.servers.has(config.id)) return

    const transport = config.transport === "sse"
      ? new MCPSSETransport(config.url!)
      : new MCPStdioTransport()

    const instance: MCPServerInstance = { config, transport, tools: [], connected: false }
    this.servers.set(config.id, instance)

    try {
      if (config.transport === "stdio" && config.command) {
        await (transport as MCPStdioTransport).start(config.command, config.args ?? [], config.env ?? {})
      } else if (config.transport === "sse" && config.url) {
        await (transport as MCPSSETransport).start()
      }

      instance.connected = true
      instance.tools = await transport.listTools()
      console.log(`[MCP] Connected ${config.name}: ${instance.tools.length} tools`)
    } catch (err: any) {
      console.error(`[MCP] Failed to connect ${config.name}:`, err.message)
    }
  }

  async call(serverId: string, tool: string, args: Record<string, unknown>): Promise<MCPCallResult> {
    const server = this.servers.get(serverId)
    if (!server) throw new Error(`MCP server not found: ${serverId}`)
    if (!server.connected || !server.transport.isConnected()) {
      await this.register(server.config)
    }
    return await server.transport.callTool(tool, args)
  }

  findRelevant(input: string): Array<{ serverId: string; tool: MCPToolDefinition }> {
    const lower = input.toLowerCase()
    const results: Array<{ serverId: string; tool: MCPToolDefinition }> = []
    for (const [id, server] of this.servers) {
      for (const tool of server.tools) {
        const desc = (tool.name + " " + tool.description).toLowerCase()
        if (lower.split(/\s+/).some(w => w.length > 3 && desc.includes(w))) {
          results.push({ serverId: id, tool })
        }
      }
    }
    return results
  }

  listTools(): Array<{ serverId: string; tools: MCPToolDefinition[] }> {
    const result: Array<{ serverId: string; tools: MCPToolDefinition[] }> = []
    for (const [id, server] of this.servers) {
      if (server.tools.length > 0) result.push({ serverId: id, tools: server.tools })
    }
    return result
  }

  async disconnectAll(): Promise<void> {
    for (const [, server] of this.servers) {
      await server.transport.close()
    }
    this.servers.clear()
  }
}
