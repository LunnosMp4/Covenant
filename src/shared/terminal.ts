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