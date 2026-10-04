export type ThemeMode = 'dark' | 'light'

export interface ThemeOption {
  id: string
  label: string
  description: string
  mode: ThemeMode
  gradientClass: string
  preview: { from: string; to: string }
  palette: ThemePalette
}

import type { TaskTier } from '../../../shared/gamification'

export interface ThemePalette {
  accent: string
  accentSoft: string
  accentStrong: string
  onAccent: string
  userText: string
  assistantText: string
  assistantBg: string
  assistantBorder: string
  scrollbarThumb: string
  scrollbarThumbHover: string
  metaText: string
  gamification: GamificationColors
}

export interface GamificationColors {
  tierColors: Record<TaskTier, string>
  levelColor: string
  streakColor: string
}

export const DEFAULT_THEME_GRADIENT = 'from-neutral-900/95 to-[#1c0f03]'

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'dark-default',
    label: 'Dark Neutral',
    description: 'Balanced dark gradient',
    mode: 'dark',
    gradientClass: 'from-neutral-900/95 to-[#1c0f03]',
    preview: { from: '#171717', to: '#1c0f03' },
    palette: {
      accent: '#f59e0b',
      accentSoft: 'rgba(245, 158, 11, 0.16)',
      accentStrong: 'rgba(245, 158, 11, 0.38)',
      onAccent: '#111111',
      userText: '#fff7ed',
      assistantText: '#f5f5f4',
      assistantBg: 'rgba(10, 10, 10, 0.72)',
      assistantBorder: 'rgba(255, 255, 255, 0.1)',
      scrollbarThumb: 'rgba(245, 158, 11, 0.35)',
      scrollbarThumbHover: 'rgba(245, 158, 11, 0.55)',
      metaText: 'rgba(255, 255, 255, 0.45)',
      gamification: {
        tierColors: {
          TRIVIAL: '#a8a29e',
          EASY: '#7dd3fc',
          MEDIUM: '#fbbf24',
          HARD: '#fb923c',
          EPIC: '#fb7185'
        },
        levelColor: '#f59e0b',
        streakColor: '#f59e0b'
      }
    }
  },
  {
    id: 'blue-depth',
    label: 'Blue Depth',
    description: 'Cool steel tone',
    mode: 'dark',
    gradientClass: 'from-slate-900 to-[#071726]',
    preview: { from: '#0f172a', to: '#071726' },
    palette: {
      accent: '#60a5fa',
      accentSoft: 'rgba(96, 165, 250, 0.16)',
      accentStrong: 'rgba(96, 165, 250, 0.38)',
      onAccent: '#071726',
      userText: '#e0f2fe',
      assistantText: '#f8fafc',
      assistantBg: 'rgba(6, 10, 18, 0.74)',
      assistantBorder: 'rgba(148, 163, 184, 0.2)',
      scrollbarThumb: 'rgba(96, 165, 250, 0.35)',
      scrollbarThumbHover: 'rgba(96, 165, 250, 0.55)',
      metaText: 'rgba(226, 232, 240, 0.55)',
      gamification: {
        tierColors: {
          TRIVIAL: '#94a3b8',
          EASY: '#38bdf8',
          MEDIUM: '#60a5fa',
          HARD: '#818cf8',
          EPIC: '#a78bfa'
        },
        levelColor: '#60a5fa',
        streakColor: '#38bdf8'
      }
    }
  },
  {
    id: 'violet-focus',
    label: 'Violet Focus',
    description: 'Focused creative mood',
    mode: 'dark',
    gradientClass: 'from-zinc-900 to-[#1a1026]',
    preview: { from: '#18181b', to: '#1a1026' },
    palette: {
      accent: '#a78bfa',
      accentSoft: 'rgba(167, 139, 250, 0.16)',
      accentStrong: 'rgba(167, 139, 250, 0.38)',
      onAccent: '#1a1026',
      userText: '#ede9fe',
      assistantText: '#f5f3ff',
      assistantBg: 'rgba(18, 12, 26, 0.74)',
      assistantBorder: 'rgba(196, 181, 253, 0.2)',
      scrollbarThumb: 'rgba(167, 139, 250, 0.35)',
      scrollbarThumbHover: 'rgba(167, 139, 250, 0.55)',
      metaText: 'rgba(221, 214, 254, 0.55)',
      gamification: {
        tierColors: {
          TRIVIAL: '#a1a1aa',
          EASY: '#a5b4fc',
          MEDIUM: '#a78bfa',
          HARD: '#c084fc',
          EPIC: '#f0abfc'
        },
        levelColor: '#a78bfa',
        streakColor: '#c084fc'
      }
    }
  },
  {
    id: 'emerald-night',
    label: 'Emerald Night',
    description: 'Dark green accent',
    mode: 'dark',
    gradientClass: 'from-neutral-900 to-[#0a1f17]',
    preview: { from: '#171717', to: '#0a1f17' },
    palette: {
      accent: '#34d399',
      accentSoft: 'rgba(52, 211, 153, 0.16)',
      accentStrong: 'rgba(52, 211, 153, 0.38)',
      onAccent: '#0a1f17',
      userText: '#d1fae5',
      assistantText: '#ecfdf5',
      assistantBg: 'rgba(7, 19, 15, 0.76)',
      assistantBorder: 'rgba(110, 231, 183, 0.2)',
      scrollbarThumb: 'rgba(52, 211, 153, 0.35)',
      scrollbarThumbHover: 'rgba(52, 211, 153, 0.55)',
      metaText: 'rgba(209, 250, 229, 0.55)',
      gamification: {
        tierColors: {
          TRIVIAL: '#94a3b8',
          EASY: '#6ee7b7',
          MEDIUM: '#34d399',
          HARD: '#fbbf24',
          EPIC: '#f87171'
        },
        levelColor: '#34d399',
        streakColor: '#34d399'
      }
    }
  },
  {
    id: 'paper',
    label: 'Paper',
    description: 'Clean neutral light',
    mode: 'light',
    gradientClass: 'from-[#fdfdfd] to-[#e8e8e8]',
    preview: { from: '#fdfdfd', to: '#e8e8e8' },
    palette: {
      accent: '#18181b',
      accentSoft: 'rgba(24, 24, 27, 0.08)',
      accentStrong: 'rgba(24, 24, 27, 0.22)',
      onAccent: '#ffffff',
      userText: '#18181b',
      assistantText: '#1f2937',
      assistantBg: 'rgba(255, 255, 255, 0.8)',
      assistantBorder: 'rgba(15, 23, 42, 0.1)',
      scrollbarThumb: 'rgba(24, 24, 27, 0.22)',
      scrollbarThumbHover: 'rgba(24, 24, 27, 0.38)',
      metaText: 'rgba(15, 23, 42, 0.5)',
      gamification: {
        tierColors: {
          TRIVIAL: '#64748b',
          EASY: '#0ea5e9',
          MEDIUM: '#f59e0b',
          HARD: '#f97316',
          EPIC: '#e11d48'
        },
        levelColor: '#18181b',
        streakColor: '#525252'
      }
    }
  },
  {
    id: 'warm-sand',
    label: 'Warm Sand',
    description: 'Creamy warm light',
    mode: 'light',
    gradientClass: 'from-[#fdf8f1] to-[#f0e2cd]',
    preview: { from: '#fdf8f1', to: '#f0e2cd' },
    palette: {
      accent: '#d97706',
      accentSoft: 'rgba(217, 119, 6, 0.12)',
      accentStrong: 'rgba(217, 119, 6, 0.3)',
      onAccent: '#ffffff',
      userText: '#78350f',
      assistantText: '#3f2d1a',
      assistantBg: 'rgba(255, 252, 247, 0.82)',
      assistantBorder: 'rgba(120, 53, 15, 0.12)',
      scrollbarThumb: 'rgba(217, 119, 6, 0.3)',
      scrollbarThumbHover: 'rgba(217, 119, 6, 0.48)',
      metaText: 'rgba(120, 53, 15, 0.55)',
      gamification: {
        tierColors: {
          TRIVIAL: '#a8a29e',
          EASY: '#fbbf24',
          MEDIUM: '#f59e0b',
          HARD: '#fb923c',
          EPIC: '#dc2626'
        },
        levelColor: '#d97706',
        streakColor: '#b45309'
      }
    }
  }
]

const THEME_GRADIENT_SET = new Set<string>(THEME_OPTIONS.map((option) => option.gradientClass))

export const CUSTOM_GRADIENT_PATTERN =
  /^from-\[#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\] to-\[#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\]$/

export function isCustomGradient(themeGradient: string | undefined): boolean {
  return typeof themeGradient === 'string' && CUSTOM_GRADIENT_PATTERN.test(themeGradient.trim())
}

export function normalizeThemeGradient(themeGradient: string | undefined): string {
  if (!themeGradient) return DEFAULT_THEME_GRADIENT
  const trimmed = themeGradient.trim()
  if (THEME_GRADIENT_SET.has(trimmed) || isCustomGradient(trimmed)) {
    return trimmed
  }
  return DEFAULT_THEME_GRADIENT
}

function normalizeHex(hex: string): string {
  const cleaned = hex.replace('#', '')
  if (cleaned.length === 3) {
    return cleaned
      .split('')
      .map((char) => char + char)
      .join('')
  }
  return cleaned
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = parseInt(normalizeHex(hex), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`
}

export function parseGradientColors(
  themeGradient: string | undefined
): { from: string; to: string } | null {
  if (!isCustomGradient(themeGradient)) return null
  const match = CUSTOM_GRADIENT_PATTERN.exec(themeGradient!.trim())
  if (!match) return null
  return { from: `#${normalizeHex(match[1])}`, to: `#${normalizeHex(match[2])}` }
}

function buildCustomGradientClass(fromHex: string, toHex: string): string {
  return `from-[#${normalizeHex(fromHex)}] to-[#${normalizeHex(toHex)}]`
}

function deriveAccentColor(fromHex: string, toHex: string): string {
  const a = hexToRgb(fromHex)
  const b = hexToRgb(toHex)
  const mid = {
    r: (a.r + b.r) / 2,
    g: (a.g + b.g) / 2,
    b: (a.b + b.b) / 2
  }

  const luma = 0.299 * mid.r + 0.587 * mid.g + 0.114 * mid.b
  const max = Math.max(mid.r, mid.g, mid.b)
  if (luma < 90 && max > 0) {
    const scale = 255 / max
    return rgbToHex(mid.r * scale, mid.g * scale, mid.b * scale)
  }

  return rgbToHex(mid.r, mid.g, mid.b)
}

export function buildPaletteFromGradient(
  fromHex: string,
  toHex: string
): ThemePalette {
  const accent = deriveAccentColor(fromHex, toHex)
  const rgb = hexToRgb(accent)
  const rgba = (alpha: number): string => `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`

  return {
    accent,
    accentSoft: rgba(0.16),
    accentStrong: rgba(0.38),
    onAccent: '#111111',
    userText: '#ffffff',
    assistantText: '#f5f5f4',
    assistantBg: 'rgba(10, 10, 10, 0.72)',
    assistantBorder: 'rgba(255, 255, 255, 0.1)',
    scrollbarThumb: rgba(0.35),
    scrollbarThumbHover: rgba(0.55),
    metaText: 'rgba(255, 255, 255, 0.45)',
    gamification: {
      tierColors: {
        TRIVIAL: '#a8a29e',
        EASY: '#7dd3fc',
        MEDIUM: '#fbbf24',
        HARD: '#fb923c',
        EPIC: '#fb7185'
      },
      levelColor: accent,
      streakColor: accent
    }
  }
}

export function getThemePalette(themeGradient: string | undefined): ThemePalette {
  const normalized = normalizeThemeGradient(themeGradient)
  const match = THEME_OPTIONS.find((option) => option.gradientClass === normalized)
  if (match) {
    return match.palette
  }

  const colors = parseGradientColors(normalized)
  if (colors) {
    return buildPaletteFromGradient(colors.from, colors.to)
  }

  return THEME_OPTIONS[0].palette
}

export function getThemeMode(themeGradient: string | undefined): ThemeMode {
  const normalized = normalizeThemeGradient(themeGradient)
  const match = THEME_OPTIONS.find((option) => option.gradientClass === normalized)
  return match?.mode ?? 'dark'
}

export { buildCustomGradientClass }
