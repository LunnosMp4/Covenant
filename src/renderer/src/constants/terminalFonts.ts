export interface TerminalFontOption {
  id: string
  label: string
  description: string
  fontFamily: string
}

export const DEFAULT_TERMINAL_FONT = 'Cascadia Mono, Consolas, "Courier New", monospace'

export const TERMINAL_FONT_OPTIONS: TerminalFontOption[] = [
  {
    id: 'cascadia-mono',
    label: 'Cascadia Mono',
    description: 'Windows-native coding font with solid PowerShell readability.',
    fontFamily: DEFAULT_TERMINAL_FONT
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    description: 'Developer-focused mono font with strong character distinction.',
    fontFamily: 'JetBrains Mono, Cascadia Mono, Consolas, "Courier New", monospace'
  },
  {
    id: 'fira-code',
    label: 'Fira Code',
    description: 'Clean programming typeface with optional ligature support.',
    fontFamily: 'Fira Code, Cascadia Mono, Consolas, "Courier New", monospace'
  },
  {
    id: 'source-code-pro',
    label: 'Source Code Pro',
    description: 'Balanced Adobe mono with compact terminal rhythm.',
    fontFamily: 'Source Code Pro, Cascadia Mono, Consolas, "Courier New", monospace'
  },
  {
    id: 'ibm-plex-mono',
    label: 'IBM Plex Mono',
    description: 'Technical mono style with crisp punctuation rendering.',
    fontFamily: 'IBM Plex Mono, Cascadia Mono, Consolas, "Courier New", monospace'
  }
]

const TERMINAL_FONT_SET = new Set<string>(TERMINAL_FONT_OPTIONS.map((item) => item.fontFamily))

export function normalizeTerminalFont(fontFamily: string | undefined): string {
  if (!fontFamily) {
    return DEFAULT_TERMINAL_FONT
  }

  const normalizedFontFamily = fontFamily.trim()
  return TERMINAL_FONT_SET.has(normalizedFontFamily)
    ? normalizedFontFamily
    : DEFAULT_TERMINAL_FONT
}
