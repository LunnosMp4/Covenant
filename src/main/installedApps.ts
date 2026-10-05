import { app, nativeImage, shell } from 'electron'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { promises as fsPromises, type Dirent } from 'fs'
import { homedir, tmpdir } from 'os'
import { extname, join } from 'path'
import type { InstalledApp } from '../shared/launcher/launcher'

const APP_EXTENSION_PATTERN = /\.(app|lnk|exe|url)$/i
const WINDOWS_SHORTCUT_PATTERN = /\.(lnk|url)$/i

// Documentation, help pages and uninstallers clutter the Windows Start Menu
// but are not apps a user wants to launch. Matched as a whole word anywhere.
const IGNORED_NAME_PATTERN =
  /(^|[\s\-_.()[\]])(uninstall|uninstaller|remove|readme|read ?me|help|documentation|docs?|manual|user guide|release notes?|changelog|getting started|quick ?start|website|web ?site|on the web|faq|support|license|licence|homepage)(\b|$)/i

// Windows groups built-in utilities into these Start Menu folders. They are
// hidden by default (see launcherShowSystemApps) because they are not
// "installed apps" in the way macOS /Applications is.
const WINDOWS_IGNORED_FOLDER_PATTERN =
  /^(accessibility|accessories|administrative tools|windows administrative tools|windows accessories|windows ease of access|windows system|system tools|ease of access|maintenance|startup|windows powershell)$/i

const UNINSTALLER_TARGET_PATTERN = /(uninstall|unins\d|msiexec)/i

// Lists Microsoft Store / UWP apps (including Xbox games) that have no Start
// Menu shortcut, along with the best available logo asset from the package.
// Get-StartApps gives the localized name + AUMID; Get-AppxPackage + the
// manifest give the icon. Emits JSON.
const STORE_APPS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$pkgs = @{}
Get-AppxPackage | ForEach-Object { $pkgs[$_.PackageFamilyName] = $_.InstallLocation }
$apps = Get-StartApps | Where-Object { $_.AppID -match '!' -and $_.AppID -notmatch '[\\/]' }
$result = foreach ($entry in $apps) {
  $id = $entry.AppID
  $parts = $id.Split('!', 2)
  $pfn = $parts[0]
  $appId = $parts[1]
  $loc = $pkgs[$pfn]
  $logo = $null
  if ($loc) {
    $manifestPath = Join-Path $loc 'AppxManifest.xml'
    try {
      $xml = [xml](Get-Content -LiteralPath $manifestPath -Raw)
      $node = $xml.SelectSingleNode("//*[local-name()='Application' and @Id='$appId']/*[local-name()='VisualElements']")
      if (-not $node) { $node = $xml.SelectSingleNode("//*[local-name()='VisualElements']") }
      $rel = ''
      if ($node) { $rel = [string]$node.Square44x44Logo; if (-not $rel) { $rel = [string]$node.Square150x150Logo } }
      if ($rel) {
        $full = Join-Path $loc $rel
        $dir = [System.IO.Path]::GetDirectoryName($full)
        $base = [System.IO.Path]::GetFileNameWithoutExtension($full)
        $cands = @(Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.Name -like "$base*" })
        $pick = $cands | Where-Object { $_.Name -match 'targetsize-256' -and $_.Name -match 'unplated' } | Select-Object -First 1
        if (-not $pick) { $pick = $cands | Where-Object { $_.Name -match 'targetsize-256' } | Select-Object -First 1 }
        if (-not $pick) { $pick = $cands | Where-Object { $_.Name -match 'scale-400' } | Select-Object -First 1 }
        if (-not $pick) { $pick = $cands | Where-Object { $_.Name -match 'scale-200' } | Select-Object -First 1 }
        if (-not $pick) { $pick = $cands | Where-Object { $_.Name -eq ([System.IO.Path]::GetFileName($full)) } | Select-Object -First 1 }
        if (-not $pick) { $pick = $cands | Select-Object -First 1 }
        if ($pick) { $logo = $pick.FullName }
      }
    } catch {}
  }
  [pscustomobject]@{ Name = $entry.Name; Aumid = $id; LogoPath = $logo }
}
$result | ConvertTo-Json -Compress -Depth 3
`

// Shortcut targets with these extensions are documentation or installers, not
// apps. Everything else (including unusual launch targets and .appref-ms) is
// kept so we never hide a real application.
const NON_APP_TARGET_EXTENSIONS = new Set([
  '.chm',
  '.pdf',
  '.txt',
  '.hlp',
  '.htm',
  '.html',
  '.rtf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.msc',
  '.msi',
  '.msp',
  '.url'
])

let cachedApps: InstalledApp[] | null = null
let cachedIncludeSystemApps = false
let scanPromise: Promise<InstalledApp[]> | null = null
let scanPromiseIncludeSystemApps = false
let cacheGeneration = 0
const iconCache = new Map<string, string>()
// Maps a Store app's launch path (shell:AppsFolder\...) to its resolved logo.
const uwpIconSources = new Map<string, string>()

function deriveTitle(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? ''
  return base.replace(APP_EXTENSION_PATTERN, '').trim()
}

function getScanDirectories(): string[] {
  if (process.platform === 'darwin') {
    return [
      '/Applications',
      '/System/Applications',
      '/System/Applications/Utilities',
      '/Applications/Utilities',
      join(homedir(), 'Applications')
    ]
  }

  if (process.platform === 'win32') {
    const directories: string[] = []
    const appData = process.env.APPDATA
    const programData = process.env.ProgramData

    if (appData) {
      directories.push(join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'))
    }
    if (programData) {
      directories.push(join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'))
    }

    return directories
  }

  return []
}

function pushApp(
  results: InstalledApp[],
  seen: Set<string>,
  filePath: string,
  includeSystemApps: boolean,
  dedupKey: string = filePath
): void {
  const title = deriveTitle(filePath)
  if (!title || title.startsWith('.')) {
    return
  }
  if (!includeSystemApps && IGNORED_NAME_PATTERN.test(title)) {
    return
  }

  // Dedup on a caller-provided key so the same shortcut exposed in both the
  // per-user and the machine-wide Start Menu scopes only appears once, while
  // distinct apps that happen to share a title are preserved.
  const key = dedupKey.toLowerCase()
  if (seen.has(key)) {
    return
  }
  seen.add(key)

  results.push({
    id: filePath,
    title,
    path: filePath
  })
}

// A Start Menu .lnk can point at a website, a readme, an uninstaller or a
// folder. Keep it unless the target is clearly not an app; UWP apps and
// unresolved targets are kept because they are usually real apps.
function isLaunchableShortcut(shortcutPath: string): boolean {
  let target = ''

  try {
    target = shell.readShortcutLink(shortcutPath).target ?? ''
  } catch {
    return true
  }

  if (!target) {
    return true
  }

  if (/^https?:\/\//i.test(target)) {
    return false
  }

  const normalizedTarget = target.replace(/\\/g, '/')
  if (UNINSTALLER_TARGET_PATTERN.test(normalizedTarget)) {
    return false
  }

  return !NON_APP_TARGET_EXTENSIONS.has(extname(target).toLowerCase())
}

// .url shortcuts are internet shortcuts. Steam, Epic and other launchers use
// them with custom protocols (steam://rungameid/...), so only the plain
// http(s) website/documentation shortcuts are dropped.
async function isLaunchableUrlShortcut(filePath: string): Promise<boolean> {
  let content = ''

  try {
    content = await fsPromises.readFile(filePath, 'utf-8')
  } catch {
    return true
  }

  const match = content.match(/^\s*URL=(.+?)\s*$/im)
  if (!match) {
    return true
  }

  return !/^https?:\/\//i.test(match[1])
}

async function walkWindowsDirectory(
  directory: string,
  results: InstalledApp[],
  seen: Set<string>,
  depth: number,
  includeSystemApps: boolean,
  root: string
): Promise<void> {
  if (depth > 4) return

  let entries: Dirent[]
  try {
    entries = await fsPromises.readdir(directory, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      if (!includeSystemApps && WINDOWS_IGNORED_FOLDER_PATTERN.test(entry.name.trim())) {
        continue
      }
      await walkWindowsDirectory(entryPath, results, seen, depth + 1, includeSystemApps, root)
    } else if (entry.isFile() && WINDOWS_SHORTCUT_PATTERN.test(entry.name)) {
      const dedupKey = entryPath.slice(root.length)

      if (includeSystemApps) {
        pushApp(results, seen, entryPath, true, dedupKey)
        continue
      }

      if (/\.lnk$/i.test(entry.name)) {
        if (isLaunchableShortcut(entryPath)) {
          pushApp(results, seen, entryPath, false, dedupKey)
        }
      } else if (await isLaunchableUrlShortcut(entryPath)) {
        pushApp(results, seen, entryPath, false, dedupKey)
      }
    }
  }
}

type StoreAppEntry = { Name?: unknown; Aumid?: unknown; LogoPath?: unknown }

// Adds Microsoft Store / UWP apps (Minecraft Launcher, Xbox games, …) that
// are invisible to the Start Menu folder scan. Titles already provided by a
// shortcut are skipped so we never duplicate an app.
async function scanWindowsStoreApps(existingTitles: Set<string>): Promise<InstalledApp[]> {
  if (process.platform !== 'win32') {
    return []
  }

  const output = await runCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    STORE_APPS_SCRIPT
  ])

  if (!output) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    return []
  }

  const entries: StoreAppEntry[] = Array.isArray(parsed)
    ? (parsed as StoreAppEntry[])
    : parsed && typeof parsed === 'object'
      ? [parsed as StoreAppEntry]
      : []

  const results: InstalledApp[] = []

  for (const entry of entries) {
    const title = typeof entry.Name === 'string' ? entry.Name.trim() : ''
    const aumid = typeof entry.Aumid === 'string' ? entry.Aumid.trim() : ''
    if (!title || !aumid) {
      continue
    }
    if (IGNORED_NAME_PATTERN.test(title)) {
      continue
    }

    const titleKey = title.toLowerCase()
    if (existingTitles.has(titleKey)) {
      continue
    }
    existingTitles.add(titleKey)

    const appPath = `shell:AppsFolder\\${aumid}`
    const logoPath = typeof entry.LogoPath === 'string' ? entry.LogoPath.trim() : ''
    if (logoPath) {
      uwpIconSources.set(appPath.toLowerCase(), logoPath)
    }

    results.push({
      id: appPath,
      title,
      path: appPath
    })
  }

  return results
}

async function scanMacApplications(results: InstalledApp[], seen: Set<string>): Promise<void> {
  for (const directory of getScanDirectories()) {
    let entries: Dirent[]
    try {
      entries = await fsPromises.readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.name.endsWith('.app')) continue

      const entryPath = join(directory, entry.name)
      const isDirectory = entry.isDirectory()
      const isSymlinkToDirectory = entry.isSymbolicLink()
      if (!isDirectory && !isSymlinkToDirectory) continue

      pushApp(results, seen, entryPath, false)
    }
  }
}

async function scanInstalledApps(includeSystemApps: boolean): Promise<InstalledApp[]> {
  const results: InstalledApp[] = []
  const seen = new Set<string>()

  if (process.platform === 'darwin') {
    await scanMacApplications(results, seen)
  } else if (process.platform === 'win32') {
    for (const directory of getScanDirectories()) {
      await walkWindowsDirectory(directory, results, seen, 0, includeSystemApps, directory)
    }

    const existingTitles = new Set(results.map((installed) => installed.title.toLowerCase()))
    const storeApps = await scanWindowsStoreApps(existingTitles)
    results.push(...storeApps)
  }

  results.sort((a, b) => a.title.localeCompare(b.title))
  return results
}

function startScan(includeSystemApps: boolean): Promise<InstalledApp[]> {
  const generation = cacheGeneration
  const promise = scanInstalledApps(includeSystemApps)
    .then((apps) => {
      if (generation === cacheGeneration) {
        cachedApps = apps
        cachedIncludeSystemApps = includeSystemApps
      }
      if (scanPromise === promise) {
        scanPromise = null
      }
      return apps
    })
    .catch(() => {
      if (scanPromise === promise) {
        scanPromise = null
      }
      return []
    })

  scanPromise = promise
  scanPromiseIncludeSystemApps = includeSystemApps
  return promise
}

export function warmInstalledAppsCache(includeSystemApps = false): void {
  if (cachedApps && cachedIncludeSystemApps === includeSystemApps) {
    return
  }
  if (scanPromise) {
    return
  }

  void startScan(includeSystemApps)
}

export async function getInstalledApps(options: { includeSystemApps?: boolean } = {}): Promise<InstalledApp[]> {
  const includeSystemApps = options.includeSystemApps === true

  if (cachedApps && cachedIncludeSystemApps === includeSystemApps) {
    return cachedApps
  }

  if (scanPromise && scanPromiseIncludeSystemApps !== includeSystemApps) {
    // Wait for the in-flight scan to settle before rescanning with the
    // requested options.
    await scanPromise.catch(() => undefined)
  }

  if (scanPromise && scanPromiseIncludeSystemApps === includeSystemApps) {
    return scanPromise
  }

  return startScan(includeSystemApps)
}

// Invalidate the cached app index when the launcher filtering preference
// changes so the next request rescans with the new settings.
export function clearInstalledAppsCache(): void {
  cacheGeneration += 1
  cachedApps = null
  scanPromise = null
  uwpIconSources.clear()
}

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { windowsHide: true })
      let stdout = ''

      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      child.once('error', () => resolve(''))
      child.once('close', () => resolve(stdout.trim()))
    } catch {
      resolve('')
    }
  })
}

async function convertIcnsToDataUrl(icnsPath: string): Promise<string> {
  const outputPath = join(tmpdir(), `covenant-icon-${randomUUID()}.png`)

  try {
    await runCommand('sips', ['-s', 'format', 'png', '-Z', '128', icnsPath, '--out', outputPath])
    const image = nativeImage.createFromPath(outputPath)
    return image.isEmpty() ? '' : image.toDataURL()
  } catch {
    return ''
  } finally {
    void fsPromises.unlink(outputPath).catch(() => {
      // Non-fatal — the temp file may not have been created.
    })
  }
}

async function getMacAppIcon(appPath: string): Promise<string> {
  // 1. Quick Look thumbnail — single native call and handles modern apps that
  //    ship their icon inside an asset catalog (no .icns on disk).
  try {
    const thumbnail = await nativeImage.createThumbnailFromPath(appPath, {
      width: 128,
      height: 128
    })
    if (!thumbnail.isEmpty()) {
      return thumbnail.toDataURL()
    }
  } catch {
    // Fall through to the .icns extraction below.
  }

  // 2. Extract the exact icon referenced by the bundle's Info.plist.
  try {
    const infoPlist = join(appPath, 'Contents', 'Info.plist')
    const iconFile = await runCommand('plutil', [
      '-extract',
      'CFBundleIconFile',
      'raw',
      '-o',
      '-',
      infoPlist
    ])

    if (iconFile) {
      const icnsName = iconFile.toLowerCase().endsWith('.icns') ? iconFile : `${iconFile}.icns`
      const dataUrl = await convertIcnsToDataUrl(join(appPath, 'Contents', 'Resources', icnsName))
      if (dataUrl) {
        return dataUrl
      }
    }
  } catch {
    // Fall through — the caller renders an initials badge when no icon is found.
  }

  // NOTE: never use app.getFileIcon() on macOS. It returns a generic type icon
  // and, on recent Electron/macOS builds, hard-crashes the main process
  // (SIGTRAP). The initials badge is a safer fallback.
  return ''
}

// Internet shortcuts (.url) reference their icon through an IconFile= entry.
// Steam game shortcuts use this to point at a real .ico in the Steam folder,
// so resolving it yields the actual game icon instead of a generic link.
async function getWindowsUrlShortcutIcon(appPath: string): Promise<string> {
  try {
    const content = await fsPromises.readFile(appPath, 'utf-8')
    const match = content.match(/^\s*IconFile=(.+?)\s*$/im)
    if (!match) {
      return ''
    }

    const iconPath = match[1].trim().replace(/^"|"$/g, '')
    if (!iconPath) {
      return ''
    }

    const image = nativeImage.createFromPath(iconPath)
    return image.isEmpty() ? '' : image.toDataURL()
  } catch {
    return ''
  }
}

async function getWindowsAppIcon(appPath: string): Promise<string> {
  const storeIcon = uwpIconSources.get(appPath.toLowerCase())
  if (storeIcon) {
    try {
      const image = nativeImage.createFromPath(storeIcon)
      if (!image.isEmpty()) {
        return image.toDataURL()
      }
    } catch {
      // Fall through to the generic shortcut handling below.
    }
  }

  if (/\.url$/i.test(appPath)) {
    const urlIcon = await getWindowsUrlShortcutIcon(appPath)
    if (urlIcon) {
      return urlIcon
    }
  }

  let target = appPath

  if (/\.lnk$/i.test(appPath)) {
    try {
      const link = shell.readShortcutLink(appPath)
      if (link?.target) {
        target = link.target
      }
    } catch {
      // Not a valid shortcut — keep the original path.
    }
  }

  for (const candidate of [target, appPath]) {
    try {
      const image = await app.getFileIcon(candidate, { size: 'large' })
      if (!image.isEmpty()) {
        return image.toDataURL()
      }
    } catch {
      // Try the next candidate.
    }
  }

  return ''
}

export async function getAppIcon(filePath: string): Promise<string> {
  const normalizedPath = typeof filePath === 'string' ? filePath.trim() : ''
  if (!normalizedPath) return ''

  const cached = iconCache.get(normalizedPath)
  if (cached !== undefined) return cached

  let dataUrl = ''

  try {
    if (process.platform === 'darwin') {
      dataUrl = await getMacAppIcon(normalizedPath)
    } else if (process.platform === 'win32') {
      dataUrl = await getWindowsAppIcon(normalizedPath)
    } else {
      const image = await app.getFileIcon(normalizedPath, { size: 'large' })
      dataUrl = image.isEmpty() ? '' : image.toDataURL()
    }
  } catch {
    dataUrl = ''
  }

  iconCache.set(normalizedPath, dataUrl)
  return dataUrl
}
