import type { McpServer } from '../../shared/mcp/mcp'
import { readConfig, updateConfig } from '../config/configStore'
import { forgetMcpSession, refreshMcpServerTools } from '../services/mcpClient'
import { normalizeStoredMcpServer } from '../services/mcpNormalizers'

export function getMcpServers(): McpServer[] {
  return readConfig().mcpServers
}

export function saveMcpServer(payload: Partial<McpServer>): McpServer[] {
  const currentServers = getMcpServers()
  const existingId = typeof payload.id === 'string' ? payload.id.trim() : ''
  const existingServer = existingId ? currentServers.find((item) => item.id === existingId) : undefined
  const normalizedServer = normalizeStoredMcpServer(
    existingServer ? { ...existingServer, ...payload, id: existingServer.id } : payload
  )

  if (!normalizedServer) {
    throw new Error('MCP server name and URL are required.')
  }

  const nextServers = existingId && currentServers.some((item) => item.id === existingId)
    ? currentServers.map((item) =>
        item.id === existingId ? { ...item, ...normalizedServer, id: existingId } : item
      )
    : [...currentServers, { ...normalizedServer, id: existingId || normalizedServer.id }]

  updateConfig({ mcpServers: nextServers })
  return nextServers
}

export function deleteMcpServer(id: string): McpServer[] {
  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId) {
    return getMcpServers()
  }

  forgetMcpSession(normalizedId)
  const nextServers = getMcpServers().filter((item) => item.id !== normalizedId)
  updateConfig({ mcpServers: nextServers })
  return nextServers
}

export async function refreshMcpServerToolsById(serverId: string): Promise<McpServer[]> {
  const normalizedId = typeof serverId === 'string' ? serverId.trim() : ''
  if (!normalizedId) {
    return getMcpServers()
  }

  const servers = getMcpServers()
  const targetServer = servers.find((server) => server.id === normalizedId)
  if (!targetServer) {
    return servers
  }

  try {
    const refreshedServer = await refreshMcpServerTools(targetServer)
    const nextServers = servers.map((server) => (server.id === normalizedId ? refreshedServer : server))
    updateConfig({ mcpServers: nextServers })
    return nextServers
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to refresh MCP tools.'
    const nextServers = servers.map((server) =>
      server.id === normalizedId ? { ...server, lastError: message, lastSyncedAt: Date.now() } : server
    )
    updateConfig({ mcpServers: nextServers })
    throw new Error(message)
  }
}
