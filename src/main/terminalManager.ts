import { spawn, type IPty } from 'node-pty'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 30
const MIN_COLS = 20
const MAX_COLS = 400
const MIN_ROWS = 5
const MAX_ROWS = 200

interface ShellCandidate {
  command: string
  args: string[]
}

export interface TerminalStartResult {
  sessionId: string
  pid: number
  shell: string
  created: boolean
  error?: string
}

export interface TerminalExitPayload {
  sessionId: string
  exitCode: number
  signal?: number
}

type DataListener = (sessionId: string, data: string) => void
type ExitListener = (payload: TerminalExitPayload) => void

interface PtySession {
  id: string
  pty: IPty
  shell: string
  dataListeners: Set<DataListener>
  exitListeners: Set<ExitListener>
}

function clampDimension(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  const normalizedValue = Math.floor(value as number)
  return Math.min(max, Math.max(min, normalizedValue))
}

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

  createSession(cols?: number, rows?: number, preferredShell?: string): TerminalStartResult {
    const normalizedCols = clampDimension(cols, DEFAULT_COLS, MIN_COLS, MAX_COLS)
    const normalizedRows = clampDimension(rows, DEFAULT_ROWS, MIN_ROWS, MAX_ROWS)

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
        const session: PtySession = {
          id: sessionId,
          pty: processHandle,
          shell: candidate.command,
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

    const normalizedCols = clampDimension(cols, DEFAULT_COLS, MIN_COLS, MAX_COLS)
    const normalizedRows = clampDimension(rows, DEFAULT_ROWS, MIN_ROWS, MAX_ROWS)
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

  getSessions(): Array<{ sessionId: string; shell: string }> {
    return [...this.sessionMap.entries()].map(([id, s]) => ({
      sessionId: id,
      shell: extractShellName(s.shell)
    }))
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
