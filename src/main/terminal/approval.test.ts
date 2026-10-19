import { describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import {
  forgetSessionApprovals,
  isCommandAlwaysAllowed,
  requestTerminalApproval,
  resolveTerminalApproval
} from './approval'

function createSender(): { sender: WebContents; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn()
  const sender = { isDestroyed: () => false, send } as unknown as WebContents
  return { sender, send }
}

function requestIdFrom(send: ReturnType<typeof vi.fn>): string {
  const call = send.mock.calls[send.mock.calls.length - 1]
  return (call?.[1] as { requestId: string }).requestId
}

function request(
  sender: WebContents,
  overrides: Partial<{ sessionId: string; command: string; destructive: boolean; signal: AbortSignal }> = {}
) {
  const controller = new AbortController()
  return requestTerminalApproval({
    sender,
    signal: overrides.signal ?? controller.signal,
    sessionId: overrides.sessionId ?? 'session-1',
    command: overrides.command ?? 'ls -la',
    destructive: overrides.destructive ?? false,
    cwd: '/tmp'
  })
}

describe('terminal approval', () => {
  it('sends a request and resolves once when allowed', async () => {
    const { sender, send } = createSender()
    const pending = request(sender, { sessionId: 'allow-once' })

    expect(send).toHaveBeenCalledWith(
      'terminal:approval-request',
      expect.objectContaining({ command: 'ls -la', sessionId: 'allow-once', cwd: '/tmp' })
    )

    expect(resolveTerminalApproval(requestIdFrom(send), 'once')).toBe(true)
    await expect(pending).resolves.toBe('once')
  })

  it('resolves reject when denied', async () => {
    const { sender, send } = createSender()
    const pending = request(sender, { sessionId: 'deny' })
    resolveTerminalApproval(requestIdFrom(send), 'reject')
    await expect(pending).resolves.toBe('reject')
    expect(isCommandAlwaysAllowed('deny', 'ls -la')).toBe(false)
  })

  it('remembers "always allow" for non-destructive commands', async () => {
    const { sender, send } = createSender()
    const pending = request(sender, { sessionId: 'always', command: 'npm test' })
    resolveTerminalApproval(requestIdFrom(send), 'always')
    await expect(pending).resolves.toBe('once')
    expect(isCommandAlwaysAllowed('always', 'npm test')).toBe(true)
    forgetSessionApprovals('always')
  })

  it('never allowlists destructive commands', async () => {
    const { sender, send } = createSender()
    const pending = request(sender, {
      sessionId: 'destructive',
      command: 'rm -rf /tmp/x',
      destructive: true
    })
    resolveTerminalApproval(requestIdFrom(send), 'always')
    await expect(pending).resolves.toBe('once')
    expect(isCommandAlwaysAllowed('destructive', 'rm -rf /tmp/x')).toBe(false)
  })

  it('resolves reject when the stream aborts', async () => {
    const controller = new AbortController()
    const { sender } = createSender()
    const pending = request(sender, { sessionId: 'abort', signal: controller.signal })
    controller.abort()
    await expect(pending).resolves.toBe('reject')
  })

  it('rejects pending requests when the session is forgotten', async () => {
    const { sender } = createSender()
    const pending = request(sender, { sessionId: 'forget-me' })
    forgetSessionApprovals('forget-me')
    await expect(pending).resolves.toBe('reject')
  })

  it('ignores replies for unknown requests', () => {
    expect(resolveTerminalApproval('missing', 'once')).toBe(false)
  })
})
