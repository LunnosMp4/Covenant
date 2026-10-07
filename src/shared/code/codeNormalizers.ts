import {
  CODE_PERMISSION_EFFECTS,
  CODE_PROVIDER_ID,
  DEFAULT_CODE_PERMISSIONS,
  DEFAULT_CODE_SETTINGS,
  type CodePermissionEffect,
  type CodePermissionSettings,
  type CodeProject,
  type CodeSettings
} from './code'
import {
  LOCAL_CONNECTION_ID,
  type CodeConnection,
  type CodeSshAuthMethod
} from './connection'

function isEffect(value: unknown): value is CodePermissionEffect {
  return typeof value === 'string' && (CODE_PERMISSION_EFFECTS as string[]).includes(value)
}

function normalizeEffect(value: unknown, fallback: CodePermissionEffect): CodePermissionEffect {
  return isEffect(value) ? value : fallback
}

export function normalizeCodePermissions(raw: unknown): CodePermissionSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CODE_PERMISSIONS }
  }
  const obj = raw as Record<string, unknown>
  return {
    edit: normalizeEffect(obj.edit, DEFAULT_CODE_PERMISSIONS.edit),
    bash: normalizeEffect(obj.bash, DEFAULT_CODE_PERMISSIONS.bash),
    external_directory: normalizeEffect(
      obj.external_directory,
      DEFAULT_CODE_PERMISSIONS.external_directory
    ),
    webfetch: normalizeEffect(obj.webfetch, DEFAULT_CODE_PERMISSIONS.webfetch)
  }
}

export function normalizeCodeSettings(raw: unknown): CodeSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CODE_SETTINGS, permission: { ...DEFAULT_CODE_PERMISSIONS } }
  }
  const obj = raw as Record<string, unknown>
  const port = typeof obj.serverPort === 'number' ? Math.round(obj.serverPort) : 0
  return {
    autoStart: typeof obj.autoStart === 'boolean' ? obj.autoStart : DEFAULT_CODE_SETTINGS.autoStart,
    defaultModel: typeof obj.defaultModel === 'string' ? obj.defaultModel.trim() : '',
    defaultVariant: typeof obj.defaultVariant === 'string' ? obj.defaultVariant.trim() : '',
    permission: normalizeCodePermissions(obj.permission),
    serverPort: Number.isFinite(port) && port >= 0 && port <= 65535 ? port : 0
  }
}

export function normalizeCodeProject(raw: unknown): CodeProject | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const directory = typeof obj.directory === 'string' ? obj.directory.trim() : ''
  if (!directory) return null
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : ''
  const fallbackName = directory.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? directory
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : fallbackName
  const addedAt = typeof obj.addedAt === 'number' && Number.isFinite(obj.addedAt) ? obj.addedAt : Date.now()
  const connectionId =
    typeof obj.connectionId === 'string' && obj.connectionId.trim()
      ? obj.connectionId.trim()
      : LOCAL_CONNECTION_ID
  return { id, name, directory, connectionId, addedAt }
}

export function normalizeCodeProjects(raw: unknown): CodeProject[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => normalizeCodeProject(item))
    .filter((item): item is CodeProject => item !== null)
}

/**
 * Parse a `provider/model#variant` selector into its parts. Empty input yields
 * the OpenCode Go provider with an empty model id (provider default).
 */
export function parseModelSelector(
  selector: string | undefined
): { providerID: string; id: string; variant?: string } {
  if (typeof selector !== 'string' || !selector.trim()) {
    return { providerID: CODE_PROVIDER_ID, id: '' }
  }
  let rest = selector.trim()
  let variant: string | undefined
  const hashIndex = rest.indexOf('#')
  if (hashIndex >= 0) {
    variant = rest.slice(hashIndex + 1).trim() || undefined
    rest = rest.slice(0, hashIndex)
  }
  const slashIndex = rest.indexOf('/')
  if (slashIndex < 0) {
    return { providerID: CODE_PROVIDER_ID, id: rest, variant }
  }
  const providerID = rest.slice(0, slashIndex) || CODE_PROVIDER_ID
  const id = rest.slice(slashIndex + 1)
  return { providerID, id, variant }
}

export function formatModelSelector(ref: { providerID: string; id: string; variant?: string }): string {
  const base = ref.providerID ? `${ref.providerID}/${ref.id}` : ref.id
  return ref.variant ? `${base}#${ref.variant}` : base
}

const SSH_AUTH_METHODS: CodeSshAuthMethod[] = ['password', 'key', 'agent']

function isSshAuthMethod(value: unknown): value is CodeSshAuthMethod {
  return typeof value === 'string' && (SSH_AUTH_METHODS as string[]).includes(value)
}

export function normalizeCodeConnection(raw: unknown): CodeConnection | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : ''
  if (!id) return null

  const kind = obj.kind === 'ssh' ? 'ssh' : 'local'
  if (kind === 'local') {
    return {
      id,
      kind: 'local',
      name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'This computer',
      createdAt: typeof obj.createdAt === 'number' && Number.isFinite(obj.createdAt) ? obj.createdAt : 0
    }
  }

  const host = typeof obj.host === 'string' ? obj.host.trim() : ''
  const username = typeof obj.username === 'string' ? obj.username.trim() : ''
  if (!host || !username) return null

  const portRaw = typeof obj.port === 'number' ? Math.round(obj.port) : 22
  const port = Number.isFinite(portRaw) && portRaw > 0 && portRaw <= 65535 ? portRaw : 22

  const connection: CodeConnection = {
    id,
    kind: 'ssh',
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : `${username}@${host}`,
    host,
    port,
    username,
    authMethod: isSshAuthMethod(obj.authMethod) ? obj.authMethod : 'password',
    createdAt: typeof obj.createdAt === 'number' && Number.isFinite(obj.createdAt) ? obj.createdAt : Date.now()
  }
  if (typeof obj.privateKeyPath === 'string' && obj.privateKeyPath.trim()) {
    connection.privateKeyPath = obj.privateKeyPath.trim()
  }
  if (typeof obj.hostKeyFingerprint === 'string' && obj.hostKeyFingerprint.trim()) {
    connection.hostKeyFingerprint = obj.hostKeyFingerprint.trim()
  }
  return connection
}

export function normalizeCodeConnections(raw: unknown): CodeConnection[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => normalizeCodeConnection(item))
    .filter((item): item is CodeConnection => item !== null && item.kind === 'ssh')
}
