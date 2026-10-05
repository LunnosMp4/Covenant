import { describe, expect, it } from 'vitest'
import { sanitizeTerminalDimension, sanitizeTerminalInput } from './dimensions'

describe('sanitizeTerminalDimension', () => {
  const fallback = 120
  const min = 20
  const max = 400

  it('falls back for missing or invalid values', () => {
    expect(sanitizeTerminalDimension(undefined, fallback, min, max)).toBe(fallback)
    expect(sanitizeTerminalDimension('abc', fallback, min, max)).toBe(fallback)
    expect(sanitizeTerminalDimension(Number.NaN, fallback, min, max)).toBe(fallback)
    expect(sanitizeTerminalDimension(Number.POSITIVE_INFINITY, fallback, min, max)).toBe(fallback)
  })

  it('floors fractional values', () => {
    expect(sanitizeTerminalDimension(30.9, fallback, min, max)).toBe(30)
  })

  it('clamps to the configured bounds', () => {
    expect(sanitizeTerminalDimension(5, fallback, min, max)).toBe(min)
    expect(sanitizeTerminalDimension(9999, fallback, min, max)).toBe(max)
  })

  it('passes valid values through', () => {
    expect(sanitizeTerminalDimension(80, fallback, min, max)).toBe(80)
  })
})

describe('sanitizeTerminalInput', () => {
  it('returns empty string for non-string input', () => {
    expect(sanitizeTerminalInput(undefined)).toBe('')
    expect(sanitizeTerminalInput(123)).toBe('')
    expect(sanitizeTerminalInput(null)).toBe('')
  })

  it('returns empty string for empty input', () => {
    expect(sanitizeTerminalInput('')).toBe('')
  })

  it('passes short input through unchanged', () => {
    expect(sanitizeTerminalInput('git status')).toBe('git status')
  })

  it('truncates input longer than the chunk limit', () => {
    const long = 'a'.repeat(10000)
    const result = sanitizeTerminalInput(long)
    expect(result.length).toBe(8192)
    expect(result).toBe('a'.repeat(8192))
  })
})