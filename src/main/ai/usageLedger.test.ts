import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
  let entries: unknown[] = []
  return {
    getUsageEntries: vi.fn(() => entries as never[]),
    setUsageEntries: vi.fn((value: unknown[]) => {
      entries = value
    }),
    reset: () => {
      entries = []
    }
  }
})

vi.mock('../store/usageStore', () => ({
  getUsageEntries: store.getUsageEntries,
  setUsageEntries: store.setUsageEntries
}))

const { recordAiUsage, flushAiUsage, getAiUsageEntries } = await import('./usageLedger')

const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 }

describe('usageLedger write coalescing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    store.setUsageEntries.mockClear()
    store.reset()
  })

  afterEach(() => {
    flushAiUsage()
    vi.useRealTimers()
  })

  it('does not touch electron-store on every recorded entry', () => {
    for (let index = 0; index < 25; index++) {
      recordAiUsage({ provider: 'openai', model: 'test', kind: 'chat', usage })
    }

    // Reads see the entries immediately, but the disk write is deferred.
    expect(getAiUsageEntries()).toHaveLength(25)
    expect(store.setUsageEntries).not.toHaveBeenCalled()

    vi.advanceTimersByTime(2000)
    expect(store.setUsageEntries).toHaveBeenCalledTimes(1)
    expect((store.setUsageEntries.mock.calls[0][0] as unknown[]).length).toBe(25)
  })

  it('flushAiUsage persists pending entries (quit path)', () => {
    recordAiUsage({ provider: 'openai', model: 'test', kind: 'chat', usage })
    expect(store.setUsageEntries).not.toHaveBeenCalled()

    flushAiUsage()
    expect(store.setUsageEntries).toHaveBeenCalledTimes(1)
  })
})
