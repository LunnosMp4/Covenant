import { describe, expect, it, vi } from 'vitest'

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    }
  }
}))

import { evaluateTask, evaluateTaskHeuristically } from './taskEvaluator'

describe('evaluateTaskHeuristically', () => {
  it('classifies quick bug-fix tasks as EASY / Dev / quick_action', () => {
    const result = evaluateTaskHeuristically('Fix login bug')
    expect(result.tier).toBe('EASY')
    expect(result.categoryTag).toBe('Dev')
    expect(result.actionType).toBe('quick_action')
    expect(result.xpReward).toBeGreaterThanOrEqual(35)
    expect(result.xpReward).toBeLessThanOrEqual(70)
  })

  it('classifies refactors as HARD / Dev / code_refactor', () => {
    const result = evaluateTaskHeuristically('Refactor authentication module')
    expect(result.tier).toBe('HARD')
    expect(result.categoryTag).toBe('Dev')
    expect(result.actionType).toBe('code_refactor')
  })

  it('detects DevOps categories and terminal action types', () => {
    const result = evaluateTaskHeuristically('Deploy Kubernetes cluster to production')
    expect(result.tier).toBe('HARD')
    expect(result.categoryTag).toBe('DevOps')
    expect(result.actionType).toBe('terminal_command')
  })

  it('detects health categories and trivial tiers', () => {
    const result = evaluateTaskHeuristically('Drink more water')
    expect(result.tier).toBe('TRIVIAL')
    expect(result.categoryTag).toBe('Health')
  })

  it('promotes long or epic tasks', () => {
    const result = evaluateTaskHeuristically(
      'Build a complete end-to-end platform architecture from scratch with migration'
    )
    expect(result.tier).toBe('EPIC')

    const longTask = evaluateTaskHeuristically('a b c d e f g h')
    expect(longTask.tier).toBe('EPIC')
  })

  it('produces an estimated duration within bounds', () => {
    const result = evaluateTaskHeuristically('Rewrite database migration')
    expect(result.estimatedMinutes).toBeGreaterThanOrEqual(1)
    expect(result.estimatedMinutes).toBeLessThanOrEqual(480)
  })
})

describe('evaluateTask', () => {
  it('falls back to the heuristic when no API key is available', async () => {
    const result = await evaluateTask('Fix login bug', '')
    expect(result.tier).toBe('EASY')
  })

  it('falls back to the heuristic when the model call fails', async () => {
    const result = await evaluateTask('Fix login bug', 'sk-test')
    expect(result.tier).toBe('EASY')
    expect(result.xpReward).toBeGreaterThan(0)
  })
})