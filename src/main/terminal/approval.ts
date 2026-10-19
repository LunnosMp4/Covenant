import { randomUUID } from 'crypto'
import type { WebContents } from 'electron'
import type { TerminalApprovalReply, TerminalApprovalRequest } from '../../shared/terminal/terminal'

const APPROVAL_TIMEOUT_MS = 120_000

interface PendingApproval {
  sessionId: string
  command: string
  destructive: boolean
  resolve: (reply: TerminalApprovalReply) => void
}

const pending = new Map<string, PendingApproval>()
// Exact-command allowlist, scoped to a terminal session and cleared on exit.
const alwaysAllowedBySession = new Map<string, Set<string>>()

export function isCommandAlwaysAllowed(sessionId: string, command: string): boolean {
  return alwaysAllowedBySession.get(sessionId)?.has(command.trim()) ?? false
}

export function forgetSessionApprovals(sessionId: string): void {
  alwaysAllowedBySession.delete(sessionId)
  for (const [requestId, entry] of pending.entries()) {
    if (entry.sessionId === sessionId) {
      pending.delete(requestId)
      entry.resolve('reject')
    }
  }
}

export function resolveTerminalApproval(
  requestId: string,
  reply: TerminalApprovalReply
): boolean {
  const entry = pending.get(requestId)
  if (!entry) return false

  pending.delete(requestId)

  if (reply === 'always') {
    if (!entry.destructive) {
      const allowed = alwaysAllowedBySession.get(entry.sessionId) ?? new Set<string>()
      allowed.add(entry.command.trim())
      alwaysAllowedBySession.set(entry.sessionId, allowed)
    }
    entry.resolve('once')
    return true
  }

  entry.resolve(reply)
  return true
}

/**
 * Asks the renderer to approve a command. Resolves `reject` on timeout, abort,
 * or a destroyed sender so the tool loop can never hang.
 */
export function requestTerminalApproval(params: {
  sender: WebContents
  signal: AbortSignal
  sessionId: string
  command: string
  reason?: string
  destructive: boolean
  cwd: string
  timeoutMs?: number
}): Promise<TerminalApprovalReply> {
  if (params.sender.isDestroyed() || params.signal.aborted) {
    return Promise.resolve('reject')
  }

  const requestId = randomUUID()
  const timeoutMs = params.timeoutMs ?? APPROVAL_TIMEOUT_MS

  return new Promise<TerminalApprovalReply>((resolve) => {
    let settled = false

    const finish = (reply: TerminalApprovalReply): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      params.signal.removeEventListener('abort', onAbort)
      pending.delete(requestId)
      resolve(reply)
    }

    const onAbort = (): void => finish('reject')
    const timer = setTimeout(() => finish('reject'), timeoutMs)
    params.signal.addEventListener('abort', onAbort, { once: true })

    pending.set(requestId, {
      sessionId: params.sessionId,
      command: params.command,
      destructive: params.destructive,
      resolve: finish
    })

    const request: TerminalApprovalRequest = {
      requestId,
      sessionId: params.sessionId,
      command: params.command,
      reason: params.reason,
      destructive: params.destructive,
      cwd: params.cwd
    }

    params.sender.send('terminal:approval-request', request)
  })
}
