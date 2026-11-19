import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  decryptString: vi.fn(() => 'stored-key'),
  encryptString: vi.fn((value: string) => Buffer.from(`enc:${value}`)),
  isEncryptionAvailable: vi.fn(() => true),
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => Buffer.from('enc')),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/covenant-credential-test' },
  safeStorage: {
    isEncryptionAvailable: mocks.isEncryptionAvailable,
    decryptString: mocks.decryptString,
    encryptString: mocks.encryptString
  }
}))

vi.mock('fs', () => ({
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  mkdirSync: mocks.mkdirSync,
  rmSync: mocks.rmSync
}))

vi.mock('../logger', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

describe('codeCredentials', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.decryptString.mockClear()
    mocks.encryptString.mockClear()
  })

  it('decrypts the keychain credential once and reuses it', async () => {
    const { getGoApiKey } = await import('./codeCredentials')

    expect(getGoApiKey()).toBe('stored-key')
    expect(getGoApiKey()).toBe('stored-key')
    expect(getGoApiKey()).toBe('stored-key')
    expect(mocks.decryptString).toHaveBeenCalledTimes(1)
  })

  it('updates the cache on save and on clear', async () => {
    const { getGoApiKey, saveGoApiKey, clearGoApiKey } = await import('./codeCredentials')

    getGoApiKey()
    saveGoApiKey('saved-key')
    expect(getGoApiKey()).toBe('saved-key')

    clearGoApiKey()
    expect(getGoApiKey()).toBeUndefined()
  })
})
