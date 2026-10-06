import { log } from '../logger'
import type {
  CodeActivityEvent,
  CodeAgent,
  CodeFileDiff,
  CodeModel,
  CodeModelRef,
  CodePermissionRequest,
  CodeSession,
  CodeSessionStatus,
  CodeStatus,
  CodeTranscriptItem,
  CodeTranscriptTool,
  CodeUsage
} from '../../shared/code/code'
import { CODE_PROVIDER_ID } from '../../shared/code/code'
import type {
  CodeEngine,
  CodeEngineEvent,
  CodeEngineListener,
  CodeEnginePermissionReply,
  CodeIntegrationSummary,
  CodeModelRefInput,
  CreateCodeSessionInput
} from './codeEngine'
import type { OpenCodeRuntime, RuntimeInfo } from './opencodeRuntime'

// The OpenCode client is ESM-only and its generated types are enormous. We
// import it dynamically and treat the surface as a loose shape, mapping every
// result into Covenant DTOs so wire types never leak past this file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CodeClient = any

interface LocalCodeEngineOptions {
  runtime: OpenCodeRuntime
  getApiKey: () => string | undefined
}

const EVENT_RETRY_MS = 1500
const RECONNECT_MS = 1000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function asArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value && typeof value === 'object') {
    const data = (value as { data?: unknown }).data
    if (Array.isArray(data)) return data as T[]
  }
  return []
}

function pickData(value: unknown): unknown {
  if (value && typeof value === 'object' && 'data' in value) {
    return (value as { data?: unknown }).data
  }
  return value
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function toModelRef(raw: unknown): CodeModelRef | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id : typeof obj.modelID === 'string' ? obj.modelID : ''
  const providerID = typeof obj.providerID === 'string' ? obj.providerID : CODE_PROVIDER_ID
  if (!id) return undefined
  const variant = typeof obj.variant === 'string' ? obj.variant : undefined
  return { id, providerID, variant }
}

function toFileDiff(raw: unknown): CodeFileDiff | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const file = typeof obj.file === 'string' ? obj.file : typeof obj.path === 'string' ? obj.path : ''
  if (!file) return null
  return {
    file,
    additions: toNumber(obj.additions),
    deletions: toNumber(obj.deletions),
    status: typeof obj.status === 'string' ? obj.status : undefined,
    patch: typeof obj.patch === 'string' ? obj.patch : undefined
  }
}

function toPermission(raw: unknown, fallbackSessionId: string): CodePermissionRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id : typeof obj.requestID === 'string' ? obj.requestID : ''
  if (!id) return null
  const sessionId =
    typeof obj.sessionID === 'string' ? obj.sessionID : typeof obj.sessionId === 'string' ? obj.sessionId : fallbackSessionId
  const resources = Array.isArray(obj.resources)
    ? obj.resources.filter((item): item is string => typeof item === 'string')
    : Array.isArray(obj.patterns)
      ? obj.patterns.filter((item): item is string => typeof item === 'string')
      : []
  const action = typeof obj.action === 'string' ? obj.action : typeof obj.permission === 'string' ? obj.permission : 'unknown'
  const save = Array.isArray(obj.save) ? obj.save.filter((item): item is string => typeof item === 'string') : undefined
  return {
    id,
    sessionId,
    action,
    resources,
    save,
    title: typeof obj.title === 'string' ? obj.title : undefined,
    createdAt: Date.now()
  }
}

function toUsage(raw: unknown): CodeUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const obj = raw as Record<string, unknown>
  const cache = (obj.cache ?? {}) as Record<string, unknown>
  return {
    input: toNumber(obj.input),
    output: toNumber(obj.output),
    reasoning: toNumber(obj.reasoning),
    cacheRead: toNumber(cache.read),
    cacheWrite: toNumber(cache.write),
    cost: typeof obj.cost === 'number' ? obj.cost : undefined
  }
}

export class LocalCodeEngine implements CodeEngine {
  private readonly runtime: OpenCodeRuntime
  private readonly getApiKey: () => string | undefined
  private client?: CodeClient
  private info?: RuntimeInfo
  private listeners = new Set<CodeEngineListener>()
  private disposed = false
  private eventAbort?: AbortController
  private eventLoop?: Promise<void>
  private connecting?: Promise<void>
  private sessionStatus = new Map<string, CodeSessionStatus>()

  constructor(options: LocalCodeEngineOptions) {
    this.runtime = options.runtime
    this.getApiKey = options.getApiKey
  }

  isReady(): boolean {
    return Boolean(this.client) && this.runtime.isRunning()
  }

  getStatus(): CodeStatus {
    const resolved = this.runtime.getResolvedBinary()
    const info = this.info
    return {
      installed: Boolean(resolved),
      version: info?.version,
      running: this.runtime.isRunning(),
      ready: this.isReady(),
      binaryPath: resolved?.path,
      error: resolved ? undefined : 'OpenCode runtime binary not found'
    }
  }

  async connect(): Promise<void> {
    if (this.connecting) return this.connecting
    this.connecting = this.doConnect().finally(() => {
      this.connecting = undefined
    })
    return this.connecting
  }

  private async doConnect(): Promise<void> {
    if (this.client && this.runtime.isRunning()) {
      return
    }
    this.disposed = false
    const info = await this.runtime.start()
    this.info = info

    const { OpenCode } = await import('@opencode/client')
    this.client = OpenCode.make({
      baseUrl: info.baseUrl,
      headers: {
        authorization: `Basic ${Buffer.from(`${info.username}:${info.password}`).toString('base64')}`
      }
    })

    const apiKey = this.getApiKey()
    if (apiKey) {
      await this.ensureProviderKey(apiKey).catch((error) =>
        log.warn('Failed to connect OpenCode Go credential', error)
      )
    }

    this.eventAbort = new AbortController()
    this.eventLoop = this.runEventLoop(this.eventAbort.signal)
  }

  private async ensureProviderKey(apiKey: string): Promise<void> {
    // The integration catalog is populated by an asynchronous models.dev
    // refresh shortly after startup, so wait for the Go integration to appear.
    const deadline = Date.now() + 10000
    let target: CodeIntegrationSummary | undefined
    while (Date.now() < deadline) {
      const integrations = await this.listIntegrations()
      target =
        integrations.find((entry) => entry.id === CODE_PROVIDER_ID) ??
        integrations.find((entry) => entry.id.startsWith(`${CODE_PROVIDER_ID}-`))
      if (target) break
      await delay(500)
    }

    if (!target) {
      log.warn('OpenCode Go integration not available yet; will retry on next connection')
      return
    }
    if (!target.hasKeyMethod) {
      log.warn('OpenCode Go integration has no API-key method')
      return
    }
    if (target.connected) return

    await this.client.integration.connect.key({
      integrationID: target.id,
      key: apiKey,
      label: 'Covenant'
    })
  }

  subscribe(listener: CodeEngineListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(event: CodeEngineEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        log.warn('Code engine listener threw', error)
      }
    }
  }

  private async runEventLoop(signal: AbortSignal): Promise<void> {
    while (!this.disposed && !signal.aborted) {
      try {
        const stream = this.client.event.subscribe({ signal }) as AsyncIterable<unknown>
        for await (const raw of stream) {
          if (this.disposed || signal.aborted) break
          this.handleWireEvent(raw)
        }
      } catch (error) {
        if (this.disposed || signal.aborted) break
        log.warn('OpenCode event stream error', error)
        await delay(EVENT_RETRY_MS)
        continue
      }
      if (!this.disposed && !signal.aborted) {
        await delay(RECONNECT_MS)
      }
    }
  }

  private handleWireEvent(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return
    const envelope = raw as Record<string, unknown>
    const event = (envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : envelope) as Record<
      string,
      unknown
    >
    const type = typeof event.type === 'string' ? event.type : ''
    if (!type) return

    // OpenCode 2.x uses `data`; the 1.x SDK used `properties`.
    const payload = (
      event.data && typeof event.data === 'object'
        ? event.data
        : event.properties && typeof event.properties === 'object'
          ? event.properties
          : {}
    ) as Record<string, unknown>

    const sessionId = typeof payload.sessionID === 'string' ? payload.sessionID : ''
    const timestamp = Date.now()
    const assistantMessageId = String(payload.assistantMessageID ?? '')
    const ordinal = payload.ordinal !== undefined ? String(payload.ordinal) : ''
    const partKey = assistantMessageId
      ? `${assistantMessageId}:${ordinal || '0'}`
      : String(payload.id ?? payload.partID ?? '')
    const callId = String(payload.id ?? payload.callID ?? '')

    const activity = (partial: Partial<CodeActivityEvent> & { type: CodeActivityEvent['type'] }): void => {
      this.emit({ kind: 'activity', event: { sessionId, timestamp, ...partial } })
    }

    switch (type) {
      case 'session.text.delta':
      case 'session.next.text.delta':
        activity({ type: 'text-delta', partId: partKey, messageId: assistantMessageId, delta: String(payload.delta ?? '') })
        break
      case 'session.text.ended':
      case 'session.next.text.ended':
        activity({ type: 'text-end', partId: partKey, text: String(payload.text ?? '') })
        break
      case 'session.reasoning.delta':
      case 'session.next.reasoning.delta':
        activity({ type: 'reasoning-delta', partId: partKey, delta: String(payload.delta ?? '') })
        break
      case 'session.reasoning.ended':
      case 'session.next.reasoning.ended':
        activity({ type: 'reasoning-end', partId: partKey, text: String(payload.text ?? '') })
        break
      case 'session.tool.input.started':
      case 'session.next.tool.input.started':
        activity({ type: 'tool-input', callId, toolName: String(payload.name ?? payload.tool ?? '') })
        break
      case 'session.tool.input.delta':
      case 'session.next.tool.input.delta':
        activity({ type: 'tool-input', callId, delta: String(payload.delta ?? '') })
        break
      case 'session.tool.input.ended':
      case 'session.next.tool.input.ended':
        activity({ type: 'tool-input', callId, text: String(payload.text ?? '') })
        break
      case 'session.tool.called':
      case 'session.next.tool.called':
        activity({ type: 'tool-called', callId, toolName: String(payload.name ?? payload.tool ?? '') })
        break
      case 'session.tool.progress':
      case 'session.next.tool.progress':
        activity({ type: 'tool-progress', callId })
        break
      case 'session.tool.success':
      case 'session.next.tool.success':
        activity({ type: 'tool-success', callId, output: stringifyContent(payload.content) })
        break
      case 'session.tool.failed':
      case 'session.next.tool.failed':
        activity({ type: 'tool-failed', callId, error: errorMessage(payload.error) })
        break
      case 'session.shell.started':
      case 'session.next.shell.started': {
        const shell = (payload.shell && typeof payload.shell === 'object' ? payload.shell : {}) as Record<string, unknown>
        activity({ type: 'shell-started', callId, command: String(shell.command ?? payload.command ?? '') })
        break
      }
      case 'session.shell.ended':
      case 'session.next.shell.ended': {
        const output = (payload.output && typeof payload.output === 'object' ? payload.output : {}) as Record<
          string,
          unknown
        >
        const text = typeof payload.output === 'string' ? payload.output : String(output.output ?? '')
        activity({ type: 'shell-ended', callId, output: text })
        break
      }
      case 'session.step.started':
      case 'session.next.step.started':
        activity({ type: 'step-started', toolName: String(payload.agent ?? '') })
        break
      case 'session.step.ended':
      case 'session.next.step.ended':
        activity({ type: 'step-ended', usage: toUsage(payload.tokens) })
        break
      case 'session.compaction.started':
      case 'session.compaction.ended':
      case 'session.next.compaction.started':
      case 'session.next.compaction.ended':
        activity({ type: 'compaction', text: typeof payload.text === 'string' ? payload.text : '' })
        break
      case 'filesystem.changed':
      case 'file.edited': {
        const file = String(payload.file ?? '')
        const evt = typeof payload.event === 'string' ? payload.event : ''
        activity({ type: 'file-edited', file: evt === 'unlink' ? `${file} (deleted)` : file })
        break
      }
      case 'session.status': {
        const status = statusFromWire(payload.status)
        if (sessionId) this.sessionStatus.set(sessionId, status)
        activity({ type: 'status', status })
        break
      }
      case 'session.idle':
      case 'session.execution.succeeded':
      case 'session.next.interrupt.requested':
        if (sessionId) this.sessionStatus.set(sessionId, 'idle')
        activity({ type: 'done' })
        break
      case 'session.execution.failed':
      case 'session.error':
        activity({ type: 'error', error: errorMessage(payload.error) })
        break
      case 'permission.asked':
      case 'permission.v2.asked': {
        const request = toPermission(payload, sessionId)
        if (request) this.emit({ kind: 'permission', request })
        break
      }
      case 'permission.replied':
      case 'permission.v2.replied': {
        const requestId = String(payload.requestID ?? payload.id ?? '')
        if (requestId) this.emit({ kind: 'permission-replied', sessionId, requestId })
        break
      }
      case 'session.diff': {
        const diff = asArray(payload.diff).map(toFileDiff).filter((item): item is CodeFileDiff => item !== null)
        if (sessionId) this.emit({ kind: 'diff', sessionId, diff })
        break
      }
      case 'message.part.delta': {
        // Fallback streaming channel used by some builds.
        const field = typeof payload.field === 'string' ? payload.field : 'text'
        const delta = String(payload.delta ?? '')
        if (field === 'text') {
          activity({ type: 'text-delta', partId: String(payload.partID ?? ''), delta })
        } else if (field === 'reasoning' || field === 'reasoning_content') {
          activity({ type: 'reasoning-delta', partId: String(payload.partID ?? ''), delta })
        }
        break
      }
      default:
        break
    }
  }

  async listModels(): Promise<CodeModel[]> {
    const client = this.requireClient()
    // The model catalog can lag the integration connection by a moment.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await client.model.list()
      const models = asArray<Record<string, unknown>>(pickData(result))
      const mapped = models.map(toModel).filter((model): model is CodeModel => model !== null)
      const go = mapped.filter((model) => model.providerID === CODE_PROVIDER_ID)
      if (go.length > 0) return go
      if (mapped.length > 0) return mapped
      if (attempt < 2) await delay(700)
    }
    return []
  }

  async listAgents(): Promise<CodeAgent[]> {
    const client = this.requireClient()
    try {
      const result = await client.agent.list()
      const list = asArray<Record<string, unknown>>(pickData(result))
      return list.map(toAgent).filter((agent): agent is CodeAgent => agent !== null)
    } catch (error) {
      log.warn('Failed to list OpenCode agents', error)
      return []
    }
  }

  async listIntegrations(): Promise<CodeIntegrationSummary[]> {
    const client = this.requireClient()
    try {
      const result = await client.integration.list()
      const list = asArray<Record<string, unknown>>(pickData(result))
      return list.map((entry) => {
        const methods = Array.isArray(entry.methods) ? entry.methods : []
        const hasKeyMethod = methods.some(
          (method) => method && typeof method === 'object' && (method as { type?: unknown }).type === 'key'
        )
        const connections = Array.isArray(entry.connections) ? entry.connections : []
        return {
          id: String(entry.id ?? ''),
          name: String(entry.name ?? entry.id ?? ''),
          hasKeyMethod,
          connected: connections.length > 0
        }
      })
    } catch (error) {
      log.warn('Failed to list OpenCode integrations', error)
      return []
    }
  }

  async connectProviderKey(integrationId: string, key: string): Promise<void> {
    const client = this.requireClient()
    const id = integrationId?.trim() || CODE_PROVIDER_ID
    await client.integration.connect.key({ integrationID: id, key, label: 'Covenant' })
  }

  async listSessions(directory?: string): Promise<CodeSession[]> {
    const client = this.requireClient()
    const result = await client.session.list(directory ? { directory } : undefined)
    const list = asArray<Record<string, unknown>>(pickData(result))
    return list
      .map((entry) => toSession(entry, this.sessionStatus))
      .filter((session): session is CodeSession => session !== null)
  }

  async createSession(input: CreateCodeSessionInput): Promise<CodeSession> {
    const client = this.requireClient()
    const body: Record<string, unknown> = { location: { directory: input.directory } }
    if (input.model && input.model.id) {
      body.model = { id: input.model.id, providerID: input.model.providerID, variant: input.model.variant }
    }
    if (input.agent) body.agent = input.agent
    if (input.title) body.title = input.title
    const result = await client.session.create(body)
    const session = toSession(pickData(result) ?? result, this.sessionStatus)
    if (!session) throw new Error('Failed to create OpenCode session')
    return session
  }

  async deleteSession(sessionId: string): Promise<void> {
    const client = this.requireClient()
    await client.session.remove({ sessionID: sessionId })
    this.sessionStatus.delete(sessionId)
  }

  async getTranscript(sessionId: string): Promise<CodeTranscriptItem[]> {
    const client = this.requireClient()
    try {
      const result = await client.message.list({ sessionID: sessionId })
      const list = asArray<Record<string, unknown>>(pickData(result))
      const items = list
        .map(toTranscript)
        .filter((item): item is CodeTranscriptItem => item !== null)
      // The OpenCode message list is newest-first; the UI expects chronological
      // order. Sort ascending by creation time, or reverse when the wire carries
      // no timestamps.
      const hasTimestamps = items.every((item) => typeof item.createdAt === 'number')
      if (!hasTimestamps) return items.reverse()
      return items.sort((a, b) => (a.createdAt as number) - (b.createdAt as number))
    } catch (error) {
      log.warn('Failed to load OpenCode transcript', error)
      return []
    }
  }

  async prompt(input: { sessionId: string; text: string }): Promise<void> {
    const client = this.requireClient()
    await client.session.prompt({ sessionID: input.sessionId, text: input.text })
    this.sessionStatus.set(input.sessionId, 'busy')
  }

  async interrupt(sessionId: string): Promise<void> {
    const client = this.requireClient()
    await client.session.interrupt({ sessionID: sessionId })
  }

  async switchModel(sessionId: string, model: CodeModelRefInput): Promise<void> {
    const client = this.requireClient()
    await client.session.switchModel({
      sessionID: sessionId,
      model: { id: model.id, providerID: model.providerID, variant: model.variant }
    })
  }

  async switchAgent(sessionId: string, agent: string): Promise<void> {
    const client = this.requireClient()
    await client.session.switchAgent({ sessionID: sessionId, agent })
  }

  async listPermissions(sessionId: string): Promise<CodePermissionRequest[]> {
    const client = this.requireClient()
    try {
      let list: Record<string, unknown>[] = []
      if (client.permission?.request?.list) {
        const result = await client.permission.request.list()
        list = asArray<Record<string, unknown>>(pickData(result))
      }
      if (list.length === 0 && client.permission?.list) {
        const result = await client.permission.list({ sessionID: sessionId })
        list = asArray<Record<string, unknown>>(pickData(result))
      }
      return list
        .map((entry) => toPermission(entry, sessionId))
        .filter((request): request is CodePermissionRequest => request !== null)
        .filter((request) => !sessionId || request.sessionId === sessionId)
    } catch (error) {
      log.warn('Failed to list OpenCode permissions', error)
      return []
    }
  }

  async replyPermission(input: CodeEnginePermissionReply): Promise<void> {
    const client = this.requireClient()
    await client.permission.reply({
      sessionID: input.sessionId,
      requestID: input.requestId,
      decision: input.reply
    })
    this.emit({ kind: 'permission-replied', sessionId: input.sessionId, requestId: input.requestId })
  }

  async getDiff(sessionId: string): Promise<CodeFileDiff[]> {
    const client = this.requireClient()
    try {
      const result = await client.session.diff({ sessionID: sessionId })
      const list = asArray(pickData(result))
      return list.map(toFileDiff).filter((item): item is CodeFileDiff => item !== null)
    } catch (error) {
      log.warn('Failed to load OpenCode session diff', error)
      return []
    }
  }

  private requireClient(): CodeClient {
    if (!this.client) {
      throw new Error('OpenCode runtime is not connected')
    }
    return this.client
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.eventAbort?.abort()
    try {
      await this.eventLoop
    } catch {
      // ignore
    }
    this.eventLoop = undefined
    this.client = undefined
    this.info = undefined
    await this.runtime.stop()
  }
}

// ---------------------------------------------------------------------------
// Wire -> DTO mapping helpers
// ---------------------------------------------------------------------------

function statusFromWire(raw: unknown): CodeSessionStatus {
  if (typeof raw === 'string') {
    return raw === 'busy' || raw === 'retry' || raw === 'idle' ? raw : 'idle'
  }
  if (raw && typeof raw === 'object') {
    const type = (raw as { type?: unknown }).type
    if (type === 'busy' || type === 'retry' || type === 'idle') return type
  }
  return 'idle'
}

function errorMessage(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') {
    const message = (raw as { message?: unknown }).message
    if (typeof message === 'string') return message
    const name = (raw as { name?: unknown }).name
    if (typeof name === 'string') return name
  }
  return 'Unknown error'
}

function stringifyContent(raw: unknown): string {
  if (typeof raw === 'string') return raw
  const list = asArray(raw)
  const parts = list
    .map((item) => {
      if (item && typeof item === 'object') {
        const text = (item as { text?: unknown }).text
        if (typeof text === 'string') return text
      }
      return ''
    })
    .filter(Boolean)
  return parts.join('\n')
}

function toModel(raw: unknown): CodeModel | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id : ''
  if (!id) return null
  const providerID = typeof obj.providerID === 'string' ? obj.providerID : CODE_PROVIDER_ID
  const capabilities = (obj.capabilities ?? {}) as Record<string, unknown>
  const limit = (obj.limit ?? {}) as Record<string, unknown>
  let variants: string[] = []
  if (Array.isArray(obj.variants)) {
    variants = obj.variants
      .map((entry) =>
        entry && typeof entry === 'object'
          ? String((entry as { id?: unknown }).id ?? '')
          : typeof entry === 'string'
            ? entry
            : ''
      )
      .filter(Boolean)
  } else if (obj.variants && typeof obj.variants === 'object') {
    variants = Object.keys(obj.variants as Record<string, unknown>)
  }
  return {
    providerID,
    id,
    label: typeof obj.name === 'string' && obj.name ? obj.name : id,
    variants,
    supportsReasoning: Boolean(capabilities.reasoning),
    supportsTools: capabilities.tools !== false,
    maxContextTokens: typeof limit.context === 'number' ? limit.context : undefined
  }
}

function toAgent(raw: unknown): CodeAgent | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id : ''
  if (!id) return null
  const mode =
    obj.mode === 'subagent' || obj.mode === 'primary' || obj.mode === 'all' ? obj.mode : 'all'
  return {
    id,
    name: typeof obj.name === 'string' && obj.name ? obj.name : id,
    mode,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    hidden: obj.hidden === true
  }
}

function toSession(raw: unknown, statuses: Map<string, CodeSessionStatus>): CodeSession | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id : ''
  if (!id) return null
  const location = (obj.location ?? {}) as Record<string, unknown>
  const time = (obj.time ?? {}) as Record<string, unknown>
  const directory =
    typeof location.directory === 'string'
      ? location.directory
      : typeof obj.directory === 'string'
        ? obj.directory
        : ''
  const created = typeof time.created === 'number' ? time.created : Date.now()
  const updated = typeof time.updated === 'number' ? time.updated : created
  return {
    id,
    title: typeof obj.title === 'string' && obj.title ? obj.title : 'Untitled session',
    directory,
    parentId: typeof obj.parentID === 'string' ? obj.parentID : undefined,
    createdAt: created,
    updatedAt: updated,
    model: toModelRef(obj.model),
    agent: typeof obj.agent === 'string' ? obj.agent : undefined,
    cost: typeof obj.cost === 'number' ? obj.cost : undefined,
    status: statuses.get(id) ?? 'idle'
  }
}

function toTranscript(raw: unknown): CodeTranscriptItem | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id : ''
  if (!id) return null
  const type = typeof obj.type === 'string' ? obj.type : typeof obj.role === 'string' ? obj.role : 'other'
  const text = typeof obj.text === 'string' ? obj.text : ''
  const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : undefined
  const content = asArray<Record<string, unknown>>(obj.content)
  let combinedText = text
  let combinedReasoning = reasoning
  const tools: CodeTranscriptTool[] = []
  for (const part of content) {
    const partType = typeof part.type === 'string' ? part.type : ''
    if (partType === 'text' && typeof part.text === 'string') {
      combinedText = combinedText ? `${combinedText}\n${part.text}` : part.text
    } else if (partType === 'reasoning' && typeof part.text === 'string') {
      combinedReasoning = combinedReasoning ? `${combinedReasoning}\n${part.text}` : part.text
    } else if (partType === 'tool') {
      const state = (part.state ?? {}) as Record<string, unknown>
      tools.push({
        callId: String(part.id ?? ''),
        name: String(part.name ?? part.tool ?? 'tool'),
        status: toolStatusFromWire(state.status),
        input: state.input ? JSON.stringify(state.input) : undefined,
        output: typeof state.output === 'string' ? state.output : undefined,
        error: typeof state.error === 'string' ? state.error : undefined
      })
    }
  }
  const role: CodeTranscriptItem['role'] =
    type === 'user'
      ? 'user'
      : type === 'assistant'
        ? 'assistant'
        : type === 'system'
          ? 'system'
          : type === 'shell'
            ? 'shell'
            : type === 'compaction'
              ? 'compaction'
              : 'other'
  const time = (obj.time ?? {}) as Record<string, unknown>
  return {
    id,
    role,
    text: combinedText,
    reasoning: combinedReasoning,
    tools: tools.length > 0 ? tools : undefined,
    agent: typeof obj.agent === 'string' ? obj.agent : undefined,
    model: toModelRef(obj.model),
    createdAt: typeof time.created === 'number' ? time.created : undefined,
    cost: typeof obj.cost === 'number' ? obj.cost : undefined,
    error: obj.error ? errorMessage(obj.error) : undefined
  }
}

function toolStatusFromWire(raw: unknown): CodeTranscriptTool['status'] {
  if (raw === 'running' || raw === 'completed' || raw === 'error' || raw === 'pending') return raw
  return 'pending'
}
