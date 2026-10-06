import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { log } from '../logger'
import { readConfig } from '../config/configStore'
import type { CodeSettings } from '../../shared/code/code'
import type { CodeEngineEvent } from './codeEngine'
import { LocalCodeEngine } from './localCodeEngine'
import { OpenCodeRuntime } from './opencodeRuntime'
import { clearGoApiKey, getGoApiKey, hasGoApiKey, saveGoApiKey } from './codeCredentials'

type CodeServiceListener = (event: CodeEngineEvent) => void

/**
 * Owns the OpenCode runtime + engine lifecycle and exposes a stable surface to
 * the IPC layer. Instantiated once in `whenReady`, disposed in `will-quit`.
 */
export class CodeService {
  private readonly runtime = new OpenCodeRuntime()
  private readonly engine = new LocalCodeEngine({
    runtime: this.runtime,
    getApiKey: () => getGoApiKey()
  })
  private readonly listeners = new Set<CodeServiceListener>()
  private crashListenerAttached = false

  init(): void {
    if (!this.crashListenerAttached) {
      this.crashListenerAttached = true
      this.runtime.on('crashed', () => {
        log.warn('OpenCode runtime crashed; it will restart on next use')
      })
    }
    this.engine.subscribe((event) => {
      for (const listener of this.listeners) {
        try {
          listener(event)
        } catch (error) {
          log.warn('Code service listener threw', error)
        }
      }
    })
    this.writeManagedConfig(readConfig().code)
  }

  subscribe(listener: CodeServiceListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getEngine(): LocalCodeEngine {
    return this.engine
  }

  getStatus() {
    const status = this.engine.getStatus()
    return { ...status, hasApiKey: hasGoApiKey() }
  }

  async ensureConnected(): Promise<void> {
    this.writeManagedConfig(readConfig().code)
    await this.engine.connect()
    if (!this.engine.isReady()) {
      throw new Error('OpenCode runtime did not become ready')
    }
  }

  async isConnectedOrConnect(): Promise<boolean> {
    if (this.engine.isReady()) return true
    try {
      await this.ensureConnected()
      return true
    } catch (error) {
      log.warn('OpenCode runtime unavailable', error)
      return false
    }
  }

  async setGoApiKey(key: string): Promise<void> {
    saveGoApiKey(key)
    await this.ensureConnected()
    await this.engine.connectProviderKey('opencode-go', key)
  }

  async clearGoApiKey(): Promise<void> {
    clearGoApiKey()
  }

  async testGoConnection(): Promise<boolean> {
    await this.ensureConnected()
    const integrations = await this.engine.listIntegrations()
    const target = integrations.find(
      (entry) => entry.id === 'opencode-go' || entry.id.startsWith('opencode-go-')
    )
    if (target) return target.connected
    // Fall back to a model listing as a liveness/authorship check.
    const models = await this.engine.listModels()
    return models.length > 0
  }

  /** Persist non-secret settings to the managed config. Takes effect on restart. */
  applySettings(code: CodeSettings): void {
    this.writeManagedConfig(code)
  }

  /** Restart the runtime so managed-config changes (e.g. permissions) apply. */
  async restart(): Promise<void> {
    await this.engine.dispose()
    await this.ensureConnected()
  }

  getLogs(): string[] {
    return this.runtime.getLogs()
  }

  async dispose(): Promise<void> {
    await this.engine.dispose()
  }

  private writeManagedConfig(code: CodeSettings): void {
    try {
      const configDir = join(app.getPath('userData'), 'code', 'opencode', 'config', 'opencode')
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true })
      }
      const config = {
        $schema: 'https://opencode.ai/config.json',
        autoupdate: false,
        share: 'disabled',
        permission: {
          edit: code.permission.edit,
          bash: code.permission.bash,
          external_directory: code.permission.external_directory,
          webfetch: code.permission.webfetch
        }
      }
      writeFileSync(join(configDir, 'opencode.json'), JSON.stringify(config, null, 2), 'utf-8')
    } catch (error) {
      log.warn('Failed to write managed OpenCode config', error)
    }
  }
}

let codeService: CodeService | null = null

export function getCodeService(): CodeService | null {
  return codeService
}

export function setCodeService(service: CodeService | null): void {
  codeService = service
}
