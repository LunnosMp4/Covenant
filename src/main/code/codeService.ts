import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { log } from '../logger'
import { readConfig } from '../config/configStore'
import type { CodeRuntimeProgress, CodeSettings } from '../../shared/code/code'
import {
  DEFAULT_LOCAL_CONNECTION,
  type CodeConnection,
  type CodeConnectionStatus
} from '../../shared/code/connection'
import type { CodeEngineEvent } from './codeEngine'
import { LocalCodeEngine } from './localCodeEngine'
import type { CodeRuntime } from './codeRuntime'
import { OpenCodeRuntime } from './opencodeRuntime'
import { SshCodeRuntime } from './ssh/sshCodeRuntime'
import { disposeAllBrowseSessions } from './ssh/remoteBrowse'
import { buildManagedConfig } from './managedConfig'
import { clearGoApiKey, getGoApiKey, hasGoApiKey, saveGoApiKey } from './codeCredentials'
import {
  getActiveConnectionId,
  getCodeConnectionById,
  getCodeConnections,
  setActiveConnectionId
} from '../features/codeConnections'

type CodeServiceListener = (event: CodeEngineEvent) => void

interface ActiveConnection {
  id: string
  connection: CodeConnection
  runtime: CodeRuntime
  engine: LocalCodeEngine
  unsubscribe: () => void
}

/**
 * Owns the OpenCode runtime + engine for the single active connection and
 * exposes a stable surface to the IPC layer. Instantiated once in `whenReady`,
 * disposed in `will-quit`. Switching connections tears the previous runtime
 * down (local process / SSH tunnel) and brings up the new one lazily.
 */
export class CodeService {
  private active?: ActiveConnection
  private readonly listeners = new Set<CodeServiceListener>()

  init(): void {
    this.writeManagedConfig(readConfig().code)
    this.activate(getActiveConnectionId(), { connect: false })
  }

  private createRuntime(connection: CodeConnection): CodeRuntime {
    if (connection.kind === 'ssh') return new SshCodeRuntime(connection)
    return new OpenCodeRuntime()
  }

  private activate(connectionId: string, _options: { connect: boolean }): ActiveConnection {
    const connection = getCodeConnectionById(connectionId) ?? DEFAULT_LOCAL_CONNECTION
    if (this.active?.id === connection.id) return this.active

    void this.disposeActive()

    const runtime = this.createRuntime(connection)
    runtime.on('crashed', () => {
      log.warn(`OpenCode runtime crashed on ${connection.name}; it will restart on next use`)
    })
    runtime.on('progress', (progress: CodeRuntimeProgress) => {
      this.forward({ kind: 'progress', progress })
    })
    const engine = new LocalCodeEngine({ runtime, getApiKey: () => getGoApiKey() })
    const unsubscribe = engine.subscribe((event) => this.forward(event))
    const active: ActiveConnection = { id: connection.id, connection, runtime, engine, unsubscribe }
    this.active = active
    return active
  }

  private forward(event: CodeEngineEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        log.warn('Code service listener threw', error)
      }
    }
  }

  private requireActive(): ActiveConnection {
    if (!this.active) {
      return this.activate(getActiveConnectionId(), { connect: false })
    }
    return this.active
  }

  private async disposeActive(): Promise<void> {
    const current = this.active
    if (!current) return
    this.active = undefined
    current.unsubscribe()
    try {
      await current.engine.dispose()
    } catch (error) {
      log.warn('Failed to dispose OpenCode engine', error)
    }
  }

  subscribe(listener: CodeServiceListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getEngine(): LocalCodeEngine {
    return this.requireActive().engine
  }

  getActiveConnectionId(): string {
    return this.requireActive().id
  }

  getConnections(): CodeConnection[] {
    return getCodeConnections()
  }

  getStatus(): ReturnType<LocalCodeEngine['getStatus']> & {
    hasApiKey: boolean
    connectionId: string
    connectionKind: CodeConnection['kind']
    connectionName: string
  } {
    const active = this.requireActive()
    const status = active.engine.getStatus()
    return {
      ...status,
      hasApiKey: hasGoApiKey(),
      connectionId: active.id,
      connectionKind: active.connection.kind,
      connectionName: active.connection.name
    }
  }

  /** Activate a connection. Does not eagerly start its runtime. */
  async switchConnection(connectionId: string): Promise<void> {
    const target = getCodeConnectionById(connectionId) ?? DEFAULT_LOCAL_CONNECTION
    if (this.active?.id === target.id) return
    setActiveConnectionId(target.id)
    await this.disposeActive()
    this.activate(target.id, { connect: false })
  }

  async ensureConnected(): Promise<void> {
    const active = this.requireActive()
    const settings = readConfig().code
    this.writeManagedConfig(settings)
    await active.runtime.applySettings?.(settings)
    await active.engine.connect()
    if (!active.engine.isReady()) {
      throw new Error('OpenCode runtime did not become ready')
    }
  }

  async isConnectedOrConnect(): Promise<boolean> {
    if (this.requireActive().engine.isReady()) return true
    try {
      await this.ensureConnected()
      return true
    } catch (error) {
      log.warn('OpenCode runtime unavailable', error)
      return false
    }
  }

  /**
   * Probe a connection without activating it: start a throwaway runtime, read
   * its version, then tear it down. Used by the "Test connection" action.
   */
  async testConnection(connectionId: string): Promise<CodeConnectionStatus> {
    const connection = getCodeConnectionById(connectionId) ?? DEFAULT_LOCAL_CONNECTION
    const base: CodeConnectionStatus = {
      id: connection.id,
      kind: connection.kind,
      name: connection.name,
      connected: false,
      running: false,
      ready: false,
      installed: false
    }

    if (this.active?.id === connection.id) {
      try {
        await this.ensureConnected()
        const status = this.getStatus()
        return {
          ...base,
          connected: true,
          running: status.running,
          ready: status.ready,
          installed: status.installed,
          version: status.version
        }
      } catch (error) {
        return { ...base, error: error instanceof Error ? error.message : String(error) }
      }
    }

    const runtime = this.createRuntime(connection)
    try {
      const info = await runtime.start()
      return {
        ...base,
        connected: true,
        running: true,
        ready: true,
        installed: true,
        version: info.version
      }
    } catch (error) {
      return { ...base, error: error instanceof Error ? error.message : String(error) }
    } finally {
      try {
        await runtime.stop()
      } catch {
        // ignore
      }
    }
  }

  async setGoApiKey(key: string): Promise<void> {
    saveGoApiKey(key)
    await this.ensureConnected()
    await this.getEngine().connectProviderKey('opencode-go', key)
  }

  async clearGoApiKey(): Promise<void> {
    clearGoApiKey()
  }

  async testGoConnection(): Promise<boolean> {
    await this.ensureConnected()
    const integrations = await this.getEngine().listIntegrations()
    const target = integrations.find(
      (entry) => entry.id === 'opencode-go' || entry.id.startsWith('opencode-go-')
    )
    if (target) return target.connected
    // Fall back to a model listing as a liveness/authorship check.
    const models = await this.getEngine().listModels()
    return models.length > 0
  }

  /** Persist non-secret settings to the managed config. Takes effect on restart. */
  applySettings(code: CodeSettings): void {
    this.writeManagedConfig(code)
    void this.active?.runtime.applySettings?.(code)
  }

  /** Restart the runtime so managed-config changes (e.g. permissions) apply. */
  async restart(): Promise<void> {
    const id = this.requireActive().id
    await this.disposeActive()
    this.activate(id, { connect: true })
    await this.ensureConnected()
  }

  getLogs(): string[] {
    return this.active?.runtime.getLogs() ?? []
  }

  async dispose(): Promise<void> {
    await this.disposeActive()
    disposeAllBrowseSessions()
  }

  private writeManagedConfig(code: CodeSettings): void {
    try {
      const configDir = join(app.getPath('userData'), 'code', 'opencode', 'config', 'opencode')
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true })
      }
      writeFileSync(
        join(configDir, 'opencode.json'),
        JSON.stringify(buildManagedConfig(code), null, 2),
        'utf-8'
      )
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
