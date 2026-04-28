import { execFileSync } from 'child_process'

const FALLBACK_TERMINAL_FONTS = ['Cascadia Mono', 'Consolas', 'Courier New', 'Lucida Console']

let cachedTerminalFonts: string[] | null = null

const TERMINAL_FONT_PATTERNS = [
  /\bmono\b/i,
  /\bcode\b/i,
  /\bconsole\b/i,
  /\bcascadia\b/i,
  /\bcaskaydia\b/i,
  /\bconsolas\b/i,
  /\bcourier new\b/i,
  /\blucida console\b/i,
  /\bsegoe ui mono\b/i,
  /\bmeslo\b/i,
  /\bhack\b/i,
  /\bjetbrains\b/i,
  /\bfira code\b/i,
  /\bsource code\b/i,
  /\bibm plex mono\b/i,
  /\bubuntu mono\b/i,
  /\binconsolata\b/i,
  /\banonymous pro\b/i,
  /\bvictor mono\b/i,
  /\biosevka\b/i,
  /\bmonoid\b/i,
  /\brecursive mono\b/i,
  /\broboto mono\b/i,
  /\bnoto sans mono\b/i,
  /\bdroid sans mono\b/i,
  /\bdeja vu sans mono\b/i,
  /\bliberation mono\b/i,
  /\bshare tech mono\b/i,
  /\boperator mono\b/i,
  /\bpragmata\b/i,
  /\bcommit mono\b/i,
  /\bsauce code\b/i,
  /\bremix mono\b/i,
  /\bspacemono\b/i,
  /\berkeley mono\b/i,
  /\boffice code\b/i,
  /\btamzen\b/i,
  /\bgohu\b/i,
  /\bm\+ ?1m\b/i,
  /\bnerd font\b/i
]

function normalizeFontName(fontName: string): string {
  return fontName
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function isTerminalFont(fontName: string): boolean {
  const normalizedName = normalizeFontName(fontName).toLowerCase()
  return TERMINAL_FONT_PATTERNS.some((pattern) => pattern.test(normalizedName))
}

function getFontFamiliesFromSystem(): string[] {
  if (process.platform !== 'win32') {
    return []
  }

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
try {
  Add-Type -AssemblyName PresentationCore | Out-Null
  [System.Windows.Media.Fonts]::SystemFontFamilies | ForEach-Object { $_.Source } | Sort-Object -Unique
} catch {
  try {
    $collection = New-Object System.Drawing.Text.InstalledFontCollection
    $collection.Families | ForEach-Object { $_.Name } | Sort-Object -Unique
  } catch {
  }
}
`

  try {
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 8000
      }
    )

    return output
      .split(/\r?\n/)
      .map((item) => normalizeFontName(item))
      .filter((item) => item.length > 0)
  } catch {
    return []
  }
}

/**
 * Returns terminal-suitable fonts from the installed fonts list.
 * This intentionally excludes generic UI fonts like Arial or Calibri.
 */
export function getTerminalFonts(): string[] {
  if (cachedTerminalFonts) {
    return cachedTerminalFonts
  }

  const installedFonts = getFontFamiliesFromSystem()
  const terminalFonts = installedFonts.filter(isTerminalFont)
  const source = terminalFonts.length > 0 ? terminalFonts : FALLBACK_TERMINAL_FONTS
  cachedTerminalFonts = Array.from(new Set(source)).sort((a, b) => a.localeCompare(b))

  return cachedTerminalFonts
}
