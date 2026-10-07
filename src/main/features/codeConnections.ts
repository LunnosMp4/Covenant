import { randomUUID } from 'crypto'
import { appStore } from '../store/appStore'
import {
  normalizeCodeConnection,
  normalizeCodeConnections
} from '../../shared/code/codeNormalizers'
import {
  DEFAULT_LOCAL_CONNECTION,
  LOCAL_CONNECTION_ID,
  MAX_CODE_CONNECTIONS,
  type CodeConnection,
  type CodeSshAuthMethod
} from '../../shared/code/connection'

const AUTH_METHODS: CodeSshAuthMethod[] = ['password', 'key', 'agent']

function isAuthMethod(value: unknown): value is CodeSshAuthMethod {
  return typeof value === 'string' && (AUTH_METHODS as string[]).includes(value)
}

/** Stored SSH connections (excludes the implicit local connection). */
function getStoredConnections(): CodeConnection[] {
  return normalizeCodeConnections(appStore.get('codeConnections', []))
}

/** All connections, local first. */
export function getCodeConnections(): CodeConnection[] {
  return [DEFAULT_LOCAL_CONNECTION, ...getStoredConnections()]
}

export function getCodeConnectionById(id: string | undefined): CodeConnection | undefined {
  return getCodeConnections().find((connection) => connection.id === id)
}

export function addCodeConnection(input: {
  name?: unknown
  host?: unknown
  port?: unknown
  username?: unknown
  authMethod?: unknown
  privateKeyPath?: unknown
}): CodeConnection[] {
  const host = typeof input?.host === 'string' ? input.host.trim() : ''
  const username = typeof input?.username === 'string' ? input.username.trim() : ''
  if (!host) throw new Error('A host is required')
  if (!username) throw new Error('A username is required')

  const normalized = normalizeCodeConnection({
    id: randomUUID(),
    kind: 'ssh',
    name: typeof input?.name === 'string' ? input.name : undefined,
    host,
    port: typeof input.port === 'number' ? input.port : Number(input?.port) || 22,
    username,
    authMethod: isAuthMethod(input?.authMethod) ? input.authMethod : 'password',
    privateKeyPath: typeof input?.privateKeyPath === 'string' ? input.privateKeyPath : undefined,
    createdAt: Date.now()
  })
  if (!normalized) throw new Error('Invalid connection')

  const next = [normalized, ...getStoredConnections()].slice(0, MAX_CODE_CONNECTIONS)
  appStore.set('codeConnections', next)
  return getCodeConnections()
}

export function updateCodeConnection(
  id: unknown,
  patch: {
    name?: unknown
    host?: unknown
    port?: unknown
    username?: unknown
    authMethod?: unknown
    privateKeyPath?: unknown
    hostKeyFingerprint?: unknown
  }
): CodeConnection[] {
  const targetId = typeof id === 'string' ? id : ''
  const existing = getStoredConnections()
  const current = existing.find((connection) => connection.id === targetId)
  if (!current) throw new Error('Connection not found')

  const overrides: Record<string, unknown> = { ...current }
  if (typeof patch?.name === 'string') overrides.name = patch.name
  if (typeof patch?.host === 'string') overrides.host = patch.host.trim()
  if (patch?.port !== undefined) overrides.port = typeof patch.port === 'number' ? patch.port : Number(patch.port)
  if (typeof patch?.username === 'string') overrides.username = patch.username.trim()
  if (isAuthMethod(patch?.authMethod)) overrides.authMethod = patch.authMethod
  if (typeof patch?.privateKeyPath === 'string') overrides.privateKeyPath = patch.privateKeyPath
  if (typeof patch?.hostKeyFingerprint === 'string') overrides.hostKeyFingerprint = patch.hostKeyFingerprint

  const normalized = normalizeCodeConnection(overrides)
  if (!normalized) throw new Error('Invalid connection')

  const next = existing.map((connection) => (connection.id === targetId ? normalized : connection))
  appStore.set('codeConnections', next)
  return getCodeConnections()
}

export function removeCodeConnection(id: unknown): CodeConnection[] {
  const targetId = typeof id === 'string' ? id : ''
  if (targetId === LOCAL_CONNECTION_ID) {
    throw new Error('The local connection cannot be removed')
  }
  const next = getStoredConnections().filter((connection) => connection.id !== targetId)
  appStore.set('codeConnections', next)
  if (getActiveConnectionId() === targetId) {
    setActiveConnectionId(LOCAL_CONNECTION_ID)
  }
  return getCodeConnections()
}

export function getActiveConnectionId(): string {
  const stored = appStore.get('codeActiveConnectionId', LOCAL_CONNECTION_ID)
  if (!stored || stored === LOCAL_CONNECTION_ID) return LOCAL_CONNECTION_ID
  return getStoredConnections().some((connection) => connection.id === stored)
    ? stored
    : LOCAL_CONNECTION_ID
}

export function setActiveConnectionId(id: string): void {
  const target = id || LOCAL_CONNECTION_ID
  const exists = target === LOCAL_CONNECTION_ID || getStoredConnections().some((connection) => connection.id === target)
  appStore.set('codeActiveConnectionId', exists ? target : LOCAL_CONNECTION_ID)
}
