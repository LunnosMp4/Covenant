import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeltaSender } from './deltaSender'

describe('createDeltaSender', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces content deltas into one message per flush window', () => {
    const forwarded: Array<{ id: string } & Record<string, unknown>> = []
    const sender = createDeltaSender({
      id: 'stream-1',
      flushMs: 50,
      forward: (payload) => forwarded.push(payload)
    })

    for (const delta of ['Hel', 'lo', ' ', 'world']) {
      sender.send({ id: 'stream-1', type: 'content', delta })
    }

    expect(forwarded).toHaveLength(0)
    vi.advanceTimersByTime(50)
    expect(forwarded).toEqual([{ id: 'stream-1', type: 'content', delta: 'Hello world' }])
  })

  it('keeps reasoning deltas separate per item id', () => {
    const forwarded: Array<{ id: string } & Record<string, unknown>> = []
    const sender = createDeltaSender({
      id: 's',
      flushMs: 50,
      forward: (payload) => forwarded.push(payload)
    })

    sender.send({ id: 's', type: 'reasoning-delta', itemId: 'a', delta: 'one ' })
    sender.send({ id: 's', type: 'reasoning-delta', itemId: 'b', delta: 'two ' })
    sender.send({ id: 's', type: 'reasoning-delta', itemId: 'a', delta: 'more' })
    vi.advanceTimersByTime(50)

    expect(forwarded).toEqual([
      { id: 's', type: 'reasoning-delta', itemId: 'a', delta: 'one more' },
      { id: 's', type: 'reasoning-delta', itemId: 'b', delta: 'two ' }
    ])
  })

  it('flushes pending deltas before a non-delta event, preserving order', () => {
    const forwarded: Array<{ id: string } & Record<string, unknown>> = []
    const sender = createDeltaSender({
      id: 's',
      flushMs: 50,
      forward: (payload) => forwarded.push(payload)
    })

    sender.send({ id: 's', type: 'content', delta: 'partial' })
    sender.send({ id: 's', type: 'done', stopped: false })

    expect(forwarded).toEqual([
      { id: 's', type: 'content', delta: 'partial' },
      { id: 's', type: 'done', stopped: false }
    ])
  })

  it('flush() delivers buffered text immediately', () => {
    const forwarded: Array<{ id: string } & Record<string, unknown>> = []
    const sender = createDeltaSender({
      id: 's',
      flushMs: 50,
      forward: (payload) => forwarded.push(payload)
    })

    sender.send({ id: 's', type: 'content', delta: 'tail' })
    sender.flush()

    expect(forwarded).toEqual([{ id: 's', type: 'content', delta: 'tail' }])
    vi.advanceTimersByTime(50)
    expect(forwarded).toHaveLength(1)
  })
})
