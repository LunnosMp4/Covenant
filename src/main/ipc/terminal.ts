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
import type { TerminalApprovalReply, TerminalExitPayload, TerminalSessionState } from '../../shared/terminal/terminal'
import { readConfig } from '../config/configStore'
import { forgetSessionApprovals, resolveTerminalApproval } from '../terminal/approval'
import { terminalManager } from '../terminalManager'
import { assertMainWindowSender } from '../windows'

const terminalSubscribers = new Set<WebContents>()
let lastActiveSessionId: string | null = null

/**
 * PTY chunks arrive in tiny reads (often a few dozen bytes). Forwarding each one
 * as its own IPC message drowns the renderer during bursty output, so chunks are
 * coalesced per session into a single message per flush window. Ordering inside
 * a session is preserved; the flush also runs before `terminal:exit` so no
 * output can be dropped or reordered relative to process exit.
 */
const TERMINAL_DATA_FLUSH_MS = 12
const pendingTerminalData = new Map<string, string[]>()
let terminalDataFlushTimer: NodeJS.Timeout | null = null

function flushTerminalData(): void {
  if (terminalDataFlushTimer) {
    clearTimeout(terminalDataFlushTimer)
    terminalDataFlushTimer = null
  }
  if (pendingTerminalData.size === 0) return

  const pending = [...pendingTerminalData.entries()]
  pendingTerminalData.clear()

  for (const [sessionId, chunks] of pending) {
    if (chunks.length === 0) continue
    emitTerminalEvent('terminal:data', { sessionId, chunk: chunks.join('') })
  }
}

function queueTerminalData(sessionId: string, chunk: string): void {
  if (!chunk) return

  const queued = pendingTerminalData.get(sessionId)
  if (queued) {
    queued.push(chunk)
  } else {
    pendingTerminalData.set(sessionId, [chunk])
  }

  if (terminalDataFlushTimer) return
  terminalDataFlushTimer = setTimeout(() => {
    terminalDataFlushTimer = null
    flushTerminalData()
  }, TERMINAL_DATA_FLUSH_MS)
  terminalDataFlushTimer.unref?.()
}

function attachTerminalSubscriber(sender: WebContents): void {
  if (sender.isDestroyed() || terminalSubscribers.has(sender)) {
    return
  }

  terminalSubscribers.add(sender)

  sender.once('destroyed', () => {
    terminalSubscribers.delete(sender)
  })
}

function emitTerminalEvent(
  channel: 'terminal:data' | 'terminal:exit' | 'terminal:state-changed',
  payload: unknown
): void {
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
    queueTerminalData(sessionId, chunk)
  })

  terminalManager.onExit((payload: TerminalExitPayload) => {
    flushTerminalData()
    if (payload.sessionId === lastActiveSessionId) {
      lastActiveSessionId = null
    }
    forgetSessionApprovals(payload.sessionId)
    emitTerminalEvent('terminal:exit', payload)
  })

  terminalManager.onState((state: TerminalSessionState) => {
    emitTerminalEvent('terminal:state-changed', { sessionId: state.sessionId, state })
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
    forgetSessionApprovals(sessionId)
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

  ipcMain.handle('terminal:state', (event, payload?: { sessionId?: unknown }) => {
    assertMainWindowSender(event.sender)
    const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : ''
    if (!sessionId) return { success: false as const, error: 'Missing session id.' }
    const state = terminalManager.getState(sessionId)
    if (!state) return { success: false as const, error: 'Unknown session.' }
    return { success: true as const, state }
  })

  ipcMain.handle('terminal:read', (event, payload?: { sessionId?: unknown; lines?: unknown }) => {
    assertMainWindowSender(event.sender)
    const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : ''
    if (!sessionId) return { success: false as const, error: 'Missing session id.' }
    const lines = typeof payload?.lines === 'number' && Number.isFinite(payload.lines)
      ? Math.floor(payload.lines)
      : undefined
    return { success: true as const, output: terminalManager.readOutput(sessionId, lines) }
  })

  ipcMain.handle('terminal:run-command', async (event, payload?: { sessionId?: unknown; command?: unknown }) => {
    assertMainWindowSender(event.sender)

    const command = typeof payload?.command === 'string' ? payload.command : ''
    if (!command.trim()) return { success: false as const, error: 'Empty command.' }

    let sessionId = typeof payload?.sessionId === 'string' && payload.sessionId.length > 0 ? payload.sessionId : ''
    if (!sessionId || !terminalManager.hasSession(sessionId)) {
      sessionId = terminalManager.getFirstSessionId() ?? ''
    }
    if (!sessionId) return { success: false as const, error: 'No active terminal session.' }

    const result = await terminalManager.runCommand(sessionId, command)
    return { ...result, sessionId }
  })

  ipcMain.handle(
    'terminal:approval-reply',
    (event, payload?: { requestId?: unknown; reply?: unknown }) => {
      assertMainWindowSender(event.sender)

      const requestId = typeof payload?.requestId === 'string' ? payload.requestId : ''
      const rawReply = payload?.reply
      const reply: TerminalApprovalReply | null =
        rawReply === 'once' || rawReply === 'always' || rawReply === 'reject' ? rawReply : null

      if (!requestId || !reply) return { success: false }
      return { success: resolveTerminalApproval(requestId, reply) }
    }
  )

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
    event.sender.send('toggle-visibility', true, 'terminal')

    return { success: true, sessionId, created }
  })
}
