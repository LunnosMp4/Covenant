import { app, BrowserWindow, Notification } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { log } from './logger'
import type { UpdateStatus, UpdateStatusState } from '../shared/update'

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

export function setupAutoUpdater(getAutoUpdateEnabled: () => boolean): void {
  if (isSetup) return
  isSetup = true

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
  if (currentStatus.state !== 'downloaded') {
    focusApp()
    return
  }
  autoUpdater.quitAndInstall()
}

export function getAutoUpdaterState(): UpdateStatusState {
  return currentStatus.state
}
