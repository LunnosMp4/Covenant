import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME_GRADIENT,
  THEME_OPTIONS,
  buildCustomGradientClass,
  getThemeMode,
  getThemePalette,
  isCustomGradient,
  normalizeThemeGradient,
  parseGradientColors
} from './theme'

describe('isCustomGradient', () => {
  it('accepts valid custom gradients', () => {
    expect(isCustomGradient('from-[#1c0f03] to-[#0a0a0a]')).toBe(true)
    expect(isCustomGradient('from-[#f80] to-[#000]')).toBe(true)
  })

  it('rejects presets and garbage', () => {
    expect(isCustomGradient('from-neutral-900/95 to-[#1c0f03]')).toBe(false)
    expect(isCustomGradient('')).toBe(false)
    expect(isCustomGradient('foo')).toBe(false)
    expect(isCustomGradient(undefined)).toBe(false)
  })
})

describe('normalizeThemeGradient', () => {
  it('falls back for missing input', () => {
    expect(normalizeThemeGradient(undefined)).toBe(DEFAULT_THEME_GRADIENT)
  })

  it('keeps valid presets and custom gradients', () => {
    expect(normalizeThemeGradient('from-neutral-900/95 to-[#1c0f03]')).toBe(
      'from-neutral-900/95 to-[#1c0f03]'
    )
    expect(normalizeThemeGradient('from-[#ff8800] to-[#000000]')).toBe(
      'from-[#ff8800] to-[#000000]'
    )
  })

  it('falls back for unknown values', () => {
    expect(normalizeThemeGradient('not-a-gradient')).toBe(DEFAULT_THEME_GRADIENT)
  })
})

describe('parseGradientColors', () => {
  it('parses full-length colors', () => {
    expect(parseGradientColors('from-[#1c0f03] to-[#0a0a0a]')).toEqual({
      from: '#1c0f03',
      to: '#0a0a0a'
    })
  })

  it('expands shorthand colors', () => {
    expect(parseGradientColors('from-[#f80] to-[#000]')).toEqual({
      from: '#ff8800',
      to: '#000000'
    })
  })

  it('returns null for non-custom gradients', () => {
    expect(parseGradientColors('from-neutral-900/95 to-[#1c0f03]')).toBeNull()
    expect(parseGradientColors(undefined)).toBeNull()
  })
})

describe('buildCustomGradientClass', () => {
  it('builds a normalized gradient class', () => {
    expect(buildCustomGradientClass('#ff8800', '#000')).toBe('from-[#ff8800] to-[#000000]')
  })
})

describe('getThemePalette', () => {
  it('derives a coherent palette from a custom gradient', () => {
    const palette = getThemePalette('from-[#ff8800] to-[#000000]')
    expect(palette.accent).toBe('#ff8800')
    expect(palette.accentSoft).toBe('rgba(255,136,0,0.16)')
    expect(palette.accentStrong).toBe('rgba(255,136,0,0.38)')
    expect(palette.gamification.levelColor).toBe('#ff8800')
    expect(palette.assistantText).toBeTruthy()
  })

  it('falls back to a preset palette for presets', () => {
    const palette = getThemePalette('from-neutral-900/95 to-[#1c0f03]')
    expect(palette.accent).toBe('#f59e0b')
  })

  it('falls back to the first preset for unknown gradients', () => {
    const palette = getThemePalette(undefined)
    expect(palette.accent).toBe('#f59e0b')
  })
})

describe('getThemeMode', () => {
  it('classifies dark presets as dark', () => {
    expect(getThemeMode(DEFAULT_THEME_GRADIENT)).toBe('dark')
    expect(getThemeMode(undefined)).toBe('dark')
  })

  it('classifies the light presets as light', () => {
    const lightGradients = THEME_OPTIONS.filter((option) => option.mode === 'light')
    expect(lightGradients.length).toBeGreaterThanOrEqual(2)
    for (const option of lightGradients) {
      expect(getThemeMode(option.gradientClass)).toBe('light')
    }
  })

  it('treats custom gradients as dark', () => {
    expect(getThemeMode('from-[#ff8800] to-[#000000]')).toBe('dark')
  })
})