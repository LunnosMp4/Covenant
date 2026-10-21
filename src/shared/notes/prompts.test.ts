import { describe, expect, it } from 'vitest'
import { truncateMiddle } from './prompts'

describe('note AI prompt helpers', () => {
  it('leaves short text untouched', () => {
    expect(truncateMiddle('short note', 100)).toBe('short note')
  })

  it('keeps the head and tail of long text within the budget', () => {
    const text = `${'a'.repeat(4000)}MIDDLE${'b'.repeat(4000)}`
    const result = truncateMiddle(text, 1000)

    expect(result.length).toBeLessThanOrEqual(1000)
    expect(result).toContain('[truncated]')
    expect(result.startsWith('aaaa')).toBe(true)
    expect(result.endsWith('bbbb')).toBe(true)
  })

  it('falls back to a plain slice for tiny budgets', () => {
    expect(truncateMiddle('abcdef', 3)).toBe('abc')
  })
})
