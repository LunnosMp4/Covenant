import type {
  CodeActivityEvent,
  CodeEngineEvent,
  CodeFileDiff,
  CodeModel,
  CodePermissionRequest,
  CodeSession,
  CodeStatus,
  CodeTranscriptItem
} from '../../shared/code/code'

export type { CodeEngineEvent } from '../../shared/code/code'

export interface CodeModelRefInput {
  providerID: string
  id: string
  variant?: string
}

export interface CreateCodeSessionInput {
  directory: string
  model?: CodeModelRefInput
  agent?: string
  title?: string
}

export interface CodeEnginePermissionReply {
  sessionId: string
  requestId: string
  reply: 'once' | 'always' | 'reject'
}

export interface CodeIntegrationSummary {
  id: string
  name: string
  hasKeyMethod: boolean
  connected: boolean
}

export type CodeEngineListener = (event: CodeEngineEvent) => void

/**
 * Transport seam. All session/permission/streaming logic in IPC and the
 * renderer depends only on this interface. A future `RemoteCodeEngine` (SSH)
 * implements it without changing any consumer.
 */
export interface CodeEngine {
  connect(): Promise<void>
  dispose(): Promise<void>
  isReady(): boolean
  getStatus(): CodeStatus

  subscribe(listener: CodeEngineListener): () => void

  listModels(): Promise<CodeModel[]>
  listIntegrations(): Promise<CodeIntegrationSummary[]>
  connectProviderKey(integrationId: string, key: string): Promise<void>

  listSessions(directory?: string): Promise<CodeSession[]>
  createSession(input: CreateCodeSessionInput): Promise<CodeSession>
  deleteSession(sessionId: string): Promise<void>
  getTranscript(sessionId: string): Promise<CodeTranscriptItem[]>

  prompt(input: { sessionId: string; text: string }): Promise<void>
  interrupt(sessionId: string): Promise<void>
  switchModel(sessionId: string, model: CodeModelRefInput): Promise<void>

  listPermissions(sessionId: string): Promise<CodePermissionRequest[]>
  replyPermission(input: CodeEnginePermissionReply): Promise<void>

  getDiff(sessionId: string): Promise<CodeFileDiff[]>
}
