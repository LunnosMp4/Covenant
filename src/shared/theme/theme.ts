import type { TaskTier } from '../tasks/gamification'

export type ThemeMode = 'dark' | 'light'

export interface GamificationColors {
  tierColors: Record<TaskTier, string>
  levelColor: string
  streakColor: string
}

export interface ThemePalette {
  accent: string
  accentSoft: string
  accentStrong: string
  onAccent: string
  userText: string
  userBg: string
  userBorder: string
  assistantText: string
  assistantBg: string
  assistantBorder: string
  scrollbarThumb: string
  scrollbarThumbHover: string
  metaText: string
  gamification: GamificationColors
}

export interface ThemeOption {
  id: string
  label: string
  description: string
  mode: ThemeMode
  gradientClass: string
  preview: { from: string; to: string }
  palette: ThemePalette
}

export interface NeutralTint {
  hex: string
  strength: number
}

type ThemePaletteBase = Omit<ThemePalette, 'gamification'>

interface ThemeSpec {
  id: string
  label: string
  description: string
  mode: ThemeMode
  gradientClass: string
  preview: { from: string; to: string }
  palette: ThemePaletteBase
  neutralTint: NeutralTint
}

const DARK_GAMIFICATION_TIERS: Record<TaskTier, string> = {
  TRIVIAL: '#9CA3AF',
  EASY: '#8FB4DC',
  MEDIUM: '#D9B36C',
  HARD: '#D98A63',
  EPIC: '#D87C8A'
}

const LIGHT_GAMIFICATION_TIERS: Record<TaskTier, string> = {
  TRIVIAL: '#6B7280',
  EASY: '#4A7FAF',
  MEDIUM: '#9A6B1F',
  HARD: '#A85234',
  EPIC: '#A63D52'
}

const DARK_NEUTRAL_RAMP = [
  'FAFAFA',
  'F5F5F5',
  'E5E5E5',
  'D4D4D4',
  'A3A3A3',
  '737373',
  '525252',
  '404040',
  '262626',
  '171717',
  '0A0A0A'
] as const

const LIGHT_NEUTRAL_RAMP = [...DARK_NEUTRAL_RAMP].reverse()

const NEUTRAL_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

const THEME_SPECS: ThemeSpec[] = [
  {
    id: 'dark-graphite',
    label: 'Graphite',
    description: 'Neutral charcoal with a silver accent',
    mode: 'dark',
    gradientClass: 'from-[#1B1C1F] to-[#161719]',
    preview: { from: '#1B1C1F', to: '#161719' },
    palette: {
      accent: '#E6E6E3',
      accentSoft: 'rgba(230, 230, 227, 0.12)',
      accentStrong: 'rgba(230, 230, 227, 0.26)',
      onAccent: '#151515',
      userText: '#F6F6F4',
      userBg: 'rgba(255, 255, 255, 0.07)',
      userBorder: 'rgba(255, 255, 255, 0.10)',
      assistantText: '#F1F1EF',
      assistantBg: 'rgba(255, 255, 255, 0.035)',
      assistantBorder: 'rgba(255, 255, 255, 0.08)',
      scrollbarThumb: 'rgba(255, 255, 255, 0.16)',
      scrollbarThumbHover: 'rgba(255, 255, 255, 0.26)',
      metaText: '#9A9A98'
    },
    neutralTint: { hex: '#808080', strength: 0 }
  },
  {
    id: 'dark-slate',
    label: 'Slate',
    description: 'Cool grey-blue with a dusty blue accent',
    mode: 'dark',
    gradientClass: 'from-[#1A1F25] to-[#15181C]',
    preview: { from: '#1A1F25', to: '#15181C' },
    palette: {
      accent: '#83A9DC',
      accentSoft: 'rgba(131, 169, 220, 0.14)',
      accentStrong: 'rgba(131, 169, 220, 0.30)',
      onAccent: '#0B1118',
      userText: '#F3F7FB',
      userBg: 'rgba(255, 255, 255, 0.07)',
      userBorder: 'rgba(160, 190, 225, 0.14)',
      assistantText: '#EEF2F7',
      assistantBg: 'rgba(255, 255, 255, 0.035)',
      assistantBorder: 'rgba(150, 180, 215, 0.12)',
      scrollbarThumb: 'rgba(255, 255, 255, 0.16)',
      scrollbarThumbHover: 'rgba(255, 255, 255, 0.26)',
      metaText: '#98A2AC'
    },
    neutralTint: { hex: '#4A7FB5', strength: 0.04 }
  },
  {
    id: 'dark-clay',
    label: 'Clay',
    description: 'Warm charcoal with a terracotta accent',
    mode: 'dark',
    gradientClass: 'from-[#201C19] to-[#1A1816]',
    preview: { from: '#201C19', to: '#1A1816' },
    palette: {
      accent: '#D97757',
      accentSoft: 'rgba(217, 119, 87, 0.16)',
      accentStrong: 'rgba(217, 119, 87, 0.32)',
      onAccent: '#1A0E0A',
      userText: '#FAF3ED',
      userBg: 'rgba(255, 244, 236, 0.07)',
      userBorder: 'rgba(230, 195, 175, 0.14)',
      assistantText: '#F5EFEA',
      assistantBg: 'rgba(255, 255, 255, 0.04)',
      assistantBorder: 'rgba(220, 185, 165, 0.12)',
      scrollbarThumb: 'rgba(255, 255, 255, 0.16)',
      scrollbarThumbHover: 'rgba(255, 255, 255, 0.26)',
      metaText: '#A39A92'
    },
    neutralTint: { hex: '#B0633F', strength: 0.04 }
  },
  {
    id: 'dark-moss',
    label: 'Moss',
    description: 'Deep green-grey with a sage accent',
    mode: 'dark',
    gradientClass: 'from-[#1B211C] to-[#161A17]',
    preview: { from: '#1B211C', to: '#161A17' },
    palette: {
      accent: '#91B096',
      accentSoft: 'rgba(145, 176, 150, 0.14)',
      accentStrong: 'rgba(145, 176, 150, 0.30)',
      onAccent: '#101710',
      userText: '#F4F8F4',
      userBg: 'rgba(255, 255, 255, 0.07)',
      userBorder: 'rgba(185, 210, 188, 0.14)',
      assistantText: '#EFF4EF',
      assistantBg: 'rgba(255, 255, 255, 0.035)',
      assistantBorder: 'rgba(170, 200, 175, 0.12)',
      scrollbarThumb: 'rgba(255, 255, 255, 0.16)',
      scrollbarThumbHover: 'rgba(255, 255, 255, 0.26)',
      metaText: '#99A39A'
    },
    neutralTint: { hex: '#5C8064', strength: 0.04 }
  },
  {
    id: 'light-porcelain',
    label: 'Porcelain',
    description: 'Crisp off-white with an ink accent',
    mode: 'light',
    gradientClass: 'from-[#FEFEFD] to-[#F6F6F3]',
    preview: { from: '#FEFEFD', to: '#F6F6F3' },
    palette: {
      accent: '#1F1F1F',
      accentSoft: 'rgba(31, 31, 31, 0.06)',
      accentStrong: 'rgba(31, 31, 31, 0.16)',
      onAccent: '#FFFFFF',
      userText: '#1C1C1A',
      userBg: 'rgba(0, 0, 0, 0.045)',
      userBorder: 'rgba(0, 0, 0, 0.075)',
      assistantText: '#262624',
      assistantBg: 'rgba(255, 255, 255, 0.55)',
      assistantBorder: 'rgba(0, 0, 0, 0.06)',
      scrollbarThumb: 'rgba(0, 0, 0, 0.16)',
      scrollbarThumbHover: 'rgba(0, 0, 0, 0.26)',
      metaText: '#6B6B68'
    },
    neutralTint: { hex: '#8A7A68', strength: 0.035 }
  },
  {
    id: 'light-mist',
    label: 'Mist',
    description: 'Cool off-white with a dusty blue accent',
    mode: 'light',
    gradientClass: 'from-[#FBFCFD] to-[#EFF3F8]',
    preview: { from: '#FBFCFD', to: '#EFF3F8' },
    palette: {
      accent: '#3D6E9E',
      accentSoft: 'rgba(61, 110, 158, 0.10)',
      accentStrong: 'rgba(61, 110, 158, 0.24)',
      onAccent: '#FFFFFF',
      userText: '#1B2735',
      userBg: 'rgba(20, 40, 60, 0.05)',
      userBorder: 'rgba(35, 65, 95, 0.10)',
      assistantText: '#24303C',
      assistantBg: 'rgba(255, 255, 255, 0.58)',
      assistantBorder: 'rgba(35, 60, 85, 0.08)',
      scrollbarThumb: 'rgba(0, 0, 0, 0.16)',
      scrollbarThumbHover: 'rgba(0, 0, 0, 0.26)',
      metaText: '#66707A'
    },
    neutralTint: { hex: '#4A7FB5', strength: 0.035 }
  },
  {
    id: 'light-linen',
    label: 'Linen',
    description: 'Warm ivory with a terracotta accent',
    mode: 'light',
    gradientClass: 'from-[#FCF9F3] to-[#F4EDE2]',
    preview: { from: '#FCF9F3', to: '#F4EDE2' },
    palette: {
      accent: '#AA5233',
      accentSoft: 'rgba(170, 82, 51, 0.10)',
      accentStrong: 'rgba(170, 82, 51, 0.24)',
      onAccent: '#FFFFFF',
      userText: '#2B211A',
      userBg: 'rgba(80, 50, 30, 0.05)',
      userBorder: 'rgba(95, 65, 40, 0.10)',
      assistantText: '#2E2620',
      assistantBg: 'rgba(255, 255, 255, 0.58)',
      assistantBorder: 'rgba(90, 60, 40, 0.08)',
      scrollbarThumb: 'rgba(0, 0, 0, 0.16)',
      scrollbarThumbHover: 'rgba(0, 0, 0, 0.26)',
      metaText: '#746A5F'
    },
    neutralTint: { hex: '#B08262', strength: 0.035 }
  },
  {
    id: 'light-sage',
    label: 'Sage',
    description: 'Soft green-white with a sage accent',
    mode: 'light',
    gradientClass: 'from-[#F7FAF5] to-[#EBF1E8]',
    preview: { from: '#F7FAF5', to: '#EBF1E8' },
    palette: {
      accent: '#4F7359',
      accentSoft: 'rgba(79, 115, 89, 0.10)',
      accentStrong: 'rgba(79, 115, 89, 0.24)',
      onAccent: '#FFFFFF',
      userText: '#202B23',
      userBg: 'rgba(40, 70, 50, 0.05)',
      userBorder: 'rgba(50, 85, 60, 0.10)',
      assistantText: '#26312A',
      assistantBg: 'rgba(255, 255, 255, 0.58)',
      assistantBorder: 'rgba(50, 80, 60, 0.08)',
      scrollbarThumb: 'rgba(0, 0, 0, 0.16)',
      scrollbarThumbHover: 'rgba(0, 0, 0, 0.26)',
      metaText: '#667066'
    },
    neutralTint: { hex: '#5C8064', strength: 0.035 }
  }
]

function buildGamification(mode: ThemeMode, accent: string): GamificationColors {
  return {
    tierColors: mode === 'dark' ? { ...DARK_GAMIFICATION_TIERS } : { ...LIGHT_GAMIFICATION_TIERS },
    levelColor: accent,
    streakColor: accent
  }
}

function withGamification(spec: ThemeSpec): ThemeOption {
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    mode: spec.mode,
    gradientClass: spec.gradientClass,
    preview: spec.preview,
    palette: {
      ...spec.palette,
      gamification: buildGamification(spec.mode, spec.palette.accent)
    }
  }
}

export const THEME_OPTIONS: ThemeOption[] = THEME_SPECS.map(withGamification)

export const DEFAULT_THEME_GRADIENT = 'from-[#1B1C1F] to-[#161719]'

const THEME_GRADIENT_SET = new Set<string>(THEME_OPTIONS.map((option) => option.gradientClass))

/**
 * Saved configs from the previous theme set. Kept out of THEME_OPTIONS so the
 * picker only shows the new palette while existing installs migrate cleanly.
 */
const LEGACY_THEME_GRADIENTS: Record<string, string> = {
  'from-neutral-900/95 to-[#1c0f03]': 'from-[#1B1C1F] to-[#161719]',
  'from-neutral-900 to-[#18332e]': 'from-[#1B211C] to-[#161A17]',
  'from-[#fdfdfd] to-[#badaff]': 'from-[#FBFCFD] to-[#EFF3F8]',
  'from-[#fcf7e8] to-[#cfb28f]': 'from-[#FCF9F3] to-[#F4EDE2]',
  // Intermediate translucent theme values from the first palette pass.
  'from-[rgb(27_28_31_/_0.96)] to-[rgb(22_23_25_/_0.94)]': 'from-[#1B1C1F] to-[#161719]',
  'from-[rgb(26_31_37_/_0.96)] to-[rgb(21_24_28_/_0.94)]': 'from-[#1A1F25] to-[#15181C]',
  'from-[rgb(32_28_25_/_0.96)] to-[rgb(26_24_22_/_0.94)]': 'from-[#201C19] to-[#1A1816]',
  'from-[rgb(27_33_28_/_0.96)] to-[rgb(22_26_23_/_0.94)]': 'from-[#1B211C] to-[#161A17]',
  'from-[rgb(254_254_253_/_0.96)] to-[rgb(246_246_243_/_0.94)]': 'from-[#FEFEFD] to-[#F6F6F3]',
  'from-[rgb(251_252_253_/_0.96)] to-[rgb(239_243_248_/_0.94)]': 'from-[#FBFCFD] to-[#EFF3F8]',
  'from-[rgb(252_249_243_/_0.96)] to-[rgb(244_237_226_/_0.94)]': 'from-[#FCF9F3] to-[#F4EDE2]',
  'from-[rgb(247_250_245_/_0.96)] to-[rgb(235_241_232_/_0.94)]': 'from-[#F7FAF5] to-[#EBF1E8]'
}

export const CUSTOM_GRADIENT_PATTERN =
  /^from-\[#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\] to-\[#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\]$/

export function isCustomGradient(themeGradient: string | undefined): boolean {
  if (typeof themeGradient !== 'string') return false
  const trimmed = themeGradient.trim()
  return !THEME_GRADIENT_SET.has(trimmed) && CUSTOM_GRADIENT_PATTERN.test(trimmed)
}

export function normalizeThemeGradient(themeGradient: string | undefined): string {
  if (!themeGradient) return DEFAULT_THEME_GRADIENT
  const trimmed = themeGradient.trim()
  const migrated = LEGACY_THEME_GRADIENTS[trimmed]
  if (migrated) return migrated
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

function rgbTriplet(r: number, g: number, b: number): string {
  const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n)))
  return `${clamp(r)} ${clamp(g)} ${clamp(b)}`
}

function blendHex(baseHex: string, tintHex: string, amount: number): string {
  const base = hexToRgb(baseHex)
  const tint = hexToRgb(tintHex)
  return rgbToHex(
    base.r + (tint.r - base.r) * amount,
    base.g + (tint.g - base.g) * amount,
    base.b + (tint.b - base.b) * amount
  )
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const channel = (value: number): number => {
    const normalized = value / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function getContrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a
  )
  return (lighter + 0.05) / (darker + 0.05)
}

function averageLuma(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function modeFromColors(fromHex: string, toHex: string): ThemeMode {
  return (averageLuma(fromHex) + averageLuma(toHex)) / 2 >= 0.5 ? 'light' : 'dark'
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

function ensureAccentContrast(accent: string, surface: string, mode: ThemeMode): string {
  if (getContrastRatio(accent, surface) >= 4.5) return accent
  const target = mode === 'light' ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 }
  const start = hexToRgb(accent)
  for (let step = 1; step <= 20; step += 1) {
    const amount = step / 20
    const candidate = rgbToHex(
      start.r + (target.r - start.r) * amount,
      start.g + (target.g - start.g) * amount,
      start.b + (target.b - start.b) * amount
    )
    if (getContrastRatio(candidate, surface) >= 4.5) return candidate
  }
  return rgbToHex(target.r, target.g, target.b)
}

export function buildPaletteFromGradient(fromHex: string, toHex: string): ThemePalette {
  const mode = modeFromColors(fromHex, toHex)
  const lighterSurface =
    averageLuma(fromHex) >= averageLuma(toHex) ? fromHex : toHex
  const derived = deriveAccentColor(fromHex, toHex)
  const accent =
    mode === 'light' ? ensureAccentContrast(derived, lighterSurface, mode) : derived
  const rgb = hexToRgb(accent)
  const rgba = (alpha: number): string => `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`
  const dark = mode === 'dark'

  return {
    accent,
    accentSoft: rgba(dark ? 0.16 : 0.10),
    accentStrong: rgba(dark ? 0.36 : 0.26),
    onAccent: dark ? '#111111' : '#FFFFFF',
    userText: dark ? '#F4F4F2' : '#1C1C1A',
    userBg: dark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.045)',
    userBorder: dark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.075)',
    assistantText: dark ? '#F1F1EF' : '#262624',
    assistantBg: dark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(255, 255, 255, 0.55)',
    assistantBorder: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    scrollbarThumb: dark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.16)',
    scrollbarThumbHover: dark ? 'rgba(255, 255, 255, 0.26)' : 'rgba(0, 0, 0, 0.26)',
    metaText: dark ? '#9A9A98' : '#6B6B68',
    gamification: buildGamification(mode, accent)
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
  if (match) return match.mode

  const colors = parseGradientColors(normalized)
  if (colors) return modeFromColors(colors.from, colors.to)

  return THEME_OPTIONS[0].mode
}

export function getThemeNeutralTint(themeGradient: string | undefined): NeutralTint {
  const normalized = normalizeThemeGradient(themeGradient)
  const spec = THEME_SPECS.find((entry) => entry.gradientClass === normalized)
  if (spec) return spec.neutralTint

  const colors = parseGradientColors(normalized)
  if (colors) {
    return {
      hex: deriveAccentColor(colors.from, colors.to),
      strength: getThemeMode(normalized) === 'dark' ? 0.04 : 0.035
    }
  }

  return THEME_SPECS[0].neutralTint
}

export function buildNeutralScale(
  mode: ThemeMode,
  tint: NeutralTint
): Record<string, string> {
  const base = mode === 'dark' ? DARK_NEUTRAL_RAMP : LIGHT_NEUTRAL_RAMP
  const scale: Record<string, string> = {}

  NEUTRAL_SHADES.forEach((shade, index) => {
    const color = blendHex(`#${base[index]}`, tint.hex, tint.strength)
    const { r, g, b } = hexToRgb(color)
    scale[String(shade)] = rgbTriplet(r, g, b)
  })

  return scale
}

export function getThemeCssVars(themeGradient: string | undefined): Record<string, string> {
  const normalized = normalizeThemeGradient(themeGradient)
  const palette = getThemePalette(normalized)
  const mode = getThemeMode(normalized)
  const neutral = buildNeutralScale(mode, getThemeNeutralTint(normalized))

  const vars: Record<string, string> = {
    '--chat-accent': palette.accent,
    '--chat-accent-soft': palette.accentSoft,
    '--chat-accent-strong': palette.accentStrong,
    '--chat-on-accent': palette.onAccent,
    '--chat-user-text': palette.userText,
    '--chat-user-bg': palette.userBg,
    '--chat-user-border': palette.userBorder,
    '--chat-assistant-text': palette.assistantText,
    '--chat-assistant-bg': palette.assistantBg,
    '--chat-assistant-border': palette.assistantBorder,
    '--chat-scroll-thumb': palette.scrollbarThumb,
    '--chat-scroll-thumb-hover': palette.scrollbarThumbHover,
    '--chat-meta-text': palette.metaText
  }

  for (const [shade, value] of Object.entries(neutral)) {
    vars[`--n-${shade}`] = value
  }

  return vars
}

export { buildCustomGradientClass }
