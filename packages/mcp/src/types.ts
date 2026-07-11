export interface JSONRPCMessage {
  jsonrpc: "2.0"
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface MCPToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface MCPServerConfig {
  id: string
  name: string
  transport: "stdio" | "sse" | "ws"
  command?: string           // for stdio: the command to run
  args?: string[]            // for stdio: command arguments
  url?: string               // for sse/ws: server URL
  env?: Record<string, string>  // for stdio: environment variables
}

export interface MCPCallResult {
  content: Array<{ type: string; text?: string; data?: unknown }>
  isError?: boolean
}

export interface MCPListToolsResponse {
  tools?: MCPToolDefinition[]
}

export interface MCPCallToolResponse {
  content?: Array<{ type: string; text?: string; data?: unknown }>
  isError?: boolean
}
