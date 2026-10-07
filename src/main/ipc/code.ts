import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { log } from '../logger'
import { readConfig, updateConfig } from '../config/configStore'
import { getLogFilePath } from '../logger'
import { normalizeCodeSettings } from '../../shared/code/codeNormalizers'
import type { CodeFormValue, CodeSettings } from '../../shared/code/code'
import { addCodeProject, getCodeProjects, removeCodeProject } from '../features/codeProjects'
import {
  addCodeConnection,
  getActiveConnectionId,
  getCodeConnections,
  removeCodeConnection,
  updateCodeConnection
} from '../features/codeConnections'
import { getCodeService } from '../code/codeService'
import { getCodeActivityTracker } from '../code/codeActivity'
import type { CodeEngineEvent } from '../code/codeEngine'
import { clearSshCredential, saveSshCredential } from '../code/ssh/sshCredentials'
import { browseRemote, disposeBrowseSession, statRemote } from '../code/ssh/remoteBrowse'
import { LOCAL_CONNECTION_ID } from '../../shared/code/connection'

const codeSubscribers = new Set<Electron.WebContents>()
let serviceSubscribed = false

function attachSubscriber(sender: Electron.WebContents): void {
  if (codeSubscribers.has(sender)) return
  codeSubscribers.add(sender)
  sender.once('destroyed', () => codeSubscribers.delete(sender))
}

function ensureServiceSubscription(): void {
  if (serviceSubscribed) return
  const service = getCodeService()
  if (!service) return
  service.subscribe(emitCodeEvent)
  serviceSubscribed = true
}

function emitCodeEvent(event: CodeEngineEvent): void {
  for (const sender of codeSubscribers) {
    if (sender.isDestroyed()) {
      codeSubscribers.delete(sender)
      continue
    }
    sender.send('code:event', event)
  }
}

function requireService() {
  const service = getCodeService()
  if (!service) throw new Error('Code service is not initialized')
  return service
}

function errorResult(error: unknown): { success: false; error: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error) }
}

export function registerCodeIpc(): void {
  ipcMain.on('code:subscribe', (event) => {
    ensureServiceSubscription()
    attachSubscriber(event.sender)
  })

  ipcMain.handle('code:status', () => {
    try {
      return { success: true as const, status: requireService().getStatus() }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:auth:set', async (_event, payload: unknown) => {
    try {
      const key = payload && typeof payload === 'object' ? (payload as { key?: unknown }).key : undefined
      if (typeof key !== 'string' || !key.trim()) {
        throw new Error('API key is required')
      }
      const service = requireService()
      await service.setGoApiKey(key.trim())
      return { success: true as const, status: service.getStatus() }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:auth:clear', async () => {
    try {
      const service = requireService()
      await service.clearGoApiKey()
      return { success: true as const, status: service.getStatus() }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:auth:test', async () => {
    try {
      const connected = await requireService().testGoConnection()
      return { success: true as const, connected }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:models', async () => {
    try {
      const service = requireService()
      await service.isConnectedOrConnect()
      const models = await service.getEngine().listModels()
      return { success: true as const, models }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:agents:list', async () => {
    try {
      const service = requireService()
      await service.isConnectedOrConnect()
      const agents = await service.getEngine().listAgents()
      return { success: true as const, agents }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:agents:switch', async (_event, payload: unknown) => {
    try {
      const raw = (payload ?? {}) as Record<string, unknown>
      const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : ''
      const agent = typeof raw.agent === 'string' ? raw.agent : ''
      if (!sessionId || !agent) throw new Error('A session id and agent are required')
      await requireService().getEngine().switchAgent(sessionId, agent)
      return { success: true as const }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:projects:list', () => {
    try {
      return { success: true as const, projects: getCodeProjects() }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:projects:add', async (_event, payload: unknown) => {
    try {
      const raw = (payload ?? {}) as Record<string, unknown>
      const connectionId =
        typeof raw.connectionId === 'string' && raw.connectionId
          ? raw.connectionId
          : LOCAL_CONNECTION_ID
      const directory = typeof raw.directory === 'string' ? raw.directory.trim() : ''
      if (connectionId !== LOCAL_CONNECTION_ID) {
        const type = await statRemote(connectionId, directory)
        if (type !== 'dir') throw new Error(`Not a directory: ${directory}`)
      }
      const projects = addCodeProject(
        { directory, name: raw.name, connectionId },
        { validateLocal: connectionId === LOCAL_CONNECTION_ID }
      )
      return { success: true as const, projects }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:projects:remove', (_event, id: unknown) => {
    try {
      return { success: true as const, projects: removeCodeProject(id) }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:connections:list', () => {
    try {
      return {
        success: true as const,
        connections: getCodeConnections(),
        activeConnectionId: getActiveConnectionId()
      }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:connections:add', (_event, payload: unknown) => {
    try {
      const connections = addCodeConnection((payload ?? {}) as Record<string, unknown>)
      return { success: true as const, connections, activeConnectionId: getActiveConnectionId() }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:connections:update', (_event, payload: unknown) => {
    try {
      const raw = (payload ?? {}) as Record<string, unknown>
      const id = typeof raw.id === 'string' ? raw.id : ''
      if (!id) throw new Error('A connection id is required')
      const connections = updateCodeConnection(id, (raw.patch ?? {}) as Record<string, unknown>)
      // Host/auth may have changed; drop any cached browse session.
      disposeBrowseSession(id)
      return { success: true as const, connections }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:connections:remove', async (_event, id: unknown) => {
    try {
      const targetId = typeof id === 'string' ? id : ''
      if (!targetId) throw new Error('A connection id is required')
      const wasActive = getActiveConnectionId() === targetId
      const connections = removeCodeConnection(targetId)
      disposeBrowseSession(targetId)
      clearSshCredential(targetId)
      if (wasActive) {
        await requireService().switchConnection(LOCAL_CONNECTION_ID)
      }
      return { success: true as const, connections, activeConnectionId: getActiveConnectionId() }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:connections:select', async (_event, id: unknown) => {
    try {
      const targetId = typeof id === 'string' ? id : ''
      if (!targetId) throw new Error('A connection id is required')
      await requireService().switchConnection(targetId)
      return {
        success: true as const,
        activeConnectionId: requireService().getActiveConnectionId()
      }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:connections:test', async (_event, id: unknown) => {
    try {
      const targetId = typeof id === 'string' ? id : ''
      if (!targetId) throw new Error('A connection id is required')
      const status = await requireService().testConnection(targetId)
      return { success: true as const, status }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:connections:set-credential', (_event, payload: unknown) => {
    try {
      const raw = (payload ?? {}) as Record<string, unknown>
      const id = typeof raw.id === 'string' ? raw.id : ''
      if (!id) throw new Error('A connection id is required')
      saveSshCredential(id, {
        password: typeof raw.password === 'string' ? raw.password : undefined,
        passphrase: typeof raw.passphrase === 'string' ? raw.passphrase : undefined
      })
      return { success: true as const }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:remote:browse', async (_event, payload: unknown) => {
    try {
      const raw = (payload ?? {}) as Record<string, unknown>
      const connectionId = typeof raw.connectionId === 'string' ? raw.connectionId : ''
      if (!connectionId) throw new Error('A connection id is required')
      const path = typeof raw.path === 'string' ? raw.path : undefined
      const result = await browseRemote(connectionId, path)
      return { success: true as const, ...result }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:pick-file', async (event) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const options: Electron.OpenDialogOptions = { properties: ['openFile', 'showHiddenFiles'] }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || result.filePaths.length === 0) {
        return { success: true as const, path: undefined }
      }
      return { success: true as const, path: result.filePaths[0] }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:pick-directory', async (event) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const result = window
        ? await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: true as const, directory: undefined }
      }
      return { success: true as const, directory: result.filePaths[0] }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:sessions:list', async (_event, payload: unknown) => {
    try {
      const service = requireService()
      await service.isConnectedOrConnect()
      const directory =
        payload && typeof payload === 'object' ? (payload as { directory?: unknown }).directory : undefined
      const sessions = await service
        .getEngine()
        .listSessions(typeof directory === 'string' ? directory : undefined)
      return { success: true as const, sessions }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:sessions:create', async (_event, payload: unknown) => {
    try {
      const service = requireService()
      await service.isConnectedOrConnect()
      const raw = (payload ?? {}) as Record<string, unknown>
      const directory = typeof raw.directory === 'string' ? raw.directory : ''
      if (!directory) throw new Error('A project directory is required')
      const settings = readConfig().code
      const model = raw.model && typeof raw.model === 'object' ? (raw.model as Record<string, unknown>) : undefined
      const session = await service.getEngine().createSession({
        directory,
        model: model
          ? {
              providerID: typeof model.providerID === 'string' ? model.providerID : 'opencode-go',
              id: typeof model.id === 'string' ? model.id : '',
              variant: typeof model.variant === 'string' ? model.variant : settings.defaultVariant || undefined
            }
          : undefined,
        agent: typeof raw.agent === 'string' ? raw.agent : undefined,
        title: typeof raw.title === 'string' ? raw.title : undefined
      })
      return { success: true as const, session }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:sessions:delete', async (_event, sessionId: unknown) => {
    try {
      if (typeof sessionId !== 'string' || !sessionId) throw new Error('A session id is required')
      const service = requireService()
      await service.isConnectedOrConnect()
      await service.getEngine().deleteSession(sessionId)
      return { success: true as const }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:sessions:transcript', async (_event, sessionId: unknown) => {
    try {
      if (typeof sessionId !== 'string' || !sessionId) throw new Error('A session id is required')
      const service = requireService()
      await service.isConnectedOrConnect()
      const transcript = await service.getEngine().getTranscript(sessionId)
      return { success: true as const, transcript }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:prompt', async (_event, payload: unknown) => {
    try {
      const raw = (payload ?? {}) as Record<string, unknown>
      const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : ''
      const text = typeof raw.text === 'string' ? raw.text : ''
      if (!sessionId || !text.trim()) throw new Error('A session id and prompt are required')
      const service = requireService()
      await service.isConnectedOrConnect()
      await service.getEngine().prompt({ sessionId, text: text.trim() })
      return { success: true as const }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:interrupt', async (_event, sessionId: unknown) => {
    try {
      if (typeof sessionId !== 'string' || !sessionId) throw new Error('A session id is required')
      await requireService().getEngine().interrupt(sessionId)
      return { success: true as const }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:switch-model', async (_event, payload: unknown) => {
    try {
      const raw = (payload ?? {}) as Record<string, unknown>
      const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : ''
      const model = raw.model && typeof raw.model === 'object' ? (raw.model as Record<string, unknown>) : undefined
      if (!sessionId || !model) throw new Error('A session id and model are required')
      await requireService().getEngine().switchModel(sessionId, {
        providerID: typeof model.providerID === 'string' ? model.providerID : 'opencode-go',
        id: typeof model.id === 'string' ? model.id : '',
        variant: typeof model.variant === 'string' ? model.variant : undefined
      })
      return { success: true as const }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:permissions:list', async (_event, sessionId: unknown) => {
    try {
      if (typeof sessionId !== 'string' || !sessionId) throw new Error('A session id is required')
      const requests = await requireService().getEngine().listPermissions(sessionId)
      return { success: true as const, requests }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:permissions:reply', async (_event, payload: unknown) => {
    try {
      const raw = (payload ?? {}) as Record<string, unknown>
      const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : ''
      const requestId = typeof raw.requestId === 'string' ? raw.requestId : ''
      const reply = raw.reply
      if (!sessionId || !requestId) throw new Error('A session id and request id are required')
      if (reply !== 'once' && reply !== 'always' && reply !== 'reject') {
        throw new Error('Invalid permission reply')
      }
      await requireService().getEngine().replyPermission({ sessionId, requestId, reply })
      return { success: true as const }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:forms:list', async (_event, sessionId: unknown) => {
    try {
      if (typeof sessionId !== 'string' || !sessionId) throw new Error('A session id is required')
      const forms = await requireService().getEngine().listForms(sessionId)
      return { success: true as const, forms }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:forms:reply', async (_event, payload: unknown) => {
    try {
      const raw = (payload ?? {}) as Record<string, unknown>
      const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : ''
      const formId = typeof raw.formId === 'string' ? raw.formId : ''
      if (!sessionId || !formId) throw new Error('A session id and form id are required')
      const answer = raw.answer && typeof raw.answer === 'object' ? (raw.answer as Record<string, unknown>) : {}
      const normalized: Record<string, CodeFormValue> = {}
      for (const [key, value] of Object.entries(answer)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          normalized[key] = value
        } else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
          normalized[key] = value as string[]
        }
      }
      await requireService().getEngine().replyForm({ sessionId, formId, answer: normalized })
      return { success: true as const }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:forms:cancel', async (_event, payload: unknown) => {
    try {
      const raw = (payload ?? {}) as Record<string, unknown>
      const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : ''
      const formId = typeof raw.formId === 'string' ? raw.formId : ''
      if (!sessionId || !formId) throw new Error('A session id and form id are required')
      const message = typeof raw.message === 'string' ? raw.message : undefined
      await requireService().getEngine().cancelForm({ sessionId, formId, message })
      return { success: true as const }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:diff', async (_event, sessionId: unknown) => {
    try {
      if (typeof sessionId !== 'string' || !sessionId) throw new Error('A session id is required')
      const diff = await requireService().getEngine().getDiff(sessionId)
      return { success: true as const, diff }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:settings:get', () => {
    try {
      return { success: true as const, settings: readConfig().code }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:settings:set', (_event, patch: unknown) => {
    try {
      // Merge the partial patch over the stored settings so callers can update a
      // single field (e.g. the selected model) without wiping the rest.
      const current = readConfig().code
      const merged = {
        ...current,
        ...(patch && typeof patch === 'object' ? (patch as Partial<CodeSettings>) : {})
      }
      const normalized: CodeSettings = normalizeCodeSettings(merged)
      updateConfig({ code: normalized })
      requireService().applySettings(normalized)
      return { success: true as const, settings: normalized }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:logs:open', async () => {
    try {
      await shell.showItemInFolder(getLogFilePath())
      return { success: true as const }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:runtime:restart', async () => {
    try {
      const service = requireService()
      await service.restart()
      return { success: true as const, status: service.getStatus() }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:logs', () => {
    try {
      const service = getCodeService()
      return { success: true as const, logs: service ? service.getLogs() : [] }
    } catch (error) {
      return errorResult(error)
    }
  })

  ipcMain.handle('code:activity:ack', () => {
    getCodeActivityTracker()?.markSeen()
    return { success: true as const }
  })

  log.info('Code IPC registered')
}
