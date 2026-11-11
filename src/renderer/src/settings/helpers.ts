import type { UpdateStatus } from '../../../shared/system/update'

export function formatUpdateBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, exponent)
  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export function getUpdateStatusLabel(status: UpdateStatus): string {
  switch (status.state) {
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return status.downloadUrl
        ? `Version ${status.version ?? ''} is available. Download the installer to update.`
        : `Version ${status.version ?? ''} found. Downloading…`
    case 'downloading':
      return `Downloading version ${status.version ?? ''}…`
    case 'downloaded':
      return `Version ${status.version ?? ''} is ready. Restart to finish installing.`
    case 'not-available':
      return 'You are on the latest version.'
    case 'error':
      return `Update check failed${status.error ? `: ${status.error}` : '.'}`
    default:
      return 'No update check has run yet.'
  }
}
