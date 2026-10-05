import { ipcMain, session } from 'electron'
import {
  EXCALIDRAW_EXPORT_TOOL,
  EXCALIDRAW_READ_CHECKPOINT_TOOL,
  sanitizeCheckpointId
} from '../../shared/chat/excalidraw'
import { callExcalidrawMcpTool, findExcalidrawMcpServer } from '../mcp/registry'

const MAX_EXCALIDRAW_EXPORT_BYTES = 5 * 1024 * 1024

export function registerExcalidrawIpc(): void {
  ipcMain.handle(
    'excalidraw:read-checkpoint',
    async (_event, payload: { serverId?: unknown; checkpointId?: unknown }) => {
      const server = findExcalidrawMcpServer(payload?.serverId)
      const checkpointId = sanitizeCheckpointId(payload?.checkpointId)

      if (!server || !checkpointId) {
        return { ok: false, error: 'No active Excalidraw MCP server or invalid checkpoint id.' }
      }

      try {
        const content = await callExcalidrawMcpTool(server, EXCALIDRAW_READ_CHECKPOINT_TOOL, {
          id: checkpointId
        })
        const parsed = JSON.parse(content) as { elements?: unknown } | null
        if (!parsed || !Array.isArray(parsed.elements)) {
          return { ok: false, error: 'Checkpoint could not be read.', serverId: server.id }
        }
        return { ok: true, elements: parsed.elements, serverId: server.id }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to read checkpoint.'
        return { ok: false, error: message, serverId: server.id }
      }
    }
  )

  ipcMain.handle(
    'excalidraw:export',
    async (_event, payload: { serverId?: unknown; json?: unknown }) => {
      const server = findExcalidrawMcpServer(payload?.serverId)
      const json = typeof payload?.json === 'string' ? payload.json : ''

      if (!server || !json.trim()) {
        return { ok: false, error: 'No active Excalidraw MCP server or empty scene.' }
      }
      if (json.length > MAX_EXCALIDRAW_EXPORT_BYTES) {
        return { ok: false, error: 'Diagram is too large to export.' }
      }

      try {
        const content = await callExcalidrawMcpTool(server, EXCALIDRAW_EXPORT_TOOL, { json })
        const url = content.trim()
        if (!/^https:\/\/excalidraw\.com\//i.test(url)) {
          return { ok: false, error: 'Unexpected export response from MCP server.', serverId: server.id }
        }
        return { ok: true, url, serverId: server.id }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to export diagram.'
        return { ok: false, error: message, serverId: server.id }
      }
    }
  )

  // Embedded Excalidraw views are independent, so clear excalidraw.com's persisted
  // scene before navigating. Otherwise loading a new #json link triggers the
  // "replace your existing content" confirmation prompt every time.
  ipcMain.handle('excalidraw:clear-storage', async () => {
    try {
      await session.defaultSession.clearStorageData({
        origin: 'https://excalidraw.com',
        storages: ['localstorage', 'indexdb', 'websql']
      })
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })
}
