import { app, shell } from 'electron'
import log from 'electron-log/main'

let initialized = false

export function setupLogger(): void {
  if (initialized) return
  initialized = true

  log.initialize()
  log.transports.file.level = 'info'
  log.transports.console.level = 'debug'

  process.on('uncaughtException', (error) => {
    log.error('Uncaught exception:', error)
  })

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection:', reason)
  })

  log.info(`Covenant starting (version ${app.getVersion()})`)
}

export function getLogFilePath(): string {
  try {
    const file = log.transports.file.getFile()
    return file?.path ?? ''
  } catch {
    return ''
  }
}

export function openLogsFolder(): void {
  const filePath = getLogFilePath()
  if (!filePath) return

  const logsDirectory = filePath.replace(/[\\/][^\\/]+$/, '')
  void shell.openPath(logsDirectory).catch(() => {
    // Ignore failures to open the folder.
  })
}

export { log }