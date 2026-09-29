import { app, Notification } from 'electron'
import { autoUpdater } from 'electron-updater'
import { log } from './logger'

let isSetup = false

export function setupAutoUpdater(getAutoUpdateEnabled: () => boolean): void {
  if (isSetup) return
  isSetup = true

  autoUpdater.autoDownload = true
  autoUpdater.logger = log as unknown as typeof autoUpdater.logger

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...')
  })

  autoUpdater.on('update-available', (info) => {
    log.info(`Update available: ${info.version}`)
  })

  autoUpdater.on('update-not-available', () => {
    log.info('Update not available.')
  })

  autoUpdater.on('download-progress', (progress) => {
    log.debug(`Update download: ${Math.round(progress.percent)}%`)
  })

  autoUpdater.on('error', (error) => {
    log.error('Auto-update error:', error)
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`Update downloaded: ${info.version}`)
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: 'Covenant update ready',
        body: `Version ${info.version} downloaded. Click to restart and install.`
      })
      notification.on('click', () => {
        autoUpdater.quitAndInstall()
      })
      notification.show()
    } else {
      autoUpdater.quitAndInstall()
    }
  })

  app.whenReady().then(() => {
    if (getAutoUpdateEnabled()) {
      setTimeout(() => {
        void autoUpdater.checkForUpdates().catch((error) => {
          log.error('Failed to check for updates:', error)
        })
      }, 10_000)
    }
  })
}

export function checkForUpdatesManually(): void {
  void autoUpdater.checkForUpdates().catch((error) => {
    log.error('Failed to check for updates:', error)
  })
}

export function quitAndInstallUpdate(): void {
  autoUpdater.quitAndInstall()
}