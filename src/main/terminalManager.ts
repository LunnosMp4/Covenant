import { spawn, type IPty } from 'node-pty'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  MAX_TERMINAL_COLS,
  MAX_TERMINAL_ROWS,
  MIN_TERMINAL_COLS,
  MIN_TERMINAL_ROWS,
  sanitizeTerminalDimension
} from '../shared/terminal/dimensions'
import type {
  TerminalCommandResult,
  TerminalExitPayload,
  TerminalSessionState,
  TerminalStartResult
} from '../shared/terminal/terminal'
import { commandTerminator, wrapCommand } from './terminal/shellIntegration'
import { ShellStateTracker } from './terminal/sessionState'

export type { TerminalExitPayload, TerminalStartResult }

interface ShellCandidate {
  command: string
  args: string[]
}

type DataListener = (sessionId: string, data: string) => void
type ExitListener = (payload: TerminalExitPayload) => void
type StateListener = (state: TerminalSessionState) => void

interface PtySession {
  id: string
  pty: IPty
  shell: string
  cwd: string
  tracker: ShellStateTracker
  dataListeners: Set<DataListener>
  exitListeners: Set<ExitListener>
}

const COMMAND_TIMEOUT_MS = 60_000

function validateShellPath(command: string): boolean {
  try {
    return existsSync(command)
  } catch {
    return false
  }
}

function getShellCandidates(preferredShell?: string): ShellCandidate[] {
  if (process.platform === 'win32') {
    const candidates: ShellCandidate[] = []

    if (preferredShell && validateShellPath(preferredShell)) {
      candidates.push({ command: preferredShell, args: ['-NoLogo'] })
    }

    candidates.push(
      { command: 'pwsh.exe', args: ['-NoLogo'] },
      { command: 'powershell.exe', args: ['-NoLogo'] },
      { command: 'cmd.exe', args: [] }
    )

    return candidates
  }

  // macOS and Linux
  const candidates: ShellCandidate[] = []

  // Add preferred shell first if provided
  if (preferredShell && validateShellPath(preferredShell)) {
    candidates.push({ command: preferredShell, args: [] })
  }

  // For macOS, prioritize zsh -> bash
  if (process.platform === 'darwin') {
    if (!preferredShell || preferredShell !== '/bin/zsh') {
      if (validateShellPath('/bin/zsh')) {
        candidates.push({ command: '/bin/zsh', args: [] })
      }
    }
    if (!preferredShell || preferredShell !== '/bin/bash') {
      if (validateShellPath('/bin/bash')) {
        candidates.push({ command: '/bin/bash', args: [] })
      }
    }
  } else {
    // For other Unix-like systems, use $SHELL first
    const envShell = process.env.SHELL?.trim()
    if (envShell && validateShellPath(envShell)) {
      candidates.push({ command: envShell, args: [] })
    }
    if (validateShellPath('/bin/bash')) {
      candidates.push({ command: '/bin/bash', args: [] })
    }
  }

  // Fallback to sh if available
  if (validateShellPath('/bin/sh')) {
    candidates.push({ command: '/bin/sh', args: [] })
  }

  return candidates
}

function extractShellName(shellPath: string): string {
  const parts = shellPath.replace(/\\/g, '/').split('/')
  const last = parts[parts.length - 1] || shellPath
  return last.replace('.exe', '').replace('.Exe', '')
}

class TerminalManager {
  private readonly sessionMap = new Map<string, PtySession>()

  private readonly globalDataListeners = new Set<DataListener>()

  private readonly globalExitListeners = new Set<ExitListener>()

  private readonly globalStateListeners = new Set<StateListener>()

  createSession(cols?: number, rows?: number, preferredShell?: string): TerminalStartResult {
    const normalizedCols = sanitizeTerminalDimension(cols, DEFAULT_TERMINAL_COLS, MIN_TERMINAL_COLS, MAX_TERMINAL_COLS)
    const normalizedRows = sanitizeTerminalDimension(rows, DEFAULT_TERMINAL_ROWS, MIN_TERMINAL_ROWS, MAX_TERMINAL_ROWS)

    const shellCandidates = getShellCandidates(preferredShell)
    const errors: Array<{ shell: string; error: string }> = []

    for (const candidate of shellCandidates) {
      try {
        const isWin = process.platform === 'win32'

        const spawnEnv: Record<string, string> = isWin
          ? ({ ...(process.env as Record<string, string>) })
          : {
              PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
              HOME: process.env.HOME || '/tmp',
              SHELL: candidate.command,
              TERM: 'xterm-256color',
              LANG: process.env.LANG || 'en_US.UTF-8',
              ...(process.env.LC_ALL ? { LC_ALL: process.env.LC_ALL } : {})
            }

        const spawnCwd = isWin
          ? (process.env.USERPROFILE || process.cwd())
          : process.cwd()

        const processHandle = spawn(candidate.command, candidate.args, {
          name: 'xterm-256color',
          cols: normalizedCols,
          rows: normalizedRows,
          cwd: spawnCwd,
          env: spawnEnv,
          ...(isWin ? { useConpty: true } : {})
        })

        const sessionId = randomUUID()
        const tracker = new ShellStateTracker(sessionId, candidate.command, spawnCwd)
        tracker.onStateChange((state) => {
          this.globalStateListeners.forEach((listener) => listener(state))
        })
        const session: PtySession = {
          id: sessionId,
          pty: processHandle,
          shell: candidate.command,
          cwd: spawnCwd,
          tracker,
          dataListeners: new Set(),
          exitListeners: new Set()
        }

        this.bindSession(session)
        this.sessionMap.set(sessionId, session)

        console.debug(`Successfully spawned shell "${candidate.command}" (session: ${sessionId})`)

        return {
          sessionId,
          pid: processHandle.pid,
          shell: candidate.command,
          created: true
        }
      } catch (error) {
        errors.push({
          shell: candidate.command,
          error: error instanceof Error ? error.message : String(error)
        })
        console.debug(`Failed to spawn shell ${candidate.command}: ${errors[errors.length - 1].error}`)
      }
    }

    const errorDetails = errors.map((e) => `${e.shell}: ${e.error}`).join('; ')
    throw new Error(
      `Unable to start terminal shell. Tried: ${errorDetails || 'no candidates available'}`
    )
  }

  write(sessionId: string, data: string): void {
    if (!data) return
    const session = this.sessionMap.get(sessionId)
    if (!session) return
    session.pty.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessionMap.get(sessionId)
    if (!session) return

    const normalizedCols = sanitizeTerminalDimension(cols, DEFAULT_TERMINAL_COLS, MIN_TERMINAL_COLS, MAX_TERMINAL_COLS)
    const normalizedRows = sanitizeTerminalDimension(rows, DEFAULT_TERMINAL_ROWS, MIN_TERMINAL_ROWS, MAX_TERMINAL_ROWS)
    session.pty.resize(normalizedCols, normalizedRows)
  }

  kill(sessionId: string): void {
    const session = this.sessionMap.get(sessionId)
    if (!session) return
    session.pty.kill()
  }

  getShellName(sessionId: string): string {
    const session = this.sessionMap.get(sessionId)
    if (!session) return ''
    return extractShellName(session.shell)
  }

  getSessionCount(): number {
    return this.sessionMap.size
  }

  hasSession(sessionId: string): boolean {
    return this.sessionMap.has(sessionId)
  }

  getFirstSessionId(): string | null {
    const first = this.sessionMap.keys().next()
    return first.done ? null : first.value
  }

  getSessions(): Array<{ sessionId: string; shell: string; cwd: string }> {
    return [...this.sessionMap.entries()].map(([id, s]) => ({
      sessionId: id,
      shell: extractShellName(s.shell),
      cwd: s.tracker.getState().cwd
    }))
  }

  getState(sessionId: string): TerminalSessionState | null {
    const session = this.sessionMap.get(sessionId)
    if (!session) return null
    return session.tracker.getState()
  }

  readOutput(sessionId: string, lineCount?: number): string {
    const session = this.sessionMap.get(sessionId)
    if (!session) return ''
    return session.tracker.read(lineCount)
  }

  onState(listener: StateListener): () => void {
    this.globalStateListeners.add(listener)
    return () => {
      this.globalStateListeners.delete(listener)
    }
  }

  /**
   * Writes a command and, for shells that support the sentinel, resolves with
   * its exit code, resulting cwd, and captured output once it completes.
   */
  runCommand(sessionId: string, command: string, timeoutMs = COMMAND_TIMEOUT_MS): Promise<TerminalCommandResult> {
    const session = this.sessionMap.get(sessionId)
    if (!session) {
      return Promise.resolve({ success: false, exitCode: null, cwd: '', output: '', error: 'Unknown session.' })
    }

    const state = session.tracker.getState()
    const { wrapped, token, supported } = wrapCommand(session.shell, command)
    const terminator = commandTerminator(session.shell)

    if (!supported) {
      session.pty.write(`${command}${terminator}`)
      return Promise.resolve({
        success: true,
        exitCode: null,
        cwd: state.cwd,
        output: '',
        error: 'This shell does not report command completion; output could not be captured.'
      })
    }

    const outputStart = session.tracker.getOutputLength()

    return new Promise<TerminalCommandResult>((resolve) => {
      let settled = false

      const finish = (result: TerminalCommandResult): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        unsubscribe()
        resolve(result)
      }

      const unsubscribe = session.tracker.onSentinel((match) => {
        if (match.token !== token) return
        finish({
          success: true,
          exitCode: match.exitCode,
          cwd: match.cwd || state.cwd,
          output: session.tracker.readSince(outputStart)
        })
      })

      const timer = setTimeout(() => {
        session.tracker.markCommandFinished()
        finish({
          success: false,
          exitCode: null,
          cwd: session.tracker.getState().cwd,
          output: session.tracker.readSince(outputStart),
          error: `Command timed out after ${Math.round(timeoutMs / 1000)}s.`
        })
      }, timeoutMs)

      session.tracker.markCommandStart(command)
      session.pty.write(`${wrapped}${terminator}`)
    })
  }

  disposeAll(): void {
    for (const session of this.sessionMap.values()) {
      try {
        session.pty.kill()
      } catch {
        // Ignore errors during bulk cleanup.
      }
      session.dataListeners.clear()
      session.exitListeners.clear()
    }
    this.sessionMap.clear()
    this.globalDataListeners.clear()
    this.globalExitListeners.clear()
    this.globalStateListeners.clear()
  }

  onData(listener: DataListener): () => void {
    this.globalDataListeners.add(listener)
    for (const session of this.sessionMap.values()) {
      session.dataListeners.add(listener)
    }

    return () => {
      this.globalDataListeners.delete(listener)
      for (const session of this.sessionMap.values()) {
        session.dataListeners.delete(listener)
      }
    }
  }

  onExit(listener: ExitListener): () => void {
    this.globalExitListeners.add(listener)
    for (const session of this.sessionMap.values()) {
      session.exitListeners.add(listener)
    }

    return () => {
      this.globalExitListeners.delete(listener)
      for (const session of this.sessionMap.values()) {
        session.exitListeners.delete(listener)
      }
    }
  }

  private bindSession(session: PtySession): void {
    const { pty, id: sessionId } = session

    pty.onData((chunk) => {
      session.tracker.feed(chunk)
      this.globalDataListeners.forEach((listener) => {
        listener(sessionId, chunk)
      })
    })

    pty.onExit(({ exitCode, signal }) => {
      this.sessionMap.delete(sessionId)

      const payload: TerminalExitPayload = { sessionId, exitCode, signal }

      this.globalExitListeners.forEach((listener) => {
        listener(payload)
      })

      session.dataListeners.clear()
      session.exitListeners.clear()
    })
  }
}

export const terminalManager = new TerminalManager()
