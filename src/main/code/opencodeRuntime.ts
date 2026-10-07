import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { randomBytes } from 'crypto'
import { createServer } from 'net'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { EventEmitter } from 'events'
import { log } from '../logger'
import { readBinaryVersion, resolveOpenCodeBinary, type ResolvedBinary } from './opencodeBinary'
import type { CodeRuntime, RuntimeInfo } from './codeRuntime'

export type { RuntimeInfo } from './codeRuntime'

const START_TIMEOUT_MS = 20000
const HEALTH_POLL_MS = 300
const MAX_LOG_LINES = 500

function base64Credentials(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => (port ? resolve(port) : reject(new Error('Could not allocate a port'))))
    })
  })
}

export class OpenCodeRuntime extends EventEmitter implements CodeRuntime {
  private child?: ChildProcessWithoutNullStreams
  private info?: RuntimeInfo
  private logs: string[] = []
  private stopping = false

  getInfo(): RuntimeInfo | undefined {
    return this.info
  }

  isRunning(): boolean {
    return Boolean(this.child && this.child.exitCode === null && !this.child.killed)
  }

  getLogs(): string[] {
    return [...this.logs]
  }

  getResolvedBinary(): ResolvedBinary | undefined {
    return resolveOpenCodeBinary()
  }

  async start(port = 0): Promise<RuntimeInfo> {
    if (this.isRunning() && this.info) {
      return this.info
    }

    const resolved = resolveOpenCodeBinary()
    if (!resolved) {
      throw new Error(
        'OpenCode runtime binary not found. Run `npm run prepare:opencode-cli` or set COVENANT_OPENCODE_BIN.'
      )
    }

    const selectedPort = port > 0 ? port : await findFreePort()
    const password = randomBytes(24).toString('base64url')
    const username = 'opencode'

    const root = join(app.getPath('userData'), 'code', 'opencode')
    const dirs = {
      config: join(root, 'config'),
      data: join(root, 'data'),
      state: join(root, 'state'),
      cache: join(root, 'cache'),
      cwd: join(root, 'cwd')
    }
    for (const dir of Object.values(dirs)) {
      mkdirSync(dir, { recursive: true })
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      OPENCODE_SERVER_PASSWORD: password,
      OPENCODE_SERVER_USERNAME: username,
      XDG_CONFIG_HOME: dirs.config,
      XDG_DATA_HOME: dirs.data,
      XDG_STATE_HOME: dirs.state,
      XDG_CACHE_HOME: dirs.cache
    }

    this.stopping = false
    const child = spawn(
      resolved.path,
      ['serve', '--hostname', '127.0.0.1', '--port', String(selectedPort)],
      { cwd: dirs.cwd, env, windowsHide: true }
    ) as ChildProcessWithoutNullStreams
    this.child = child

    const record = (chunk: Buffer): void => {
      const text = chunk.toString('utf-8').trimEnd()
      if (!text) return
      for (const line of text.split(/\r?\n/)) {
        this.logs.push(line)
      }
      if (this.logs.length > MAX_LOG_LINES) {
        this.logs.splice(0, this.logs.length - MAX_LOG_LINES)
      }
      log.info(`[opencode] ${text}`)
    }
    child.stdout.on('data', record)
    child.stderr.on('data', record)
    child.on('error', (error) => {
      log.error('OpenCode runtime process error', error)
      this.emit('error', error)
    })
    child.on('exit', (code, signal) => {
      this.child = undefined
      this.info = undefined
      log.info(`OpenCode runtime exited (code=${code ?? 'null'} signal=${signal ?? 'null'})`)
      if (!this.stopping) {
        this.emit('crashed', { code, signal })
      }
      this.emit('exit', { code, signal })
    })

    const baseUrl = `http://127.0.0.1:${selectedPort}`
    const version = readBinaryVersion(resolved.path)
    await this.waitForHealth(baseUrl, username, password)

    this.info = {
      baseUrl,
      username,
      password,
      pid: child.pid,
      version,
      binaryPath: resolved.path
    }
    log.info(`OpenCode runtime ready at ${baseUrl} (v${version ?? 'unknown'})`)
    return this.info
  }

  private async waitForHealth(baseUrl: string, username: string, password: string): Promise<void> {
    const deadline = Date.now() + START_TIMEOUT_MS
    const authorization = base64Credentials(username, password)
    while (Date.now() < deadline) {
      if (!this.isRunning()) {
        throw new Error('OpenCode runtime exited during startup')
      }
      try {
        const response = await fetch(`${baseUrl}/api/info`, {
          headers: { authorization },
          signal: AbortSignal.timeout(2000)
        })
        if (response.ok) return
      } catch {
        // not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_MS))
    }
    throw new Error('Timed out waiting for the OpenCode runtime to become ready')
  }

  async stop(): Promise<void> {
    const child = this.child
    this.stopping = true
    this.child = undefined
    this.info = undefined
    if (!child || child.exitCode !== null) return

    await new Promise<void>((resolve) => {
      const done = (): void => resolve()
      child.once('exit', done)
      try {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
        } else {
          child.kill('SIGTERM')
        }
      } catch {
        resolve()
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // ignore
        }
        resolve()
      }, 5000)
    })
  }
}
