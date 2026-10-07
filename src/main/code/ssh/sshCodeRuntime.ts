import { EventEmitter } from 'events'
import { createServer, type Server } from 'net'
import { randomBytes } from 'crypto'
import type { ClientChannel, SFTPWrapper } from 'ssh2'
import { readConfig } from '../../config/configStore'
import { log } from '../../logger'
import { updateCodeConnection } from '../../features/codeConnections'
import { buildManagedConfig } from '../managedConfig'
import {
  expectedOpenCodeVersion,
  OPENCODE_PINNED_VERSION,
  type ResolvedBinary
} from '../opencodeBinary'
import { parseBinaryVersion } from '../version'
import type { CodeRuntime, RuntimeInfo } from '../codeRuntime'
import type { CodeRuntimePhase, CodeRuntimeProgress, CodeSettings } from '../../../shared/code/code'
import type { CodeConnection } from '../../../shared/code/connection'
import { SshSession } from './sshClient'
import { ensureLocalBinaryForTarget, remoteTargetFromUname } from './remoteBinary'
import { ensureRemoteDir, joinRemote, parentRemote, writeRemoteText } from './remoteFs'

const START_TIMEOUT_MS = 45000
const HEALTH_POLL_MS = 400
const MAX_LOG_LINES = 500

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Safely single-quote a value for a POSIX shell. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Runs an OpenCode server on a remote machine over SSH and exposes it through
 * a loopback TCP tunnel, so the rest of Covenant treats it exactly like the
 * local runtime.
 */
export class SshCodeRuntime extends EventEmitter implements CodeRuntime {
  private readonly connection: CodeConnection
  private session?: SshSession
  private info?: RuntimeInfo
  private logs: string[] = []
  private started = false
  private healthy = false
  private forwardErrorLogged = false
  private stopping = false
  private tunnelServer?: Server
  private remoteChannel?: ClientChannel
  private remotePort?: number
  private binaryPath?: string
  private configPath?: string
  private configDirs?: { config: string; data: string; state: string; cache: string; cwd: string }

  constructor(connection: CodeConnection) {
    super()
    this.connection = connection
  }

  getInfo(): RuntimeInfo | undefined {
    return this.info
  }

  isRunning(): boolean {
    return this.started && Boolean(this.tunnelServer?.listening)
  }

  getLogs(): string[] {
    return [...this.logs]
  }

  getResolvedBinary(): ResolvedBinary | undefined {
    return {
      path: this.binaryPath ?? `ssh://${this.connection.username}@${this.connection.host}`,
      source: 'ssh'
    }
  }

  private emitProgress(phase: CodeRuntimePhase, message: string, percent?: number | null): void {
    const progress: CodeRuntimeProgress = {
      connectionId: this.connection.id,
      connectionName: this.connection.name,
      phase,
      message,
      percent: percent ?? null,
      timestamp: Date.now()
    }
    this.emit('progress', progress)
  }

  private record = (text: string): void => {
    const trimmed = text.trimEnd()
    if (!trimmed) return
    for (const line of trimmed.split(/\r?\n/)) {
      this.logs.push(line)
    }
    if (this.logs.length > MAX_LOG_LINES) {
      this.logs.splice(0, this.logs.length - MAX_LOG_LINES)
    }
    log.info(`[opencode:ssh:${this.connection.name}] ${trimmed}`)
  }

  async applySettings(code: CodeSettings): Promise<void> {
    if (!this.session || !this.configPath) return
    try {
      const sftp = await this.session.getSftp()
      await ensureRemoteDir(sftp, parentRemote(this.configPath))
      await writeRemoteText(sftp, this.configPath, JSON.stringify(buildManagedConfig(code), null, 2))
    } catch (error) {
      log.warn('Failed to write remote OpenCode config', error)
    }
  }

  async start(port = 0): Promise<RuntimeInfo> {
    try {
      return await this.doStart(port)
    } catch (error) {
      this.emitProgress('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  private async doStart(port = 0): Promise<RuntimeInfo> {
    if (this.isRunning() && this.info) return this.info

    this.stopping = false
    this.logs = []
    // Drop any session left over from a previous (crashed) runtime before
    // reconnecting, so we do not leak SSH connections on repeated restarts.
    if (this.session) {
      try {
        this.session.end()
      } catch {
        // ignore
      }
      this.session = undefined
    }
    this.emitProgress('connecting', `Connecting to ${this.connection.name}…`)
    this.record(`Connecting to ${this.connection.username}@${this.connection.host}…`)

    const { session, hostKeyFingerprint } = await SshSession.connect(this.connection)
    this.session = session
    this.emitProgress('checking', `Checking OpenCode on ${this.connection.name}…`)

    if (hostKeyFingerprint && hostKeyFingerprint !== this.connection.hostKeyFingerprint) {
      try {
        updateCodeConnection(this.connection.id, { hostKeyFingerprint })
        this.connection.hostKeyFingerprint = hostKeyFingerprint
      } catch (error) {
        log.warn('Failed to pin SSH host key', error)
      }
    }

    const home = await session.getHome()
    const root = joinRemote(home, '.covenant', 'opencode')
    this.configDirs = {
      config: joinRemote(root, 'config'),
      data: joinRemote(root, 'data'),
      state: joinRemote(root, 'state'),
      cache: joinRemote(root, 'cache'),
      cwd: joinRemote(root, 'cwd')
    }
    this.configPath = joinRemote(this.configDirs.config, 'opencode', 'opencode.json')

    await this.prepareRemoteDirs(session)
    this.binaryPath = await this.resolveRemoteBinary(session, root)

    const username = 'opencode'
    const password = randomBytes(24).toString('base64url')
    this.remotePort = port > 0 ? port : await this.findRemotePort(session)

    await this.writeConfig(session, readConfig().code)

    this.healthy = false
    this.forwardErrorLogged = false
    this.emitProgress('starting', `Starting OpenCode on ${this.connection.name}…`)
    this.remoteChannel = await session.spawn(
      this.buildServeCommand(username, password, this.remotePort),
      this.record
    )
    this.remoteChannel.on('close', () => {
      if (this.stopping) return
      // The remote server died: tear the tunnel down so `isRunning()` goes
      // false and the engine reconnects instead of hammering a dead port.
      this.started = false
      this.healthy = false
      this.info = undefined
      void this.closeTunnel()
      this.emit('crashed', { reason: 'remote process exited' })
    })
    this.remoteChannel.on('error', (error: Error) => {
      log.error('Remote OpenCode channel error', error)
    })

    const localPort = await this.openTunnel(session, this.remotePort)
    this.started = true

    const baseUrl = `http://127.0.0.1:${localPort}`
    this.emitProgress('waiting', 'Waiting for OpenCode to respond…')
    await this.waitForHealth(baseUrl, username, password)
    this.healthy = true

    const version = await this.readRemoteVersion(session).catch(() => undefined)

    this.info = {
      baseUrl,
      username,
      password,
      version,
      binaryPath: this.binaryPath
    }
    this.emitProgress('ready', `OpenCode ${version ? `v${version} ` : ''}is ready`)
    this.record(`Remote OpenCode ready at ${baseUrl} (v${version ?? 'unknown'})`)
    return this.info
  }

  private buildServeCommand(username: string, password: string, port: number): string {
    const dirs = this.configDirs!
    const env = [
      `OPENCODE_SERVER_USERNAME=${shellQuote(username)}`,
      `OPENCODE_SERVER_PASSWORD=${shellQuote(password)}`,
      `XDG_CONFIG_HOME=${shellQuote(dirs.config)}`,
      `XDG_DATA_HOME=${shellQuote(dirs.data)}`,
      `XDG_STATE_HOME=${shellQuote(dirs.state)}`,
      `XDG_CACHE_HOME=${shellQuote(dirs.cache)}`
    ].join(' ')
    return `cd ${shellQuote(dirs.cwd)} && ${env} exec ${shellQuote(this.binaryPath!)} serve --hostname 127.0.0.1 --port ${port}`
  }

  private async prepareRemoteDirs(session: SshSession): Promise<void> {
    const dirs = this.configDirs!
    const targets = [dirs.config, dirs.data, dirs.state, dirs.cache, dirs.cwd]
    await session.exec(`mkdir -p ${targets.map(shellQuote).join(' ')}`)
  }

  private async writeConfig(session: SshSession, code: CodeSettings): Promise<void> {
    const sftp = await session.getSftp()
    await ensureRemoteDir(sftp, parentRemote(this.configPath!))
    await writeRemoteText(sftp, this.configPath!, JSON.stringify(buildManagedConfig(code), null, 2))
  }

  private async resolveRemoteBinary(session: SshSession, root: string): Promise<string> {
    const expected = expectedOpenCodeVersion()
    const managedBinary = joinRemote(root, OPENCODE_PINNED_VERSION, 'opencode')

    // 1. A binary Covenant previously provisioned for this exact build.
    if (await this.remoteFileExists(session, managedBinary)) {
      const version = await this.remoteVersion(session, managedBinary)
      if (version === expected) {
        this.record(`Using provisioned OpenCode v${version} at ${managedBinary}`)
        return managedBinary
      }
    }

    // 2. A system binary, but only when it matches the version this app speaks.
    for (const candidate of await this.findSystemBinaries(session)) {
      const version = await this.remoteVersion(session, candidate)
      if (version === expected) {
        this.record(`Using existing OpenCode v${version} at ${candidate}`)
        return candidate
      }
      this.record(
        `Ignoring incompatible OpenCode ${version ? `v${version}` : 'unknown'} at ${candidate} ` +
          `(this app requires v${expected})`
      )
    }

    // 3. Provision the pinned, version-matched build.
    const uname = await session.exec('uname -s && uname -m')
    const [os, machine] = uname.stdout.trim().split(/\s+/)
    const target = remoteTargetFromUname(os ?? '', machine ?? '')
    if (!target) {
      throw new Error(
        `Unsupported remote platform (${os ?? '?'} ${machine ?? '?'}). Install OpenCode v${expected} manually on the machine.`
      )
    }

    this.record(`Provisioning OpenCode v${expected} (${target}) on the remote machine…`)
    this.emitProgress('downloading', `Downloading OpenCode ${expected} for ${target}…`)
    const localBinary = await ensureLocalBinaryForTarget(target, this.record, (received, total) => {
      if (total > 0) {
        this.emitProgress('downloading', `Downloading OpenCode ${expected}…`, received / total)
      }
    })
    await session.exec(`mkdir -p ${shellQuote(parentRemote(managedBinary))}`)

    this.emitProgress('uploading', `Installing OpenCode on ${this.connection.name}…`)
    const sftp = await session.getSftp()
    await new Promise<void>((resolve, reject) => {
      sftp.fastPut(localBinary, managedBinary, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    await session.exec(`chmod 755 ${shellQuote(managedBinary)}`)

    const uploaded = await this.remoteVersion(session, managedBinary)
    if (uploaded && uploaded !== expected) {
      throw new Error(`Provisioned OpenCode v${uploaded} does not match expected v${expected}`)
    }
    this.record(`Uploaded OpenCode v${uploaded ?? expected} to ${managedBinary}`)
    return managedBinary
  }

  private async remoteFileExists(session: SshSession, path: string): Promise<boolean> {
    const result = await session.exec(`[ -f ${shellQuote(path)} ] && printf yes || true`)
    return result.stdout.trim() === 'yes'
  }

  private async findSystemBinaries(session: SshSession): Promise<string[]> {
    const result = await session.exec(
      'command -v opencode || true; ' +
        'test -x "$HOME/.opencode/bin/opencode" && printf "%s\\n" "$HOME/.opencode/bin/opencode" || true'
    )
    const paths = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    return [...new Set(paths)]
  }

  private async remoteVersion(session: SshSession, binaryPath: string): Promise<string | undefined> {
    try {
      const result = await session.exec(`${shellQuote(binaryPath)} --version`)
      return parseBinaryVersion(result.stdout)
    } catch {
      return undefined
    }
  }

  private async readRemoteVersion(session: SshSession): Promise<string | undefined> {
    if (!this.binaryPath) return undefined
    return this.remoteVersion(session, this.binaryPath)
  }

  private async findRemotePort(session: SshSession): Promise<number> {
    try {
      const script =
        'for p in $(seq 37600 37850); do (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null && exec 3<&- || { echo $p; break; }; done'
      const result = await session.exec(`bash -lc ${shellQuote(script)}`)
      const parsed = Number.parseInt(result.stdout.trim(), 10)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    } catch {
      // fall through
    }
    return 37700 + Math.floor(Math.random() * 150)
  }

  private openTunnel(session: SshSession, remotePort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer((socket) => {
        session
          .forwardOut(remotePort)
          .then((stream) => {
            socket.pipe(stream)
            stream.pipe(socket)
            socket.on('error', () => stream.destroy())
            stream.on('error', () => socket.destroy())
            socket.on('close', () => stream.destroy())
          })
          .catch((error: Error) => {
            if (this.healthy) {
              log.warn('SSH tunnel forward failed', error)
            } else if (!this.forwardErrorLogged) {
              // Expected while the remote server is still binding; log once.
              this.forwardErrorLogged = true
              log.info(
                `SSH tunnel not reachable yet on ${this.connection.name}: ${error.message}`
              )
            }
            socket.destroy()
          })
      })
      this.tunnelServer = server
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address && typeof address === 'object') {
          resolve(address.port)
        } else {
          reject(new Error('Could not allocate a local tunnel port'))
        }
      })
    })
  }

  private async closeTunnel(): Promise<void> {
    const server = this.tunnelServer
    this.tunnelServer = undefined
    if (!server) return
    try {
      ;(server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.()
    } catch {
      // ignore
    }
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private async waitForHealth(baseUrl: string, username: string, password: string): Promise<void> {
    const expected = expectedOpenCodeVersion()
    const deadline = Date.now() + START_TIMEOUT_MS
    const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
    while (Date.now() < deadline) {
      if (!this.isRunning()) {
        throw new Error('Remote OpenCode runtime exited during startup')
      }
      try {
        const response = await fetch(`${baseUrl}/api/info`, {
          headers: { authorization },
          signal: AbortSignal.timeout(2000)
        })
        if (response.ok) {
          const info = (await response.json().catch(() => undefined)) as { version?: string } | undefined
          const version = parseBinaryVersion(info?.version)
          if (version && version !== expected) {
            throw new Error(
              `The OpenCode server on ${this.connection.name} is v${version}, but this app requires ` +
                `v${expected}. Remove the machine and add it again so Covenant can provision the right build.`
            )
          }
          return
        }
      } catch (error) {
        // Re-throw real compatibility errors immediately; swallow connect races.
        if (error instanceof Error && error.message.includes('this app requires')) throw error
      }
      await delay(HEALTH_POLL_MS)
    }
    const tail = this.logs.slice(-8).join('\n')
    throw new Error(
      `Timed out waiting for the remote OpenCode runtime to become ready${tail ? `\n${tail}` : ''}`
    )
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.started = false
    this.healthy = false
    this.info = undefined

    await this.closeTunnel()

    try {
      this.remoteChannel?.close()
    } catch {
      // ignore
    }
    this.remoteChannel = undefined

    const session = this.session
    const binaryPath = this.binaryPath
    const remotePort = this.remotePort
    this.session = undefined
    if (session) {
      const patterns = [
        remotePort ? `opencode serve --hostname 127.0.0.1 --port ${remotePort}` : undefined,
        binaryPath ? `${binaryPath} serve` : undefined
      ].filter((pattern): pattern is string => Boolean(pattern))
      for (const pattern of patterns) {
        try {
          await session.exec(`pkill -f ${shellQuote(pattern)} || true`)
        } catch {
          // ignore
        }
      }
    }
    session?.end()
    this.binaryPath = undefined
    this.remotePort = undefined
  }
}
