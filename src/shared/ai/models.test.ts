import { describe, expect, it } from 'vitest'
import type { AiModelOption } from './models'
import {
  formatReasoningEffort,
  normalizeReasoningEffort,
  reasoningEffortRank,
  resolveReasoningEffort
} from './models'
import { getReasoningEffortOptions } from '../config'

function model(overrides: Partial<AiModelOption> = {}): AiModelOption {
  return {
    provider: 'opencode',
    id: 'deepseek-v4.1-flash',
    label: 'DeepSeek V4.1 Flash',
    maxContextTokens: 1_000_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'high', 'max'],
    supportsTemperature: true,
    supportsVision: true,
    webSearch: 'tool',
    ...overrides
  }
}

describe('resolveReasoningEffort', () => {
  it('returns the exact requested value when the model supports it', () => {
    expect(resolveReasoningEffort('max', ['low', 'high', 'max'])).toBe('max')
  })

  it('matches case-insensitively and returns the catalog spelling', () => {
    expect(resolveReasoningEffort('HIGH', ['low', 'high', 'max'])).toBe('high')
  })

  it('snaps to the nearest supported effort', () => {
    expect(resolveReasoningEffort('medium', ['low', 'high', 'max'])).toBe('high')
    expect(resolveReasoningEffort('medium', ['none', 'low', 'max'])).toBe('low')
    expect(resolveReasoningEffort('xhigh', ['low', 'medium', 'high'])).toBe('high')
    expect(resolveReasoningEffort('minimal', ['none', 'high'])).toBe('none')
  })

  it('prefers the stronger effort on a tie', () => {
    expect(resolveReasoningEffort('medium', ['low', 'high'])).toBe('high')
  })

  it('returns undefined when the model has no effort levels', () => {
    expect(resolveReasoningEffort('low', [])).toBeUndefined()
    expect(resolveReasoningEffort('low', undefined)).toBeUndefined()
  })

  it('falls back to a supported value for unknown tokens', () => {
    expect(resolveReasoningEffort('turbo', ['minimal', 'max'])).toBe('max')
  })
})

describe('reasoningEffortRank', () => {
  it('orders the canonical levels', () => {
    expect(reasoningEffortRank('none')).toBeLessThan(reasoningEffortRank('low'))
    expect(reasoningEffortRank('low')).toBeLessThan(reasoningEffortRank('medium'))
    expect(reasoningEffortRank('high')).toBeLessThan(reasoningEffortRank('xhigh'))
    expect(reasoningEffortRank('xhigh')).toBeLessThan(reasoningEffortRank('max'))
  })

  it('places unknown tokens between medium and high', () => {
    expect(reasoningEffortRank('turbo')).toBeGreaterThan(reasoningEffortRank('medium'))
    expect(reasoningEffortRank('turbo')).toBeLessThan(reasoningEffortRank('high'))
  })
})

describe('formatReasoningEffort', () => {
  it('uses friendly labels for catalog tokens', () => {
    expect(formatReasoningEffort('xhigh')).toBe('Extra high')
    expect(formatReasoningEffort('LOW')).toBe('Low')
    expect(formatReasoningEffort('turbo')).toBe('Turbo')
  })
})

describe('normalizeReasoningEffort', () => {
  it('accepts catalog tokens and rejects junk', () => {
    expect(normalizeReasoningEffort('XHigh')).toBe('xhigh')
    expect(normalizeReasoningEffort(' none ')).toBe('none')
    expect(normalizeReasoningEffort('')).toBe('')
    expect(normalizeReasoningEffort(42)).toBe('')
    expect(normalizeReasoningEffort('not a token!')).toBe('')
  })
})

describe('getReasoningEffortOptions', () => {
  it('uses the live per-model effort list', () => {
    expect(getReasoningEffortOptions(model())).toEqual(['low', 'high', 'max'])
  })

  it('disables the picker for reasoning models without effort levels', () => {
    expect(getReasoningEffortOptions(model({ reasoningEfforts: [] }))).toEqual([])
  })

  it('falls back to the static levels when the model is unknown', () => {
    expect(getReasoningEffortOptions(undefined)).toEqual(['low', 'medium', 'high'])
  })
})
