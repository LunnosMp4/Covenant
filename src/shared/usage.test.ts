import { describe, expect, it } from 'vitest'
import {
  buildUsageMetrics,
  normalizeUsageRangeDays,
  resolveModelPricing,
  type OrganizationCostsBucket,
  type OrganizationUsageBucket
} from './usage'

const costBuckets: OrganizationCostsBucket[] = [
  {
    object: 'bucket',
    start_time: 1_700_000_000,
    end_time: 1_700_086_400,
    results: [
      { object: 'organization.costs.result', amount: { value: 1.5, currency: 'usd' }, line_item: 'GPT-6 Luna' },
      { object: 'organization.costs.result', amount: { value: 0.25, currency: 'usd' }, line_item: 'Web search' }
    ]
  },
  {
    object: 'bucket',
    start_time: 1_700_086_400,
    end_time: 1_700_172_800,
    results: [
      { object: 'organization.costs.result', amount: { value: 0.5, currency: 'usd' }, line_item: 'GPT-6 Luna' }
    ]
  }
]

const usageBuckets: OrganizationUsageBucket[] = [
  {
    object: 'bucket',
    start_time: 1_700_000_000,
    end_time: 1_700_086_400,
    results: [
      {
        object: 'organization.usage.completions.result',
        input_tokens: 1_000_000,
        input_cached_tokens: 500_000,
        output_tokens: 200_000,
        num_model_requests: 10,
        model: 'gpt-6-luna'
      },
      {
        object: 'organization.usage.completions.result',
        input_tokens: 1000,
        output_tokens: 500,
        num_model_requests: 2,
        model: 'gpt-unknown-2024-01-01'
      }
    ]
  }
]

describe('normalizeUsageRangeDays', () => {
  it('accepts only supported ranges and defaults otherwise', () => {
    expect(normalizeUsageRangeDays(7)).toBe(7)
    expect(normalizeUsageRangeDays('90')).toBe(90)
    expect(normalizeUsageRangeDays(13)).toBe(30)
    expect(normalizeUsageRangeDays(undefined)).toBe(30)
  })
})

describe('resolveModelPricing', () => {
  it('resolves dated snapshot ids to their family pricing', () => {
    expect(resolveModelPricing('gpt-6-luna')).toBeDefined()
    expect(resolveModelPricing('gpt-6-luna-2025-01-01')).toBeDefined()
    expect(resolveModelPricing('mystery-model')).toBeUndefined()
    expect(resolveModelPricing(null)).toBeUndefined()
  })
})

describe('buildUsageMetrics', () => {
  const metrics = buildUsageMetrics({
    rangeDays: 30,
    startTime: 1_700_000_000,
    endTime: 1_700_172_800,
    costBuckets,
    usageBuckets,
    now: 1_700_172_800_000
  })

  it('sums exact cost from the costs API', () => {
    expect(metrics.totalCost).toBeCloseTo(2.25)
    expect(metrics.currency).toBe('usd')
    expect(metrics.daily).toHaveLength(2)
  })

  it('groups exact cost by service line item', () => {
    expect(metrics.byService[0]).toMatchObject({ label: 'GPT-6 Luna', amount: 2 })
    expect(metrics.byService.find((item) => item.label === 'Web search')?.amount).toBeCloseTo(0.25)
  })

  it('aggregates model usage and estimates cost for known models', () => {
    const luna = metrics.byModel.find((model) => model.model === 'gpt-6-luna')
    expect(luna?.requests).toBe(10)
    expect(luna?.inputTokens).toBe(1_000_000)
    expect(luna?.cachedInputTokens).toBe(500_000)
    // 500k uncached input @ $0.10/M + 500k cached @ $0.01/M + 200k output @ $0.50/M
    expect(luna?.estimatedCost).toBeCloseTo(0.155)

    const unknown = metrics.byModel.find((model) => model.model.startsWith('gpt-unknown'))
    expect(unknown?.estimatedCost).toBeNull()
    expect(metrics.totalRequests).toBe(12)
  })
})
