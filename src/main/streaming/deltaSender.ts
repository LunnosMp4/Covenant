/**
 * Coalesces per-token streaming deltas into one IPC message per flush window.
 *
 * Both the chat stream and the note-assistant stream forward text one token at
 * a time. Sending each token individually makes the renderer commit once per
 * token (and structured-clones a payload each time); buffering for a short
 * window keeps the stream visibly live while cutting IPC volume by an order of
 * magnitude. Non-delta events flush the buffer first, so the renderer observes
 * exactly the same ordering as the unbatched stream.
 */
export interface DeltaSender {
  send: (payload: { id: string } & Record<string, unknown>) => void
  flush: () => void
}

export interface DeltaSenderOptions {
  /** Stream id every forwarded event carries. */
  id: string
  flushMs: number
  /** Forwards one (coalesced) event to the renderer. */
  forward: (payload: { id: string } & Record<string, unknown>) => void
}

export function createDeltaSender({ id, flushMs, forward }: DeltaSenderOptions): DeltaSender {
  let pendingContent = ''
  const pendingReasoning = new Map<string, string>()
  let flushTimer: NodeJS.Timeout | null = null

  const flush = (): void => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }

    if (pendingContent) {
      const delta = pendingContent
      pendingContent = ''
      forward({ id, type: 'content', delta })
    }

    if (pendingReasoning.size > 0) {
      const pending = [...pendingReasoning.entries()]
      pendingReasoning.clear()
      for (const [itemId, delta] of pending) {
        forward({ id, type: 'reasoning-delta', itemId, delta })
      }
    }
  }

  const scheduleFlush = (): void => {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, flushMs)
    flushTimer.unref?.()
  }

  const send = (payload: { id: string } & Record<string, unknown>): void => {
    if (payload.type === 'content' && typeof payload.delta === 'string') {
      pendingContent += payload.delta
      scheduleFlush()
      return
    }

    if (
      payload.type === 'reasoning-delta' &&
      typeof payload.delta === 'string' &&
      typeof payload.itemId === 'string'
    ) {
      const itemId = payload.itemId
      pendingReasoning.set(itemId, (pendingReasoning.get(itemId) ?? '') + payload.delta)
      scheduleFlush()
      return
    }

    flush()
    forward(payload)
  }

  return { send, flush }
}
