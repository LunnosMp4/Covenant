import { describe, expect, it } from 'vitest'
import {
  buildOpenCodeSpend,
  mergeGoUsage,
  parseCostByDayResponse,
  parseGoStatusResponse,
  parseGoUsageResponse,
  parseModelsResponse,
  parseUsageSummary
} from './opencodeUsage'

describe('parseGoUsageResponse', () => {
  it('maps rolling/weekly/monthly percentages and resets', () => {
    const go = parseGoUsageResponse({
      usage: {
        rolling: { status: 'ok', percent: 12.5, resetsAt: '2026-11-10T12:00:00Z' },
        weekly: { status: 'ok', percent: 40, resetsAt: '2026-11-14T00:00:00Z' },
        monthly: { status: 'ok', percent: 75, resetsAt: '2026-12-01T00:00:00Z' }
      }
    })
    expect(go?.meters.fiveHour?.percent).toBe(12.5)
    expect(go?.meters.week?.percent).toBe(40)
    expect(go?.meters.month?.percent).toBe(75)
    expect(go?.meters.month?.resetsAt).toBe(Date.parse('2026-12-01T00:00:00Z'))
  })
})

describe('parseGoStatusResponse', () => {
  it('converts used/limit micro-cents and merges with inference meters', () => {
    const status = parseGoStatusResponse({
      product: 'go',
      access: {
        endsAt: '2026-12-01T00:00:00Z',
        meters: {
          fiveHour: { usedMicroCents: '500000000', limitMicroCents: '2000000000', resetsAt: '2026-11-10T12:00:00Z' },
          month: { usedMicroCents: '3000000000', limitMicroCents: '6000000000' }
        }
      }
    })
    expect(status?.product).toBe('Go')
    expect(status?.meters.fiveHour?.percent).toBe(25)
    expect(status?.meters.fiveHour?.usedUsd).toBe(5)
    expect(status?.meters.fiveHour?.limitUsd).toBe(20)
    expect(status?.meters.month?.resetsAt).toBe(Date.parse('2026-12-01T00:00:00Z'))

    const merged = mergeGoUsage(
      status,
      parseGoUsageResponse({
        usage: { rolling: { percent: 26, resetsAt: '2026-11-10T13:00:00Z' } }
      })
    )
    expect(merged?.meters.fiveHour?.percent).toBe(26)
    expect(merged?.meters.fiveHour?.usedUsd).toBe(5)
    expect(merged?.meters.fiveHour?.resetsAt).toBe(Date.parse('2026-11-10T13:00:00Z'))
  })
})

describe('console usage parsers', () => {
  it('parses summary, daily and model shapes defensively', () => {
    const summary = parseUsageSummary({
      totalCostMicroCents: '1517249626',
      totalRequests: '7591',
      totalInputTokens: '28079397',
      totalOutputTokens: '6432151',
      totalCacheReadTokens: '1390845838',
      services: []
    })
    expect(summary?.totalCost).toBeCloseTo(15.17249626)
    expect(summary?.totalRequests).toBe(7591)
    expect(summary?.totalCachedInputTokens).toBe(1390845838)

    const daily = parseCostByDayResponse([
      { date: '2026-11-08', totalCostMicroCents: '50000000', totalRequests: '12' },
      { date: '2026-11-09', totalCostMicroCents: '25000000', totalRequests: '3' }
    ])
    expect(daily).toHaveLength(2)
    expect(daily[0].amount).toBeCloseTo(0.5)
    expect(daily[1].amount).toBeCloseTo(0.25)

    const models = parseModelsResponse({
      items: [
        {
          model: 'deepseek-v4.1-flash',
          provider: 'opencode-go',
          totalRequests: '10',
          totalInputTokens: '2000',
          totalCacheReadTokens: '500',
          totalOutputTokens: '300',
          totalCostMicroCents: '40000000'
        }
      ]
    })
    expect(models[0]).toMatchObject({
      model: 'deepseek-v4.1-flash',
      requests: 10,
      inputTokens: 2000,
      cachedInputTokens: 500,
      outputTokens: 300
    })
    expect(models[0].estimatedCost).toBeCloseTo(0.4)
  })

})

describe('buildOpenCodeSpend', () => {
  it('prefers summary totals and keeps daily/model detail', () => {
    const metrics = buildOpenCodeSpend({
      rangeDays: 30,
      startTime: 1,
      endTime: 2,
      now: 3,
      summary: { totalCost: 12.5, totalRequests: 20, totalInputTokens: 100, totalOutputTokens: 50 },
      daily: [{ startTime: 10, endTime: 20, amount: 5 }],
      models: [
        {
          model: 'glm-5.3',
          requests: 4,
          inputTokens: 1000,
          cachedInputTokens: 0,
          outputTokens: 200,
          estimatedCost: 1
        }
      ]
    })
    expect(metrics.totalCost).toBe(12.5)
    expect(metrics.totalRequests).toBe(20)
    expect(metrics.totalInputTokens).toBe(100)
    expect(metrics.byModel).toHaveLength(1)
  })

  it('falls back to daily totals when the summary is missing', () => {
    const metrics = buildOpenCodeSpend({
      rangeDays: 7,
      startTime: 1,
      endTime: 2,
      daily: [{ startTime: 10, endTime: 20, amount: 3.5 }]
    })
    expect(metrics.totalCost).toBe(3.5)
    expect(metrics.daily).toHaveLength(7)
    expect(metrics.daily.reduce((total, point) => total + point.amount, 0)).toBe(3.5)
  })
})
