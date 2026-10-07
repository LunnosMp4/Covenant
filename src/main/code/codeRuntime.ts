import { EventEmitter } from 'events'
import type { ResolvedBinary } from './opencodeBinary'
import type { CodeSettings } from '../../shared/code/code'

/**
 * Everything an OpenCode server exposes once it is reachable: the HTTP origin
 * and the Basic-auth credentials used to talk to it. For a local runtime this
 * is `http://127.0.0.1:<port>`; for an SSH runtime it is a loopback tunnel to
 * the remote server.
 */
export interface RuntimeInfo {
  baseUrl: string
  username: string
  password: string
  pid?: number
  version?: string
  binaryPath?: string
}

/**
 * Transport seam below the engine. `LocalCodeEngine` only depends on this, so
 * a runtime that starts OpenCode on a remote host over SSH can be swapped in
 * without touching any session/streaming logic.
 */
export interface CodeRuntime extends EventEmitter {
  start(port?: number): Promise<RuntimeInfo>
  stop(): Promise<void>
  isRunning(): boolean
  getInfo(): RuntimeInfo | undefined
  getLogs(): string[]
  getResolvedBinary(): ResolvedBinary | undefined
  /** Apply managed (non-secret) settings to the target. No-op for local. */
  applySettings?(code: CodeSettings): void | Promise<void>
}
