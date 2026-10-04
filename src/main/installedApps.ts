import { app, nativeImage, shell } from 'electron'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { promises as fsPromises, type Dirent } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import type { InstalledApp } from '../shared/launcher'

const APP_EXTENSION_PATTERN = /\.(app|lnk|exe|url)$/i
const IGNORED_NAME_PATTERN = /^(uninstall|remove|readme|help)\b/i

let cachedApps: InstalledApp[] | null = null
let scanPromise: Promise<InstalledApp[]> | null = null
const iconCache = new Map<string, string>()

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

function pushApp(results: InstalledApp[], seen: Set<string>, filePath: string): void {
  const title = deriveTitle(filePath)
  if (!title || title.startsWith('.') || IGNORED_NAME_PATTERN.test(title)) {
    return
  }

  const key = `${title.toLowerCase()}\u0000${filePath.toLowerCase()}`
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

async function walkWindowsDirectory(
  directory: string,
  results: InstalledApp[],
  seen: Set<string>,
  depth: number
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
      await walkWindowsDirectory(entryPath, results, seen, depth + 1)
    } else if (entry.isFile() && /\.(lnk|url)$/i.test(entry.name)) {
      pushApp(results, seen, entryPath)
    }
  }
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

      pushApp(results, seen, entryPath)
    }
  }
}

async function scanInstalledApps(): Promise<InstalledApp[]> {
  const results: InstalledApp[] = []
  const seen = new Set<string>()

  if (process.platform === 'darwin') {
    await scanMacApplications(results, seen)
  } else if (process.platform === 'win32') {
    for (const directory of getScanDirectories()) {
      await walkWindowsDirectory(directory, results, seen, 0)
    }
  }

  results.sort((a, b) => a.title.localeCompare(b.title))
  return results
}

export function warmInstalledAppsCache(): void {
  if (!cachedApps && !scanPromise) {
    scanPromise = scanInstalledApps()
      .then((apps) => {
        cachedApps = apps
        scanPromise = null
        return apps
      })
      .catch(() => {
        scanPromise = null
        cachedApps = []
        return cachedApps
      })
  }
}

export async function getInstalledApps(): Promise<InstalledApp[]> {
  if (cachedApps) {
    return cachedApps
  }

  if (!scanPromise) {
    scanPromise = scanInstalledApps()
      .then((apps) => {
        cachedApps = apps
        scanPromise = null
        return apps
      })
      .catch(() => {
        scanPromise = null
        return []
      })
  }

  return scanPromise
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

async function getWindowsAppIcon(appPath: string): Promise<string> {
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
