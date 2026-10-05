import {
  EXCALIDRAW_CREATE_VIEW_TOOL,
  EXCALIDRAW_EXPORT_TOOL,
  EXCALIDRAW_READ_CHECKPOINT_TOOL
} from '../../shared/chat/excalidraw'
import type { McpServer, McpTool } from '../../shared/mcp/mcp'
import {
  callMcpTool,
  initializeMcpServer,
  normalizeMcpToolNameSegment,
  type McpToolRegistryEntry
} from '../services/mcpClient'
import { getMcpServers } from './servers'

export function getActiveMcpToolRegistry(): McpToolRegistryEntry[] {
  const servers = getMcpServers().filter((server) => server.active)
  const registry: McpToolRegistryEntry[] = []

  servers.forEach((server) => {
    server.tools
      .filter((tool) => tool.enabled)
      .forEach((tool) => {
        registry.push({
          server,
          tool,
          qualifiedName: `mcp_${normalizeMcpToolNameSegment(server.id)}_${normalizeMcpToolNameSegment(tool.name)}`
        })
      })
  })

  return registry
}

export function findExcalidrawMcpServer(rawServerId?: unknown): McpServer | undefined {
  const activeServers = getMcpServers().filter((server) => server.active)
  const serverId = typeof rawServerId === 'string' ? rawServerId.trim() : ''

  if (serverId) {
    const direct = activeServers.find((server) => server.id === serverId)
    if (direct) return direct
  }

  return (
    activeServers.find((server) =>
      server.tools.some(
        (tool) =>
          tool.name === EXCALIDRAW_READ_CHECKPOINT_TOOL || tool.name === EXCALIDRAW_EXPORT_TOOL
      )
    ) ??
    activeServers.find((server) =>
      server.tools.some((tool) => tool.name === EXCALIDRAW_CREATE_VIEW_TOOL)
    )
  )
}

export async function callExcalidrawMcpTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  await initializeMcpServer(server)
  const tool: McpTool = { name: toolName, enabled: true }
  const result = await callMcpTool(server, tool, JSON.stringify(args))
  return result.content
}
