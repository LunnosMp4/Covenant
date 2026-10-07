// Covenant Code connection types.
//
// A "connection" is where an OpenCode server runs: either on this machine
// (`local`) or on a remote machine reached over SSH (`ssh`). Only one
// connection is active at a time. Secrets (passwords, private keys) are never
// part of these DTOs — they live in the main process behind `safeStorage`.

export type CodeConnectionKind = 'local' | 'ssh'

export type CodeSshAuthMethod = 'password' | 'key' | 'agent'

export const LOCAL_CONNECTION_ID = 'local'

export const MAX_CODE_CONNECTIONS = 50

export interface CodeConnection {
  id: string
  kind: CodeConnectionKind
  name: string
  /** SSH only. */
  host?: string
  /** SSH only. Defaults to 22. */
  port?: number
  /** SSH only. */
  username?: string
  /** SSH only. */
  authMethod?: CodeSshAuthMethod
  /** SSH only, for the `key` auth method. */
  privateKeyPath?: string
  /** SSH only. Verify the host key against a trusted fingerprint (TOFU). */
  hostKeyFingerprint?: string
  createdAt: number
}

export interface CodeConnectionStatus {
  id: string
  kind: CodeConnectionKind
  name: string
  connected: boolean
  running: boolean
  ready: boolean
  version?: string
  /** Whether an OpenCode binary was detected/provisioned on the target. */
  installed: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Remote filesystem browsing (SFTP)
// ---------------------------------------------------------------------------

export type RemoteEntryType = 'dir' | 'file' | 'symlink' | 'other'

export interface RemoteDirEntry {
  name: string
  path: string
  type: RemoteEntryType
  size: number
}

export interface RemoteBrowseResult {
  connectionId: string
  path: string
  parent: string | null
  home: string
  entries: RemoteDirEntry[]
}

export const DEFAULT_LOCAL_CONNECTION: CodeConnection = {
  id: LOCAL_CONNECTION_ID,
  kind: 'local',
  name: 'This computer',
  createdAt: 0
}

export function isLocalConnectionId(id: string | undefined): boolean {
  return !id || id === LOCAL_CONNECTION_ID
}

export function isSshConnection(connection: CodeConnection | undefined): boolean {
  return connection?.kind === 'ssh'
}
