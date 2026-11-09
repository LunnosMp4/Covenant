import { describe, expect, it } from 'vitest'
import { buildLocalUsageMetrics, type AiUsageEntry } from './usage'

function entry(overrides: Partial<AiUsageEntry> = {}): AiUsageEntry {
  return {
    id: 'entry',
    timestamp: Date.now(),
    provider: 'opencode',
    model: 'gpt-6-luna',
    kind: 'chat',
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    ...overrides
  }
}

describe('buildLocalUsageMetrics', () => {
  it('aggregates requests, tokens, cost and allowance', () => {
    const now = Date.now()
    const metrics = buildLocalUsageMetrics(
      [
        entry({ id: 'a', timestamp: now, cost: 0.01, allowance: 0.02 }),
        entry({
          id: 'b',
          timestamp: now,
          model: 'deepseek-v4.1-flash',
          promptTokens: 200,
          completionTokens: 100,
          cost: 0.03,
          allowance: 0.04
        })
      ],
      30,
      now
    )

    expect(metrics.totalRequests).toBe(2)
    expect(metrics.totalInputTokens).toBe(300)
    expect(metrics.totalOutputTokens).toBe(150)
    expect(metrics.totalCost).toBeCloseTo(0.04)
    expect(metrics.allowance).toBeCloseTo(0.06)
    expect(metrics.byModel).toHaveLength(2)
  })

  it('filters entries outside the requested range', () => {
    const now = Date.now()
    const old = now - 40 * 24 * 60 * 60 * 1000
    const metrics = buildLocalUsageMetrics(
      [entry({ id: 'old', timestamp: old }), entry({ id: 'new', timestamp: now })],
      7,
      now
    )

    expect(metrics.totalRequests).toBe(1)
  })

  it('groups web search usage separately from chat', () => {
    const now = Date.now()
    const metrics = buildLocalUsageMetrics(
      [entry({ id: 'chat', kind: 'chat' }), entry({ id: 'search', kind: 'web-search' })],
      30,
      now
    )

    expect(metrics.byService.map((service) => service.label)).toEqual(
      expect.arrayContaining(['Chat', 'Web search'])
    )
  })
})
