import type {
  CodeActivityEvent,
  CodeAgent,
  CodeEngineEvent,
  CodeFileDiff,
  CodeFormRequest,
  CodeFormValue,
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

export interface CodeEngineFormReply {
  sessionId: string
  formId: string
  answer: Record<string, CodeFormValue>
}

export interface CodeEngineFormCancel {
  sessionId: string
  formId: string
  message?: string
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
  listAgents(): Promise<CodeAgent[]>
  listIntegrations(): Promise<CodeIntegrationSummary[]>
  connectProviderKey(integrationId: string, key: string): Promise<void>

  listSessions(directory?: string): Promise<CodeSession[]>
  createSession(input: CreateCodeSessionInput): Promise<CodeSession>
  deleteSession(sessionId: string): Promise<void>
  getTranscript(sessionId: string): Promise<CodeTranscriptItem[]>

  prompt(input: { sessionId: string; text: string }): Promise<void>
  interrupt(sessionId: string): Promise<void>
  switchModel(sessionId: string, model: CodeModelRefInput): Promise<void>
  switchAgent(sessionId: string, agent: string): Promise<void>

  listPermissions(sessionId: string): Promise<CodePermissionRequest[]>
  replyPermission(input: CodeEnginePermissionReply): Promise<void>

  listForms(sessionId: string): Promise<CodeFormRequest[]>
  replyForm(input: CodeEngineFormReply): Promise<void>
  cancelForm(input: CodeEngineFormCancel): Promise<void>

  getDiff(sessionId: string): Promise<CodeFileDiff[]>
}
