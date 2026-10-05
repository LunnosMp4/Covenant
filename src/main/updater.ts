import { app, BrowserWindow, Notification, shell } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { log } from './logger'
import type { UpdateStatus } from '../shared/system/update'

const isMac = process.platform === 'darwin'
const RELEASE_API_URL = 'https://api.github.com/repos/LunnosMp4/Covenant/releases/latest'
const RELEASE_PAGE_URL = 'https://github.com/LunnosMp4/Covenant/releases/latest'

let isSetup = false

function createInitialStatus(): UpdateStatus {
  return {
    state: 'idle',
    currentVersion: app.getVersion()
  }
}

let currentStatus: UpdateStatus = createInitialStatus()

function broadcastUpdateStatus(): void {
  const payload: UpdateStatus = { ...currentStatus, currentVersion: app.getVersion() }

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send('update-status', payload)
  }
}

function setUpdateStatus(patch: Partial<UpdateStatus>): void {
  currentStatus = { ...currentStatus, ...patch }
  broadcastUpdateStatus()
}

export function getUpdateStatus(): UpdateStatus {
  return { ...currentStatus, currentVersion: app.getVersion() }
}

function focusApp(): void {
  const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function showNotification(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported()) return

  const notification = new Notification({ title, body })
  if (onClick) {
    notification.on('click', onClick)
  }
  notification.show()
}

function parseVersionParts(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((part) => {
      const value = Number.parseInt(part, 10)
      return Number.isFinite(value) ? value : 0
    })
}

function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = parseVersionParts(candidate)
  const currentParts = parseVersionParts(current)
  const length = Math.max(candidateParts.length, currentParts.length)

  for (let index = 0; index < length; index += 1) {
    const candidatePart = candidateParts[index] ?? 0
    const currentPart = currentParts[index] ?? 0
    if (candidatePart > currentPart) return true
    if (candidatePart < currentPart) return false
  }

  return false
}

interface GitHubRelease {
  tag_name?: unknown
  html_url?: unknown
  name?: unknown
}

/**
 * macOS auto-update requires a paid Developer ID signature, so instead of
 * silently downloading we check GitHub Releases and point the user at the
 * download page. Windows keeps the full electron-updater flow below.
 */
async function checkForUpdatesOnMac(): Promise<void> {
  setUpdateStatus({ state: 'checking', error: undefined, checkedAt: Date.now() })

  try {
    const response = await fetch(RELEASE_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Covenant-Updater'
      }
    })

    if (!response.ok) {
      throw new Error(`GitHub responded with ${response.status}`)
    }

    const release = (await response.json()) as GitHubRelease
    const tag = typeof release.tag_name === 'string' ? release.tag_name.trim() : ''
    const version = tag.replace(/^v/i, '')
    const downloadUrl =
      typeof release.html_url === 'string' && release.html_url.trim()
        ? release.html_url.trim()
        : RELEASE_PAGE_URL

    if (!version || !isNewerVersion(version, app.getVersion())) {
      log.info('Update not available.')
      setUpdateStatus({ state: 'not-available', version: undefined, percent: undefined, error: undefined, checkedAt: Date.now() })
      return
    }

    log.info(`Update available: ${version}`)
    setUpdateStatus({
      state: 'available',
      version,
      percent: undefined,
      downloadUrl,
      error: undefined,
      checkedAt: Date.now()
    })

    showNotification(
      'Covenant update available',
      `Version ${version} is available. Click to open the download page.`,
      () => {
        void shell.openExternal(downloadUrl)
      }
    )
  } catch (error) {
    log.error('Failed to check for updates:', error)
    setUpdateStatus({
      state: 'error',
      error: error instanceof Error ? error.message : String(error),
      checkedAt: Date.now()
    })
  }
}

export function setupAutoUpdater(getAutoUpdateEnabled: () => boolean): void {
  if (isSetup) return
  isSetup = true

  if (isMac) {
    app.whenReady().then(() => {
      if (getAutoUpdateEnabled()) {
        setTimeout(() => {
          void checkForUpdatesOnMac()
        }, 10_000)
      }
    })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.logger = log as unknown as typeof autoUpdater.logger

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...')
    setUpdateStatus({ state: 'checking', error: undefined, checkedAt: Date.now() })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info(`Update available: ${info.version}`)
    setUpdateStatus({ state: 'available', version: info.version, percent: 0, error: undefined, checkedAt: Date.now() })
    showNotification(
      'Covenant update available',
      `Version ${info.version} is available and downloading in the background.`,
      focusApp
    )
  })

  autoUpdater.on('update-not-available', () => {
    log.info('Update not available.')
    setUpdateStatus({ state: 'not-available', percent: undefined, error: undefined, checkedAt: Date.now() })
  })

  autoUpdater.on('download-progress', (progress) => {
    log.debug(`Update download: ${Math.round(progress.percent)}%`)
    setUpdateStatus({
      state: 'downloading',
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('error', (error) => {
    log.error('Auto-update error:', error)
    setUpdateStatus({
      state: 'error',
      error: error instanceof Error ? error.message : String(error),
      checkedAt: Date.now()
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info(`Update downloaded: ${info.version}`)
    setUpdateStatus({ state: 'downloaded', version: info.version, percent: 100, error: undefined, checkedAt: Date.now() })
    showNotification(
      'Covenant update ready',
      `Version ${info.version} downloaded. Click to restart and install.`,
      () => {
        quitAndInstallUpdate()
      }
    )
  })

  app.whenReady().then(() => {
    if (getAutoUpdateEnabled()) {
      setTimeout(() => {
        void autoUpdater.checkForUpdates().catch((error) => {
          log.error('Failed to check for updates:', error)
          setUpdateStatus({
            state: 'error',
            error: error instanceof Error ? error.message : String(error),
            checkedAt: Date.now()
          })
        })
      }, 10_000)
    }
  })
}

export function checkForUpdatesManually(): void {
  if (isMac) {
    void checkForUpdatesOnMac()
    return
  }

  setUpdateStatus({ state: 'checking', error: undefined, checkedAt: Date.now() })
  void autoUpdater.checkForUpdates().catch((error) => {
    log.error('Failed to check for updates:', error)
    setUpdateStatus({
      state: 'error',
      error: error instanceof Error ? error.message : String(error),
      checkedAt: Date.now()
    })
  })
}

export function quitAndInstallUpdate(): void {
  if (isMac) {
    const downloadUrl =
      (currentStatus.state === 'available' && currentStatus.downloadUrl) || RELEASE_PAGE_URL
    void shell.openExternal(downloadUrl)
    focusApp()
    return
  }

  if (currentStatus.state !== 'downloaded') {
    focusApp()
    return
  }
  autoUpdater.quitAndInstall()
}
