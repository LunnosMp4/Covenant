import { randomUUID } from 'crypto'
import type { McpAuth, McpHeader, McpServer, McpTool } from '../../shared/mcp/mcp'

export function normalizeMcpHeaders(rawHeaders: unknown): McpHeader[] {
  if (!Array.isArray(rawHeaders)) {
    return []
  }

  return rawHeaders
    .map((header) => {
      const name = typeof header?.name === 'string' ? header.name.trim() : ''
      const value = typeof header?.value === 'string' ? header.value.trim() : ''
      if (!name) return null
      return { name, value }
    })
    .filter((header): header is McpHeader => Boolean(header))
}

export function normalizeMcpAuth(rawAuth: unknown): McpAuth {
  if (!rawAuth || typeof rawAuth !== 'object') {
    return { type: 'none' }
  }

  const authType = typeof (rawAuth as { type?: unknown }).type === 'string'
    ? (rawAuth as { type?: string }).type
    : 'none'

  if (authType === 'accessToken') {
    const rawToken = (rawAuth as { token?: unknown }).token
    const token = typeof rawToken === 'string' ? rawToken.trim() : ''
    return { type: 'accessToken', token }
  }

  if (authType === 'customHeaders') {
    return { type: 'customHeaders', headers: normalizeMcpHeaders((rawAuth as { headers?: unknown }).headers) }
  }

  return { type: 'none' }
}

export function normalizeMcpTools(rawTools: unknown): McpTool[] {
  if (!Array.isArray(rawTools)) {
    return []
  }

  const tools: McpTool[] = []
  for (const rawTool of rawTools) {
    if (!rawTool || typeof rawTool !== 'object') continue
    const tool = rawTool as Record<string, unknown>
    const name = typeof tool.name === 'string' ? tool.name.trim() : ''
    if (!name) continue
    const description = typeof tool.description === 'string' ? tool.description.trim() : ''
    const inputSchema =
      tool.inputSchema && typeof tool.inputSchema === 'object'
        ? (tool.inputSchema as Record<string, unknown>)
        : undefined
    const enabled = typeof tool.enabled === 'boolean' ? tool.enabled : true

    tools.push({ name, description, inputSchema, enabled })
  }

  return tools
}

export function normalizeStoredMcpServer(rawServer: Partial<McpServer> | null | undefined): McpServer | null {
  if (!rawServer || typeof rawServer !== 'object') {
    return null
  }

  const name = typeof rawServer.name === 'string' ? rawServer.name.trim() : ''
  const url = typeof rawServer.url === 'string' ? rawServer.url.trim() : ''

  if (!name || !url) {
    return null
  }

  const id = typeof rawServer.id === 'string' && rawServer.id.trim() ? rawServer.id.trim() : randomUUID()
  const description = typeof rawServer.description === 'string' ? rawServer.description.trim() : ''
  const active = typeof rawServer.active === 'boolean' ? rawServer.active : false
  const appendMcpSuffix =
    typeof rawServer.appendMcpSuffix === 'boolean' ? rawServer.appendMcpSuffix : true

  return {
    id,
    name,
    url,
    description,
    active,
    appendMcpSuffix,
    auth: normalizeMcpAuth(rawServer.auth),
    tools: normalizeMcpTools(rawServer.tools),
    lastSyncedAt:
      typeof rawServer.lastSyncedAt === 'number' && Number.isFinite(rawServer.lastSyncedAt)
        ? rawServer.lastSyncedAt
        : undefined,
    lastError:
      typeof rawServer.lastError === 'string' && rawServer.lastError.trim()
        ? rawServer.lastError.trim()
        : undefined
  }
}

export function normalizeStoredMcpServers(rawServers: unknown): McpServer[] {
  if (!Array.isArray(rawServers)) {
    return []
  }

  return rawServers
    .map((server) => normalizeStoredMcpServer(server))
    .filter((server): server is McpServer => Boolean(server))
}