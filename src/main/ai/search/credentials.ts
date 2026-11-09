import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { log } from '../../logger'

function credentialDir(): string {
  return join(app.getPath('userData'), 'ai')
}

function credentialFile(providerId: string): string {
  const safeId = providerId.replace(/[^a-z0-9_-]/gi, '_')
  return join(credentialDir(), `search-${safeId}.enc`)
}

function isStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function saveSearchSecret(providerId: string, secret: string): void {
  const trimmed = typeof secret === 'string' ? secret.trim() : ''
  if (!trimmed) throw new Error('Search credential is required')
  if (!isStorageAvailable()) throw new Error('Secure credential storage is not available on this system')
  const dir = credentialDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(credentialFile(providerId), safeStorage.encryptString(trimmed))
}

export function getSearchSecret(providerId: string): string | undefined {
  try {
    const file = credentialFile(providerId)
    if (!isStorageAvailable() || !existsSync(file)) return undefined
    const decrypted = safeStorage.decryptString(readFileSync(file))
    return decrypted.trim() || undefined
  } catch (error) {
    log.warn(`Failed to read search credential for ${providerId}`, error)
    return undefined
  }
}

export function hasSearchSecret(providerId: string): boolean {
  return typeof getSearchSecret(providerId) === 'string'
}

export function clearSearchSecret(providerId: string): void {
  try {
    rmSync(credentialFile(providerId), { force: true })
  } catch (error) {
    log.warn(`Failed to clear search credential for ${providerId}`, error)
  }
}
