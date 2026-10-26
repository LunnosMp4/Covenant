import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME_GRADIENT,
  THEME_OPTIONS,
  buildCustomGradientClass,
  buildNeutralScale,
  getContrastRatio,
  getThemeMode,
  getThemeNeutralTint,
  getThemePalette,
  isCustomGradient,
  normalizeThemeGradient,
  parseGradientColors
} from './theme'

function parseHex(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function blendOver(foreground: string, background: string): string {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/.exec(
    foreground
  )
  if (!match) return foreground
  const alpha = match[4] === undefined ? 1 : Number(match[4])
  const fg = [Number(match[1]), Number(match[2]), Number(match[3])]
  const bg = parseHex(background)
  const blended = fg.map((channel, index) =>
    Math.round(channel * alpha + bg[index] * (1 - alpha))
  )
  return `#${blended.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

describe('isCustomGradient', () => {
  it('accepts valid custom gradients', () => {
    expect(isCustomGradient('from-[#1c0f03] to-[#0a0a0a]')).toBe(true)
    expect(isCustomGradient('from-[#f80] to-[#000]')).toBe(true)
  })

  it('rejects presets and garbage', () => {
    expect(isCustomGradient('from-[#1B1C1F] to-[#161719]')).toBe(false)
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
    expect(normalizeThemeGradient(DEFAULT_THEME_GRADIENT)).toBe(DEFAULT_THEME_GRADIENT)
    expect(normalizeThemeGradient('from-[#ff8800] to-[#000000]')).toBe(
      'from-[#ff8800] to-[#000000]'
    )
  })

  it('migrates legacy presets', () => {
    expect(normalizeThemeGradient('from-neutral-900/95 to-[#1c0f03]')).toBe(
      'from-[#1B1C1F] to-[#161719]'
    )
    expect(normalizeThemeGradient('from-neutral-900 to-[#18332e]')).toBe(
      'from-[#1B211C] to-[#161A17]'
    )
    expect(normalizeThemeGradient('from-[#fdfdfd] to-[#badaff]')).toBe(
      'from-[#FBFCFD] to-[#EFF3F8]'
    )
    expect(normalizeThemeGradient('from-[#fcf7e8] to-[#cfb28f]')).toBe(
      'from-[#FCF9F3] to-[#F4EDE2]'
    )
  })

  it('migrates the first translucent palette values', () => {
    expect(
      normalizeThemeGradient('from-[rgb(27_28_31_/_0.96)] to-[rgb(22_23_25_/_0.94)]')
    ).toBe('from-[#1B1C1F] to-[#161719]')
    expect(
      normalizeThemeGradient('from-[rgb(254_254_253_/_0.96)] to-[rgb(246_246_243_/_0.94)]')
    ).toBe('from-[#FEFEFD] to-[#F6F6F3]')
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
    expect(parseGradientColors(DEFAULT_THEME_GRADIENT)).toBeNull()
    expect(parseGradientColors(undefined)).toBeNull()
  })
})

describe('buildCustomGradientClass', () => {
  it('builds a normalized gradient class', () => {
    expect(buildCustomGradientClass('#ff8800', '#000')).toBe('from-[#ff8800] to-[#000000]')
  })
})

describe('theme catalog', () => {
  it('ships four dark and four light presets', () => {
    expect(THEME_OPTIONS.filter((option) => option.mode === 'dark')).toHaveLength(4)
    expect(THEME_OPTIONS.filter((option) => option.mode === 'light')).toHaveLength(4)
  })

  it('has unique ids and gradient classes', () => {
    expect(new Set(THEME_OPTIONS.map((option) => option.id)).size).toBe(THEME_OPTIONS.length)
    expect(new Set(THEME_OPTIONS.map((option) => option.gradientClass)).size).toBe(
      THEME_OPTIONS.length
    )
  })

  it('meets contrast targets in every palette', () => {
    for (const option of THEME_OPTIONS) {
      const surface = option.preview.from
      const palette = option.palette
      expect(getContrastRatio(palette.assistantText, surface)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(palette.metaText, surface)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(palette.accent, surface)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(palette.onAccent, palette.accent)).toBeGreaterThanOrEqual(4.5)
      expect(
        getContrastRatio(palette.userText, blendOver(palette.userBg, surface))
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        getContrastRatio(palette.assistantText, blendOver(palette.assistantBg, surface))
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('builds a complete neutral scale for both modes', () => {
    for (const option of THEME_OPTIONS) {
      const scale = buildNeutralScale(option.mode, getThemeNeutralTint(option.gradientClass))
      expect(Object.keys(scale)).toHaveLength(11)
      for (const value of Object.values(scale)) {
        expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
      }
    }
  })
})

describe('getThemePalette', () => {
  it('derives a coherent palette from a custom gradient', () => {
    const palette = getThemePalette('from-[#ff8800] to-[#000000]')
    expect(palette.accent).toBe('#ff8800')
    expect(palette.accentSoft).toBe('rgba(255,136,0,0.16)')
    expect(palette.accentStrong).toBe('rgba(255,136,0,0.36)')
    expect(palette.gamification.levelColor).toBe('#ff8800')
    expect(palette.assistantText).toBeTruthy()
  })

  it('uses the preset palette for presets and legacy presets', () => {
    expect(getThemePalette(DEFAULT_THEME_GRADIENT).accent).toBe('#E6E6E3')
    expect(getThemePalette('from-neutral-900/95 to-[#1c0f03]').accent).toBe('#E6E6E3')
  })

  it('falls back to the first preset for unknown gradients', () => {
    expect(getThemePalette(undefined).accent).toBe('#E6E6E3')
  })
})

describe('getThemeMode', () => {
  it('classifies dark presets as dark', () => {
    expect(getThemeMode(DEFAULT_THEME_GRADIENT)).toBe('dark')
    expect(getThemeMode(undefined)).toBe('dark')
  })

  it('classifies the light presets as light', () => {
    const lightGradients = THEME_OPTIONS.filter((option) => option.mode === 'light')
    expect(lightGradients).toHaveLength(4)
    for (const option of lightGradients) {
      expect(getThemeMode(option.gradientClass)).toBe('light')
    }
  })

  it('detects custom gradient brightness', () => {
    expect(getThemeMode('from-[#ff8800] to-[#000000]')).toBe('dark')
    expect(getThemeMode('from-[#fdfdfd] to-[#ffffff]')).toBe('light')
  })
})
