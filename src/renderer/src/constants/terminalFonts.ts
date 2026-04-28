export const DEFAULT_TERMINAL_FONT = 'Cascadia Mono, Consolas, "Courier New", monospace'

function extractTerminalFontFamily(fontFamily: string): string {
  const primaryFont = fontFamily.trim().split(',')[0] ?? ''
  return primaryFont.replace(/^['\"]|['\"]$/g, '').trim()
}

export function normalizeTerminalFont(fontFamily: string | undefined): string {
  if (!fontFamily) {
    return DEFAULT_TERMINAL_FONT
  }

  const normalizedFontFamily = extractTerminalFontFamily(fontFamily)
  return normalizedFontFamily.length > 0 ? normalizedFontFamily : DEFAULT_TERMINAL_FONT
}
