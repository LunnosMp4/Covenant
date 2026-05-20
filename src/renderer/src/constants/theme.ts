export interface ThemeOption {
  id: string
  label: string
  description: string
  gradientClass: string
  palette: ThemePalette
}

export interface ThemePalette {
  accent: string
  accentSoft: string
  accentStrong: string
  userText: string
  assistantText: string
  assistantBg: string
  assistantBorder: string
  scrollbarThumb: string
  scrollbarThumbHover: string
  metaText: string
}

export const DEFAULT_THEME_GRADIENT = 'from-neutral-900/95 to-[#1c0f03]'

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'dark-default',
    label: 'Dark Neutral',
    description: 'Balanced dark gradient',
    gradientClass: 'from-neutral-900/95 to-[#1c0f03]',
    palette: {
      accent: '#f59e0b',
      accentSoft: 'rgba(245, 158, 11, 0.16)',
      accentStrong: 'rgba(245, 158, 11, 0.38)',
      userText: '#fff7ed',
      assistantText: '#f5f5f4',
      assistantBg: 'rgba(10, 10, 10, 0.72)',
      assistantBorder: 'rgba(255, 255, 255, 0.1)',
      scrollbarThumb: 'rgba(245, 158, 11, 0.35)',
      scrollbarThumbHover: 'rgba(245, 158, 11, 0.55)',
      metaText: 'rgba(255, 255, 255, 0.45)'
    }
  },
  {
    id: 'blue-depth',
    label: 'Blue Depth',
    description: 'Cool steel tone',
    gradientClass: 'from-slate-900 to-[#071726]',
    palette: {
      accent: '#60a5fa',
      accentSoft: 'rgba(96, 165, 250, 0.16)',
      accentStrong: 'rgba(96, 165, 250, 0.38)',
      userText: '#e0f2fe',
      assistantText: '#f8fafc',
      assistantBg: 'rgba(6, 10, 18, 0.74)',
      assistantBorder: 'rgba(148, 163, 184, 0.2)',
      scrollbarThumb: 'rgba(96, 165, 250, 0.35)',
      scrollbarThumbHover: 'rgba(96, 165, 250, 0.55)',
      metaText: 'rgba(226, 232, 240, 0.55)'
    }
  },
  {
    id: 'violet-focus',
    label: 'Violet Focus',
    description: 'Focused creative mood',
    gradientClass: 'from-zinc-900 to-[#1a1026]',
    palette: {
      accent: '#a78bfa',
      accentSoft: 'rgba(167, 139, 250, 0.16)',
      accentStrong: 'rgba(167, 139, 250, 0.38)',
      userText: '#ede9fe',
      assistantText: '#f5f3ff',
      assistantBg: 'rgba(18, 12, 26, 0.74)',
      assistantBorder: 'rgba(196, 181, 253, 0.2)',
      scrollbarThumb: 'rgba(167, 139, 250, 0.35)',
      scrollbarThumbHover: 'rgba(167, 139, 250, 0.55)',
      metaText: 'rgba(221, 214, 254, 0.55)'
    }
  },
  {
    id: 'emerald-night',
    label: 'Emerald Night',
    description: 'Dark green accent',
    gradientClass: 'from-neutral-900 to-[#0a1f17]',
    palette: {
      accent: '#34d399',
      accentSoft: 'rgba(52, 211, 153, 0.16)',
      accentStrong: 'rgba(52, 211, 153, 0.38)',
      userText: '#d1fae5',
      assistantText: '#ecfdf5',
      assistantBg: 'rgba(7, 19, 15, 0.76)',
      assistantBorder: 'rgba(110, 231, 183, 0.2)',
      scrollbarThumb: 'rgba(52, 211, 153, 0.35)',
      scrollbarThumbHover: 'rgba(52, 211, 153, 0.55)',
      metaText: 'rgba(209, 250, 229, 0.55)'
    }
  }
]

const THEME_GRADIENT_SET = new Set<string>(THEME_OPTIONS.map((option) => option.gradientClass))

export function normalizeThemeGradient(themeGradient: string | undefined): string {
  if (!themeGradient) return DEFAULT_THEME_GRADIENT
  return THEME_GRADIENT_SET.has(themeGradient) ? themeGradient : DEFAULT_THEME_GRADIENT
}

export function getThemePalette(themeGradient: string | undefined): ThemePalette {
  const normalized = normalizeThemeGradient(themeGradient)
  const match = THEME_OPTIONS.find((option) => option.gradientClass === normalized)
  return match?.palette ?? THEME_OPTIONS[0].palette
}
