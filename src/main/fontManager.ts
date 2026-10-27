import { execFile } from 'child_process'
import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const FALLBACK_TERMINAL_FONTS = [
  'Cascadia Mono',
  'Consolas',
  'Courier New',
  'Lucida Console',
  'Menlo',
  'Monaco',
  'DejaVu Sans Mono'
]

const FONT_CACHE_FILE = 'terminal-fonts.json'
/** Re-enumerate in the background once the cached list is older than this. */
const FONT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const FONT_SCAN_TIMEOUT_MS = 8000

let cachedTerminalFonts: string[] | null = null
let pendingFontScan: Promise<string[]> | null = null

interface PersistedFontCache {
  generatedAt: number
  fonts: string[]
}

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
  /\bnerd font\b/i,
  /\bmenlo\b/i,
  /\bmonaco\b/i
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

function toFontList(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((item) => normalizeFontName(item))
    .filter((item) => item.length > 0)
}

async function getWindowsFontFamilies(): Promise<string[]> {
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
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        encoding: 'utf-8',
        timeout: FONT_SCAN_TIMEOUT_MS
      }
    )

    return toFontList(stdout)
  } catch {
    return []
  }
}

async function getMacFontFamilies(): Promise<string[]> {
  const script = `
ObjC.import('AppKit');
const families = $.NSFontManager.sharedFontManager.availableFontFamilies;
let out = [];
for (let i = 0; i < families.count; i++) {
  out.push(ObjC.unwrap(families.objectAtIndex(i)));
}
out.join('\\n');
`

  try {
    const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script], {
      encoding: 'utf-8',
      timeout: FONT_SCAN_TIMEOUT_MS
    })

    return toFontList(stdout)
  } catch {
    return []
  }
}

async function getLinuxFontFamilies(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('fc-list', ['--format', '%{family}\\n'], {
      encoding: 'utf-8',
      timeout: FONT_SCAN_TIMEOUT_MS
    })

    return toFontList(stdout.replace(/,/g, '\n'))
  } catch {
    return []
  }
}

async function getFontFamiliesFromSystem(): Promise<string[]> {
  switch (process.platform) {
    case 'win32':
      return getWindowsFontFamilies()
    case 'darwin':
      return getMacFontFamilies()
    case 'linux':
      return getLinuxFontFamilies()
    default:
      return []
  }
}

function getFontCachePath(): string {
  return join(app.getPath('userData'), FONT_CACHE_FILE)
}

async function readPersistedFontCache(): Promise<PersistedFontCache | null> {
  try {
    const raw = await fs.readFile(getFontCachePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PersistedFontCache>
    if (!Array.isArray(parsed.fonts)) return null
    const fonts = parsed.fonts.filter((font): font is string => typeof font === 'string' && font.length > 0)
    if (fonts.length === 0) return null
    return {
      generatedAt: typeof parsed.generatedAt === 'number' ? parsed.generatedAt : 0,
      fonts
    }
  } catch {
    return null
  }
}

async function writePersistedFontCache(fonts: string[]): Promise<void> {
  try {
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    const payload: PersistedFontCache = { generatedAt: Date.now(), fonts }
    await fs.writeFile(getFontCachePath(), JSON.stringify(payload), 'utf-8')
  } catch {
    // Caching is best-effort; enumeration still works without it.
  }
}

async function scanTerminalFonts(): Promise<string[]> {
  const installedFonts = await getFontFamiliesFromSystem()
  const terminalFonts = installedFonts.filter(isTerminalFont)
  const source = terminalFonts.length > 0 ? terminalFonts : FALLBACK_TERMINAL_FONTS
  return Array.from(new Set(source)).sort((a, b) => a.localeCompare(b))
}

/**
 * Returns terminal-suitable fonts from the installed fonts list.
 * This intentionally excludes generic UI fonts like Arial or Calibri.
 *
 * Enumeration shells out to the OS (up to 8s), so it runs asynchronously instead
 * of blocking the main process, and its result is cached on disk to make later
 * visits to Settings instant.
 */
export async function getTerminalFonts(): Promise<string[]> {
  if (cachedTerminalFonts) {
    return cachedTerminalFonts
  }

  if (pendingFontScan) {
    return pendingFontScan
  }

  const persisted = await readPersistedFontCache()
  if (persisted) {
    cachedTerminalFonts = persisted.fonts
    if (Date.now() - persisted.generatedAt > FONT_CACHE_TTL_MS) {
      // Serve the cached list immediately and refresh it quietly.
      void scanTerminalFonts()
        .then((fonts) => {
          cachedTerminalFonts = fonts
          return writePersistedFontCache(fonts)
        })
        .catch(() => undefined)
    }
    return cachedTerminalFonts
  }

  pendingFontScan = scanTerminalFonts()
    .then((fonts) => {
      cachedTerminalFonts = fonts
      void writePersistedFontCache(fonts)
      return fonts
    })
    .catch(() => FALLBACK_TERMINAL_FONTS)
    .finally(() => {
      pendingFontScan = null
    })

  return pendingFontScan
}
