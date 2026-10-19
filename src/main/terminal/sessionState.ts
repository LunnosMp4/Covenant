import type { TerminalSessionState } from '../../shared/terminal/terminal'
import { extractAllOsc7Cwd, extractSentinel, stripAnsi, type SentinelMatch } from './ansi'

// Keep the AI-facing output bounded. The renderer's xterm owns the real
// scrollback; this is only what the assistant can read.
const MAX_OUTPUT_CHARS = 200_000
const MAX_READ_LINES = 400
// OSes occasionally split an escape sequence across PTY reads; keep a small raw
// tail so markers (OSC 7 / sentinel) survive chunk boundaries.
const MARKER_BUFFER_LIMIT = 4096

const SHELL_NAME_PATTERN = /[^/\\]+$/

export type SentinelListener = (match: SentinelMatch) => void
export type StateChangeListener = (state: TerminalSessionState) => void

function shellLabel(shellPath: string): string {
  const match = SHELL_NAME_PATTERN.exec(shellPath)
  return (match?.[0] ?? shellPath).replace(/\.exe$/i, '')
}

export class ShellStateTracker {
  private readonly sessionId: string
  private readonly shell: string
  private cwd: string
  private lastCommand: string | null = null
  private lastExitCode: number | null = null
  private running = false
  private output = ''
  private markerBuffer = ''
  private updatedAt = Date.now()

  private readonly sentinelListeners = new Set<SentinelListener>()
  private readonly stateListeners = new Set<StateChangeListener>()

  constructor(sessionId: string, shellPath: string, initialCwd: string) {
    this.sessionId = sessionId
    this.shell = shellPath
    this.cwd = initialCwd
  }

  feed(chunk: string): void {
    if (!chunk) return

    const previousCwd = this.cwd
    this.markerBuffer = (this.markerBuffer + chunk).slice(-MARKER_BUFFER_LIMIT)

    const sentinel = extractSentinel(this.markerBuffer)
    if (sentinel) {
      this.markerBuffer = this.markerBuffer.replace(sentinel.raw, '')
      this.applySentinel(sentinel)
    }

    const oscCwds = extractAllOsc7Cwd(this.markerBuffer)
    if (oscCwds.length > 0) {
      this.cwd = oscCwds[oscCwds.length - 1]
    }

    const clean = stripAnsi(chunk)
    if (clean) {
      this.output += clean
      if (this.output.length > MAX_OUTPUT_CHARS) {
        this.output = this.output.slice(-MAX_OUTPUT_CHARS)
      }
    }

    this.updatedAt = Date.now()

    if (this.cwd !== previousCwd) {
      this.emitState()
    }
  }

  private applySentinel(sentinel: SentinelMatch): void {
    this.cwd = sentinel.cwd || this.cwd
    this.lastExitCode = sentinel.exitCode
    this.running = false
    this.updatedAt = Date.now()

    this.sentinelListeners.forEach((listener) => {
      listener(sentinel)
    })
    this.emitState()
  }

  /** Called right before an agent-issued command is written to the PTY. */
  markCommandStart(command: string): void {
    this.lastCommand = command
    this.running = true
    this.updatedAt = Date.now()
    this.emitState()
  }

  /** Clears the running flag when completion could not be detected (timeout). */
  markCommandFinished(): void {
    if (!this.running) return
    this.running = false
    this.updatedAt = Date.now()
    this.emitState()
  }

  onSentinel(listener: SentinelListener): () => void {
    this.sentinelListeners.add(listener)
    return () => {
      this.sentinelListeners.delete(listener)
    }
  }

  onStateChange(listener: StateChangeListener): () => void {
    this.stateListeners.add(listener)
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  private emitState(): void {
    const state = this.getState()
    this.stateListeners.forEach((listener) => {
      listener(state)
    })
  }

  getState(): TerminalSessionState {
    return {
      sessionId: this.sessionId,
      shell: shellLabel(this.shell),
      cwd: this.cwd,
      lastCommand: this.lastCommand,
      lastExitCode: this.lastExitCode,
      running: this.running,
      updatedAt: this.updatedAt
    }
  }

  read(lineCount = 80): string {
    const bounded = Math.max(1, Math.min(lineCount, MAX_READ_LINES))
    const lines = this.output.split('\n')
    const slice = lines.slice(Math.max(0, lines.length - bounded))
    return slice.join('\n').trim()
  }

  /** Monotonic-ish marker of how much output has been produced so far. */
  getOutputLength(): number {
    return this.output.length
  }

  /** Returns output produced after `offset`, capped to `maxLines`. */
  readSince(offset: number, maxLines = 200): string {
    const start = Math.max(0, Math.min(offset, this.output.length))
    const slice = this.output.slice(start)
    const lines = slice.split('\n')
    const bounded = lines.slice(Math.max(0, lines.length - maxLines))
    return bounded.join('\n').trim()
  }
}
