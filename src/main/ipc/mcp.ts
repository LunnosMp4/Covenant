import { ipcMain } from 'electron'
import type { McpServer } from '../../shared/mcp/mcp'
import {
  deleteMcpServer,
  getMcpServers,
  refreshMcpServerToolsById,
  saveMcpServer
} from '../mcp/servers'
import { testMcpServer } from '../services/mcpClient'

export function registerMcpIpc(): void {
  ipcMain.handle('get-mcp-servers', () => {
    return getMcpServers()
  })

  ipcMain.handle('save-mcp-server', (_event, payload: Partial<McpServer>) => {
    return saveMcpServer(payload)
  })

  ipcMain.handle('delete-mcp-server', (_event, serverId: string) => {
    return deleteMcpServer(serverId)
  })

  ipcMain.handle('refresh-mcp-server-tools', async (_event, serverId: string) => {
    return refreshMcpServerToolsById(serverId)
  })

  ipcMain.handle('test-mcp-server', async (_event, payload: {
    name?: string
    url?: string
    auth?: McpServer['auth']
    appendMcpSuffix?: boolean
  }) => {
    const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
    const url = typeof payload?.url === 'string' ? payload.url.trim() : ''
    if (!name || !url) {
      return { ok: false, message: 'Server name and URL are required.', toolCount: 0 }
    }

    return testMcpServer({
      name,
      url,
      auth: payload?.auth ?? { type: 'none' },
      appendMcpSuffix: payload?.appendMcpSuffix ?? true,
      timeoutMs: 15_000
    })
  })
}
