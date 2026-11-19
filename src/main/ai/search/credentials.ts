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

/**
 * Decrypting via the OS keychain is synchronous and relatively expensive, and
 * the same provider secret is read on every search request. Cache the decrypted
 * value per provider and invalidate it on save/clear.
 */
const secretCache = new Map<string, string | undefined>()

export function saveSearchSecret(providerId: string, secret: string): void {
  const trimmed = typeof secret === 'string' ? secret.trim() : ''
  if (!trimmed) throw new Error('Search credential is required')
  if (!isStorageAvailable()) throw new Error('Secure credential storage is not available on this system')
  const dir = credentialDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(credentialFile(providerId), safeStorage.encryptString(trimmed))
  secretCache.set(providerId, trimmed)
}

export function getSearchSecret(providerId: string): string | undefined {
  if (secretCache.has(providerId)) return secretCache.get(providerId)
  // A transient keychain failure must not be cached as "no secret".
  if (!isStorageAvailable()) return undefined
  try {
    const file = credentialFile(providerId)
    if (!existsSync(file)) {
      secretCache.set(providerId, undefined)
      return undefined
    }
    const decrypted = safeStorage.decryptString(readFileSync(file))
    const value = decrypted.trim() || undefined
    secretCache.set(providerId, value)
    return value
  } catch (error) {
    log.warn(`Failed to read search credential for ${providerId}`, error)
    return undefined
  }
}

export function clearSearchSecret(providerId: string): void {
  secretCache.set(providerId, undefined)
  try {
    rmSync(credentialFile(providerId), { force: true })
  } catch (error) {
    log.warn(`Failed to clear search credential for ${providerId}`, error)
  }
}
