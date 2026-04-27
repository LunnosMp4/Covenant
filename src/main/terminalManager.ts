import { spawn, type IPty } from 'node-pty'

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

function getShellCandidates(): ShellCandidate[] {
  if (process.platform === 'win32') {
    return [
      { command: 'pwsh.exe', args: ['-NoLogo'] },
      { command: 'powershell.exe', args: ['-NoLogo'] },
      { command: 'cmd.exe', args: [] }
    ]
  }

  const envShell = process.env.SHELL?.trim()

  return [
    ...(envShell ? [{ command: envShell, args: [] }] : []),
    { command: '/bin/bash', args: [] },
    { command: '/bin/sh', args: [] }
  ]
}

class TerminalManager {
  private ptyProcess: IPty | null = null

  private activeShell = ''

  private readonly dataListeners = new Set<DataListener>()

  private readonly exitListeners = new Set<ExitListener>()

  start(cols?: number, rows?: number): TerminalStartResult {
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

    const env = { ...process.env }
    const shellCandidates = getShellCandidates()
    let lastError: unknown

    for (const candidate of shellCandidates) {
      try {
        const processHandle = spawn(candidate.command, candidate.args, {
          name: 'xterm-256color',
          cols: normalizedCols,
          rows: normalizedRows,
          cwd: process.cwd(),
          env
        })

        this.activeShell = candidate.command
        this.ptyProcess = processHandle
        this.bindTerminalProcess(processHandle)

        return {
          pid: processHandle.pid,
          shell: this.activeShell,
          created: true
        }
      } catch (error) {
        lastError = error
      }
    }

    throw new Error(
      `Unable to start terminal shell. Last error: ${
        lastError instanceof Error ? lastError.message : 'unknown'
      }`
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
