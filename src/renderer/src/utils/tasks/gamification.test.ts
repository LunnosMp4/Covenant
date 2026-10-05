import { describe, expect, it } from 'vitest'
import { getTierLabel, hexToRgba } from './gamification'

describe('getTierLabel', () => {
  it('maps tier enums to human labels', () => {
    expect(getTierLabel('TRIVIAL')).toBe('Trivial')
    expect(getTierLabel('EASY')).toBe('Easy')
    expect(getTierLabel('MEDIUM')).toBe('Medium')
    expect(getTierLabel('HARD')).toBe('Hard')
    expect(getTierLabel('EPIC')).toBe('Epic')
  })

  it('returns empty string for undefined', () => {
    expect(getTierLabel(undefined)).toBe('')
  })
})

describe('hexToRgba', () => {
  it('converts full-length hex colors', () => {
    expect(hexToRgba('#ff8800', 0.5)).toBe('rgba(255,136,0,0.5)')
  })

  it('expands shorthand hex colors', () => {
    expect(hexToRgba('#f80', 0.25)).toBe('rgba(255,136,0,0.25)')
  })

  it('handles hex without a hash', () => {
    expect(hexToRgba('00ff00', 1)).toBe('rgba(0,255,0,1)')
  })

  it('falls back to white for invalid input', () => {
    expect(hexToRgba('#zzz', 0.5)).toBe('rgba(255,255,255,0.5)')
    expect(hexToRgba('#ff', 0.5)).toBe('rgba(255,255,255,0.5)')
  })
})