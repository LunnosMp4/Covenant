export interface AppConfig {
  apiKey: string
  themeGradient: string
  proxyUrl: string
  launchOnStartup: boolean
  terminalFont: string
  mcpServers: McpServer[]
}

export interface McpHeader {
  name: string
  value: string
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  enabled: boolean
}

export interface McpAuthNone {
  type: 'none'
}

export interface McpAuthAccessToken {
  type: 'accessToken'
  token: string
}

export interface McpAuthCustomHeaders {
  type: 'customHeaders'
  headers: McpHeader[]
}

export type McpAuth = McpAuthNone | McpAuthAccessToken | McpAuthCustomHeaders

export interface McpServer {
  id: string
  name: string
  url: string
  description: string
  active: boolean
  auth: McpAuth
  tools: McpTool[]
  lastSyncedAt?: number
  lastError?: string
}