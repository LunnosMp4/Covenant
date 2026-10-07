import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { log } from '../../logger'

// SSH secrets (passwords, key passphrases) are encrypted at rest with the OS
// keychain via Electron `safeStorage` and never leave the main process. They
// are keyed by connection id in a single encrypted JSON blob, and are never
// part of `AppConfig` or returned over IPC.

export interface SshCredential {
  password?: string
  passphrase?: string
}

type CredentialMap = Record<string, SshCredential>

function credentialDir(): string {
  return join(app.getPath('userData'), 'code')
}

function credentialFile(): string {
  return join(credentialDir(), 'ssh.enc')
}

function isStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function readAll(): CredentialMap {
  try {
    if (!isStorageAvailable() || !existsSync(credentialFile())) return {}
    const decrypted = safeStorage.decryptString(readFileSync(credentialFile()))
    const parsed = JSON.parse(decrypted) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as CredentialMap
  } catch (error) {
    log.warn('Failed to read stored SSH credentials', error)
    return {}
  }
}

function writeAll(map: CredentialMap): void {
  if (!isStorageAvailable()) {
    throw new Error('Secure credential storage is not available on this system')
  }
  const dir = credentialDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(credentialFile(), safeStorage.encryptString(JSON.stringify(map)))
}

export function saveSshCredential(connectionId: string, credential: SshCredential): void {
  const id = typeof connectionId === 'string' ? connectionId.trim() : ''
  if (!id) throw new Error('A connection id is required')
  const map = readAll()
  const next: SshCredential = {}
  if (typeof credential?.password === 'string' && credential.password) {
    next.password = credential.password
  }
  if (typeof credential?.passphrase === 'string' && credential.passphrase) {
    next.passphrase = credential.passphrase
  }
  map[id] = next
  writeAll(map)
}

export function getSshCredential(connectionId: string | undefined): SshCredential | undefined {
  if (!connectionId) return undefined
  return readAll()[connectionId]
}

export function hasSshCredential(connectionId: string | undefined): boolean {
  const credential = getSshCredential(connectionId)
  return Boolean(credential && (credential.password || credential.passphrase))
}

export function clearSshCredential(connectionId: string): void {
  const map = readAll()
  if (!(connectionId in map)) return
  delete map[connectionId]
  writeAll(map)
}
