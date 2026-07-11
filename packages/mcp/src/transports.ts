import { spawn, type ChildProcess } from "child_process"
import { EventEmitter } from "events"
import type { JSONRPCMessage, MCPToolDefinition, MCPCallResult, MCPListToolsResponse, MCPCallToolResponse } from "./types.js"

export class MCPStdioTransport extends EventEmitter {
  private process: ChildProcess | null = null
  private buffer = ""
  private messageId = 0
  private pending = new Map<string | number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private connected = false

  async start(command: string, args: string[] = [], env: Record<string, string> = {}): Promise<void> {
    this.process = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env } as NodeJS.ProcessEnv,
    })

    this.process.stdout?.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString()
      this.processMessages()
    })

    this.process.stderr?.on("data", (chunk: Buffer) => {
      console.error(`[MCP:${command}] ${chunk.toString().trim()}`)
    })

    this.process.on("error", (err) => this.emit("error", err))
    this.process.on("exit", (code) => {
      this.connected = false
      this.emit("close", code)
      // Reject all pending requests
      for (const [, p] of this.pending) p.reject(new Error(`MCP process exited with code ${code}`))
      this.pending.clear()
    })

    // Wait for initialize response
    await this.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "viraha", version: "2.0.0" },
    })

    this.connected = true
    this.emit("connected")
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    const result = (await this.request("tools/list", {})) as MCPListToolsResponse
    return result?.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPCallResult> {
    const result = (await this.request("tools/call", { name, arguments: args })) as MCPCallToolResponse
    return { content: result?.content ?? [], isError: result?.isError ?? false }
  }

  async close(): Promise<void> {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    this.connected = false
  }

  isConnected(): boolean { return this.connected }

  private async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = ++this.messageId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })

      const msg: JSONRPCMessage = { jsonrpc: "2.0", id, method, params }
      this.process?.stdin?.write(JSON.stringify(msg) + "\n")

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`MCP request ${method} timed out`))
        }
      }, 30000)
    })
  }

  private processMessages(): void {
    const lines = this.buffer.split("\n")
    this.buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg: JSONRPCMessage = JSON.parse(line)

        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!
          this.pending.delete(msg.id)

          if (msg.error) {
            reject(new Error(`MCP error: ${msg.error.message}`))
          } else {
            resolve(msg.result)
          }
        }
      } catch { /* skip malformed JSON */ }
    }
  }
}
