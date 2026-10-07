import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { log } from '../logger'

// The OpenCode Go API key is the only secret Covenant Code persists. It is
// encrypted with the OS keychain via Electron `safeStorage` and never leaves
// the main process. It is never part of `AppConfig` and never returned by IPC.

function credentialDir(): string {
  return join(app.getPath('userData'), 'code')
}

function credentialFile(): string {
  return join(credentialDir(), 'auth.enc')
}

export function isGoKeyStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function saveGoApiKey(key: string): void {
  const trimmed = typeof key === 'string' ? key.trim() : ''
  if (!trimmed) {
    throw new Error('API key is required')
  }
  if (!isGoKeyStorageAvailable()) {
    throw new Error('Secure credential storage is not available on this system')
  }
  const dir = credentialDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const encrypted = safeStorage.encryptString(trimmed)
  writeFileSync(credentialFile(), encrypted)
}

export function getGoApiKey(): string | undefined {
  try {
    if (!isGoKeyStorageAvailable() || !existsSync(credentialFile())) return undefined
    const decrypted = safeStorage.decryptString(readFileSync(credentialFile()))
    return decrypted.trim() || undefined
  } catch (error) {
    log.warn('Failed to read stored OpenCode Go credential', error)
    return undefined
  }
}

export function hasGoApiKey(): boolean {
  return typeof getGoApiKey() === 'string'
}

export function clearGoApiKey(): void {
  try {
    rmSync(credentialFile(), { force: true })
  } catch (error) {
    log.warn('Failed to clear stored OpenCode Go credential', error)
  }
}
