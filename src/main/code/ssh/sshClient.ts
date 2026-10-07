import { Client, type ClientChannel, type ConnectConfig, type SFTPWrapper } from 'ssh2'
import { readFileSync } from 'fs'
import { log } from '../../logger'
import type { CodeConnection } from '../../../shared/code/connection'
import { getSshCredential, type SshCredential } from './sshCredentials'

export interface SshExecResult {
  code: number | null
  stdout: string
  stderr: string
}

export interface SshConnectResult {
  session: SshSession
  /** The host key fingerprint observed during the handshake. */
  hostKeyFingerprint?: string
}

const READY_TIMEOUT_MS = 20000

/**
 * A connected SSH session: command execution, SFTP and TCP port forwarding
 * over a single underlying transport.
 */
export class SshSession {
  private sftpWrapper?: SFTPWrapper
  private homeDir?: string
  private readonly execChannels = new Set<ClientChannel>()

  private constructor(readonly client: Client) {}

  static connect(connection: CodeConnection): Promise<SshConnectResult> {
    return new Promise((resolve, reject) => {
      const client = new Client()
      let observedFingerprint: string | undefined
      const expected = connection.hostKeyFingerprint

      const config: ConnectConfig = {
        host: connection.host,
        port: connection.port ?? 22,
        username: connection.username,
        readyTimeout: READY_TIMEOUT_MS,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
        hostHash: 'sha256',
        hostVerifier: (fingerprint: string): boolean => {
          observedFingerprint = fingerprint
          return expected ? expected === fingerprint : true
        }
      }

      const credential: SshCredential | undefined = getSshCredential(connection.id)
      try {
        SshSession.applyAuth(config, connection, credential)
      } catch (error) {
        reject(error)
        return
      }

      client.once('ready', () => {
        resolve({
          session: new SshSession(client),
          hostKeyFingerprint: observedFingerprint
        })
      })
      client.once('error', (error) => reject(error))
      client.connect(config)
    })
  }

  private static applyAuth(
    config: ConnectConfig,
    connection: CodeConnection,
    credential: SshCredential | undefined
  ): void {
    const method = connection.authMethod ?? 'password'
    if (method === 'password') {
      if (!credential?.password) {
        throw new Error('No saved password for this connection')
      }
      config.password = credential.password
      return
    }
    if (method === 'key') {
      if (!connection.privateKeyPath) {
        throw new Error('No private key configured for this connection')
      }
      try {
        config.privateKey = readFileSync(connection.privateKeyPath)
      } catch (error) {
        throw new Error(
          `Could not read private key at ${connection.privateKeyPath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
      if (credential?.passphrase) config.passphrase = credential.passphrase
      return
    }
    // Agent
    if (process.env.SSH_AUTH_SOCK) {
      config.agent = process.env.SSH_AUTH_SOCK
    } else if (process.platform === 'win32') {
      config.agent = 'pageant'
    } else {
      throw new Error('No SSH agent available')
    }
  }

  async getHome(): Promise<string> {
    if (this.homeDir) return this.homeDir
    const result = await this.exec('printf %s "$HOME"')
    this.homeDir = result.stdout.trim() || '.'
    return this.homeDir
  }

  exec(command: string, onData?: (chunk: string) => void): Promise<SshExecResult> {
    return new Promise((resolve, reject) => {
      this.client.exec(command, (error, stream) => {
        if (error) {
          reject(error)
          return
        }
        this.execChannels.add(stream)
        let stdout = ''
        let stderr = ''
        let code: number | null = null
        stream.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf-8')
          stdout += text
          onData?.(text)
        })
        stream.stderr.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf-8')
          stderr += text
          onData?.(text)
        })
        stream.on('exit', (exitCode: number | null) => {
          code = exitCode
        })
        stream.on('close', () => {
          this.execChannels.delete(stream)
          resolve({ code, stdout, stderr })
        })
        stream.on('error', (streamError: Error) => {
          this.execChannels.delete(stream)
          reject(streamError)
        })
      })
    })
  }

  /** Run a long-lived command and keep the channel open, streaming output. */
  spawn(command: string, onData: (chunk: string) => void): Promise<ClientChannel> {
    return new Promise((resolve, reject) => {
      this.client.exec(command, (error, stream) => {
        if (error) {
          reject(error)
          return
        }
        this.execChannels.add(stream)
        stream.on('data', (chunk: Buffer) => onData(chunk.toString('utf-8')))
        stream.stderr.on('data', (chunk: Buffer) => onData(chunk.toString('utf-8')))
        stream.on('close', () => this.execChannels.delete(stream))
        stream.on('error', (streamError: Error) => {
          this.execChannels.delete(stream)
          reject(streamError)
        })
        resolve(stream)
      })
    })
  }

  getSftp(): Promise<SFTPWrapper> {
    if (this.sftpWrapper) return Promise.resolve(this.sftpWrapper)
    return new Promise((resolve, reject) => {
      this.client.sftp((error, sftp) => {
        if (error) {
          reject(error)
          return
        }
        this.sftpWrapper = sftp
        resolve(sftp)
      })
    })
  }

  forwardOut(dstPort: number): Promise<ClientChannel> {
    return new Promise((resolve, reject) => {
      this.client.forwardOut('127.0.0.1', 0, '127.0.0.1', dstPort, (error, stream) => {
        if (error) {
          reject(error)
          return
        }
        resolve(stream)
      })
    })
  }

  end(): void {
    for (const channel of this.execChannels) {
      try {
        channel.close()
      } catch {
        // ignore
      }
    }
    this.execChannels.clear()
    try {
      this.sftpWrapper?.end()
    } catch {
      // ignore
    }
    this.sftpWrapper = undefined
    try {
      this.client.end()
    } catch (error) {
      log.warn('Failed to close SSH session', error)
    }
  }
}
