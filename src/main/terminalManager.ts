import { spawn, type IPty } from 'node-pty'
import { existsSync } from 'fs'

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
  pid: number
  shell: string
  created: boolean
}

export interface TerminalExitPayload {
  exitCode: number
  signal?: number
}

type DataListener = (data: string) => void
type ExitListener = (payload: TerminalExitPayload) => void

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
    return [
      { command: 'pwsh.exe', args: ['-NoLogo'] },
      { command: 'powershell.exe', args: ['-NoLogo'] },
      { command: 'cmd.exe', args: [] }
    ]
  }

  // macOS and Linux
  const candidates: ShellCandidate[] = []

  // Add preferred shell first if provided
  if (preferredShell && validateShellPath(preferredShell)) {
    candidates.push({ command: preferredShell, args: [] })
  }

  // For macOS, prioritize zsh → bash
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

class TerminalManager {
  private ptyProcess: IPty | null = null

  private activeShell = ''

  private readonly dataListeners = new Set<DataListener>()

  private readonly exitListeners = new Set<ExitListener>()

  start(cols?: number, rows?: number, preferredShell?: string): TerminalStartResult {
    const normalizedCols = clampDimension(cols, DEFAULT_COLS, MIN_COLS, MAX_COLS)
    const normalizedRows = clampDimension(rows, DEFAULT_ROWS, MIN_ROWS, MAX_ROWS)

    if (this.ptyProcess) {
      this.resize(normalizedCols, normalizedRows)
      return {
        pid: this.ptyProcess.pid,
        shell: this.activeShell,
        created: false
      }
    }

    const shellCandidates = getShellCandidates(preferredShell)
    let lastError: unknown
    const errors: Array<{ shell: string; error: string }> = []

    for (const candidate of shellCandidates) {
      try {
        // Create a minimal environment with only essential variables for shell spawn
        // Using a minimal env helps avoid posix_spawnp failures on macOS
        const spawnEnv: Record<string, string> = {
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
          HOME: process.env.HOME || '/tmp',
          SHELL: candidate.command,
          TERM: 'xterm-256color',
          LANG: process.env.LANG || 'en_US.UTF-8'
        }

        // Only add LC_ALL if it exists
        if (process.env.LC_ALL) {
          spawnEnv.LC_ALL = process.env.LC_ALL
        }

        const processHandle = spawn(candidate.command, candidate.args, {
          name: 'xterm-256color',
          cols: normalizedCols,
          rows: normalizedRows,
          cwd: process.cwd(),
          env: spawnEnv
        })

        this.activeShell = candidate.command
        this.ptyProcess = processHandle
        this.bindTerminalProcess(processHandle)

        console.debug(`Successfully spawned shell: ${candidate.command}`)

        return {
          pid: processHandle.pid,
          shell: this.activeShell,
          created: true
        }
      } catch (error) {
        lastError = error
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

  write(data: string): void {
    if (!this.ptyProcess || !data) {
      return
    }

    this.ptyProcess.write(data)
  }

  resize(cols: number, rows: number): void {
    if (!this.ptyProcess) {
      return
    }

    const normalizedCols = clampDimension(cols, DEFAULT_COLS, MIN_COLS, MAX_COLS)
    const normalizedRows = clampDimension(rows, DEFAULT_ROWS, MIN_ROWS, MAX_ROWS)
    this.ptyProcess.resize(normalizedCols, normalizedRows)
  }

  kill(): void {
    this.ptyProcess?.kill()
  }

  dispose(): void {
    this.kill()
    this.dataListeners.clear()
    this.exitListeners.clear()
  }

  onData(listener: DataListener): () => void {
    this.dataListeners.add(listener)

    return () => {
      this.dataListeners.delete(listener)
    }
  }

  onExit(listener: ExitListener): () => void {
    this.exitListeners.add(listener)

    return () => {
      this.exitListeners.delete(listener)
    }
  }

  private bindTerminalProcess(processHandle: IPty): void {
    processHandle.onData((chunk) => {
      this.dataListeners.forEach((listener) => {
        listener(chunk)
      })
    })

    processHandle.onExit(({ exitCode, signal }) => {
      if (this.ptyProcess === processHandle) {
        this.ptyProcess = null
        this.activeShell = ''
      }

      this.exitListeners.forEach((listener) => {
        listener({ exitCode, signal })
      })
    })
  }
}

export const terminalManager = new TerminalManager()
