import { ipcMain, type WebContents } from 'electron'
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  MAX_TERMINAL_COLS,
  MAX_TERMINAL_ROWS,
  MIN_TERMINAL_COLS,
  MIN_TERMINAL_ROWS,
  sanitizeTerminalDimension,
  sanitizeTerminalInput
} from '../../shared/terminal/dimensions'
import type { TerminalExitPayload } from '../../shared/terminal/terminal'
import { readConfig } from '../config/configStore'
import { terminalManager } from '../terminalManager'
import { assertMainWindowSender } from '../windows'

const terminalSubscribers = new Set<WebContents>()
let lastActiveSessionId: string | null = null

function attachTerminalSubscriber(sender: WebContents): void {
  if (sender.isDestroyed() || terminalSubscribers.has(sender)) {
    return
  }

  terminalSubscribers.add(sender)

  sender.once('destroyed', () => {
    terminalSubscribers.delete(sender)
  })
}

function emitTerminalEvent(channel: 'terminal:data' | 'terminal:exit', payload: unknown): void {
  terminalSubscribers.forEach((subscriber) => {
    if (subscriber.isDestroyed()) {
      terminalSubscribers.delete(subscriber)
      return
    }

    subscriber.send(channel, payload)
  })
}

export function registerTerminalIpc(): void {
  terminalManager.onData((sessionId, chunk) => {
    emitTerminalEvent('terminal:data', { sessionId, chunk })
  })

  terminalManager.onExit((payload: TerminalExitPayload) => {
    if (payload.sessionId === lastActiveSessionId) {
      lastActiveSessionId = null
    }
    emitTerminalEvent('terminal:exit', payload)
  })

  ipcMain.handle('terminal:start', (event, payload?: { cols?: unknown; rows?: unknown }) => {
    assertMainWindowSender(event.sender)

    const cols = sanitizeTerminalDimension(
      payload?.cols,
      DEFAULT_TERMINAL_COLS,
      MIN_TERMINAL_COLS,
      MAX_TERMINAL_COLS
    )
    const rows = sanitizeTerminalDimension(
      payload?.rows,
      DEFAULT_TERMINAL_ROWS,
      MIN_TERMINAL_ROWS,
      MAX_TERMINAL_ROWS
    )

    attachTerminalSubscriber(event.sender)

    const config = readConfig()

    try {
      const result = terminalManager.createSession(cols, rows, config.preferredShell)
      if (result.created && result.sessionId) {
        lastActiveSessionId = result.sessionId
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown terminal error'
      console.error('Terminal start failed:', message)
      return {
        sessionId: '',
        pid: -1,
        shell: '',
        created: false,
        error: message
      }
    }
  })

  ipcMain.handle('terminal:input', (event, payload?: { sessionId?: unknown; input?: unknown }) => {
    assertMainWindowSender(event.sender)

    const sessionId = typeof payload?.sessionId === 'string' && payload.sessionId.length > 0 ? payload.sessionId : ''
    if (!sessionId) return { success: false }

    const input = sanitizeTerminalInput(payload?.input)
    if (!input) {
      return { success: false }
    }

    terminalManager.write(sessionId, input)
    return { success: true }
  })

  ipcMain.handle('terminal:resize', (event, payload?: { sessionId?: unknown; cols?: unknown; rows?: unknown }) => {
    assertMainWindowSender(event.sender)

    const sessionId = typeof payload?.sessionId === 'string' && payload.sessionId.length > 0 ? payload.sessionId : ''
    if (!sessionId) return { success: false }

    const cols = sanitizeTerminalDimension(
      payload?.cols,
      DEFAULT_TERMINAL_COLS,
      MIN_TERMINAL_COLS,
      MAX_TERMINAL_COLS
    )
    const rows = sanitizeTerminalDimension(
      payload?.rows,
      DEFAULT_TERMINAL_ROWS,
      MIN_TERMINAL_ROWS,
      MAX_TERMINAL_ROWS
    )

    terminalManager.resize(sessionId, cols, rows)
    return { success: true }
  })

  ipcMain.handle('terminal:kill', (event, payload?: { sessionId?: unknown }) => {
    assertMainWindowSender(event.sender)

    const sessionId = typeof payload?.sessionId === 'string' && payload.sessionId.length > 0 ? payload.sessionId : ''
    if (!sessionId) return { success: false }

    terminalManager.kill(sessionId)
    if (sessionId === lastActiveSessionId) {
      lastActiveSessionId = null
    }
    return { success: true }
  })

  ipcMain.on('terminal:report-active-session', (_event, sessionId: unknown) => {
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      lastActiveSessionId = sessionId
    }
  })

  ipcMain.handle('terminal:list-sessions', () => {
    return terminalManager.getSessions()
  })

  ipcMain.handle('terminal:send-to-active-session', (event, payload?: { code?: unknown }) => {
    assertMainWindowSender(event.sender)

    const code = typeof payload?.code === 'string' ? payload.code : ''
    if (!code) return { success: false }

    let sessionId: string | null = null
    let created = false

    if (lastActiveSessionId && terminalManager.hasSession(lastActiveSessionId)) {
      sessionId = lastActiveSessionId
    } else {
      sessionId = terminalManager.getFirstSessionId()
    }

    if (!sessionId) {
      const config = readConfig()
      const result = terminalManager.createSession(DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS, config.preferredShell)
      if (!result.created || !result.sessionId) {
        return { success: false, error: result.error ?? 'Failed to create terminal session' }
      }
      sessionId = result.sessionId
      lastActiveSessionId = sessionId
      created = true
      attachTerminalSubscriber(event.sender)
    }

    const isMultiLine = code.includes('\n')
    const wrapped = isMultiLine ? `\x1b[200~${code}\x1b[201~` : code

    terminalManager.write(sessionId, wrapped)
    event.sender.send('toggle-visibility', true, true)

    return { success: true, sessionId, created }
  })
}
