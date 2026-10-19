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

/** Structured snapshot of a live shell session, derived from the PTY stream. */
export interface TerminalSessionState {
  sessionId: string
  shell: string
  cwd: string
  lastCommand: string | null
  lastExitCode: number | null
  running: boolean
  updatedAt: number
}

export interface TerminalStateEvent {
  sessionId: string
  state: TerminalSessionState
}

export interface TerminalCommandResult {
  success: boolean
  exitCode: number | null
  cwd: string
  output: string
  error?: string
}

export type TerminalApprovalReply = 'once' | 'always' | 'reject'

export interface TerminalApprovalRequest {
  requestId: string
  sessionId: string
  command: string
  reason?: string
  destructive: boolean
  cwd: string
}
