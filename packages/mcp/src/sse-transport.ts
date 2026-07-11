import { EventEmitter } from "events"
import type { JSONRPCMessage, MCPToolDefinition, MCPCallResult, MCPListToolsResponse, MCPCallToolResponse } from "./types.js"

export class MCPSSETransport extends EventEmitter {
  private url: string
  private sessionId: string | null = null
  private messageId = 0
  private pending = new Map<string | number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private connected = false
  private reader: ReadableStreamDefaultReader<string> | null = null
  private abortController = new AbortController()

  constructor(url: string) {
    super()
    this.url = url
  }

  async start(): Promise<void> {
    try {
      // Initial GET to establish SSE connection and get session ID
      const res = await fetch(this.url, {
        headers: { Accept: "text/event-stream" },
        signal: this.abortController.signal,
      })

      if (!res.ok) throw new Error(`SSE connection failed: ${res.status}`)

      // Parse session ID from the endpoint URL or headers
      const sessionUrl = res.headers.get("x-session-url") ?? `${this.url}/session`
      this.sessionId = sessionUrl.split("/").pop() ?? null

      // Start reading SSE stream
      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""

      const readLoop = async () => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const messages = buffer.split("\n\n")
          buffer = messages.pop() ?? ""

          for (const msg of messages) {
            for (const line of msg.split("\n")) {
              if (line.startsWith("data: ")) {
                try {
                  const json = JSON.parse(line.slice(6)) as JSONRPCMessage
                  if (json.id !== undefined && this.pending.has(json.id)) {
                    const { resolve, reject } = this.pending.get(json.id)!
                    this.pending.delete(json.id)
                    if (json.error) reject(new Error(json.error.message))
                    else resolve(json.result)
                  }
                } catch { /* skip */ }
              }
            }
          }
        }
      }

      readLoop().catch(() => {})
      this.connected = true
      this.emit("connected")

      // Initialize
      await this.request("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "viraha", version: "2.0.0" },
      })
    } catch (err: any) {
      this.emit("error", err)
    }
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
    this.connected = false
    this.abortController.abort()
    for (const [, p] of this.pending) p.reject(new Error("MCP transport closed"))
    this.pending.clear()
  }

  isConnected(): boolean { return this.connected }

  private async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = ++this.messageId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })

      const msg: JSONRPCMessage = { jsonrpc: "2.0", id, method, params }

      // Send via POST to the session endpoint
      const sessionEndpoint = this.sessionId
        ? `${this.url}/${this.sessionId}`
        : this.url

      fetch(sessionEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg),
        signal: this.abortController.signal,
      }).catch(err => reject(err))

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`MCP request ${method} timed out`))
        }
      }, 30000)
    })
  }
}
