// Covenant Code domain types.
//
// These are intentionally decoupled from the OpenCode wire protocol. The main
// process (`CodeEngine`) maps OpenCode events/messages into these DTOs so the
// renderer and IPC layer never depend on the OpenCode SDK shape. A future
// remote (SSH) engine can produce the same DTOs unchanged.

export type CodePermissionEffect = 'allow' | 'ask' | 'deny'

export interface CodeProject {
  id: string
  name: string
  directory: string
  /** Which connection/machine this project lives on. Defaults to `local`. */
  connectionId: string
  addedAt: number
}

export interface CodeModelRef {
  providerID: string
  id: string
  variant?: string
}

export interface CodeModel {
  providerID: string
  id: string
  label: string
  variants: string[]
  supportsReasoning: boolean
  supportsTools: boolean
  maxContextTokens?: number
}

export type CodeSessionStatus = 'idle' | 'busy' | 'retry' | 'error'

export interface CodeSession {
  id: string
  title: string
  directory: string
  parentId?: string
  createdAt: number
  updatedAt: number
  model?: CodeModelRef
  agent?: string
  cost?: number
  status: CodeSessionStatus
}

export interface CodeAgent {
  id: string
  name: string
  mode: 'subagent' | 'primary' | 'all'
  description?: string
  hidden: boolean
}

export interface CodeFileDiff {
  file: string
  additions: number
  deletions: number
  status?: 'added' | 'deleted' | 'modified' | string
  patch?: string
}

export interface CodePermissionRequest {
  id: string
  sessionId: string
  action: string
  resources: string[]
  save?: string[]
  title?: string
  createdAt: number
}

export interface CodeStatus {
  installed: boolean
  version?: string
  running: boolean
  ready: boolean
  binaryPath?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Interactive questions (OpenCode "forms")
// ---------------------------------------------------------------------------

export type CodeFormFieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'multiselect'
  | 'external'

export type CodeFormValue = string | number | boolean | string[]

export interface CodeFormOption {
  value: string
  label: string
  description?: string
}

export interface CodeFormWhen {
  key: string
  op: 'eq' | 'neq'
  value: string | number | boolean
}

export interface CodeFormField {
  key: string
  type: CodeFormFieldType
  title?: string
  description?: string
  required?: boolean
  hidden?: boolean
  when?: CodeFormWhen[]
  /** string */
  format?: 'email' | 'uri' | 'date' | 'date-time'
  minLength?: number
  maxLength?: number
  pattern?: string
  placeholder?: string
  default?: CodeFormValue
  /** number | integer */
  minimum?: number
  maximum?: number
  /** multiselect */
  minItems?: number
  maxItems?: number
  /** string | multiselect */
  options?: CodeFormOption[]
  custom?: boolean
  /** external */
  url?: string
}

export interface CodeFormRequest {
  id: string
  sessionId: string
  title: string
  fields: CodeFormField[]
  createdAt: number
}

// ---------------------------------------------------------------------------
// Live agent activity stream
// ---------------------------------------------------------------------------

export type CodeActivityType =
  | 'text-delta'
  | 'text-end'
  | 'reasoning-delta'
  | 'reasoning-end'
  | 'tool-input'
  | 'tool-called'
  | 'tool-progress'
  | 'tool-success'
  | 'tool-failed'
  | 'shell-started'
  | 'shell-ended'
  | 'file-edited'
  | 'step-started'
  | 'step-ended'
  | 'compaction'
  | 'status'
  | 'usage'
  | 'model-selected'
  | 'agent-selected'
  | 'error'
  | 'done'

export interface CodeUsage {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  cost?: number
}

export interface CodeActivityEvent {
  sessionId: string
  type: CodeActivityType
  /** Stable id for coalescing streaming text/reasoning. */
  partId?: string
  messageId?: string
  callId?: string
  delta?: string
  text?: string
  toolName?: string
  command?: string
  file?: string
  title?: string
  status?: CodeSessionStatus
  output?: string
  error?: string
  usage?: CodeUsage
  /** Raw tool arguments as JSON (from tool input events). */
  input?: string
  /** Tool-specific structured data (progress/result metadata). */
  metadata?: Record<string, unknown>
  /** Selected model ref, for model-selected events. */
  model?: CodeModelRef
  /** Selected agent id, for agent-selected events. */
  agent?: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Persisted (non-secret) settings, stored inside AppConfig
// ---------------------------------------------------------------------------

export interface CodePermissionSettings {
  edit: CodePermissionEffect
  bash: CodePermissionEffect
  external_directory: CodePermissionEffect
  webfetch: CodePermissionEffect
}

export interface CodeSettings {
  /** Start the OpenCode runtime when the app is ready instead of on first use. */
  autoStart: boolean
  /** Model selector, e.g. `opencode-go/kimi-k3` / empty = provider default. */
  defaultModel: string
  /** Reasoning variant id, empty = model default. */
  defaultVariant: string
  permission: CodePermissionSettings
  /** Explicit loopback port; 0 = pick a free port automatically. */
  serverPort: number
}

export const DEFAULT_CODE_PERMISSIONS: CodePermissionSettings = {
  edit: 'ask',
  bash: 'ask',
  external_directory: 'ask',
  webfetch: 'allow'
}

export const DEFAULT_CODE_SETTINGS: CodeSettings = {
  autoStart: false,
  defaultModel: '',
  defaultVariant: '',
  permission: { ...DEFAULT_CODE_PERMISSIONS },
  serverPort: 0
}

export const CODE_PERMISSION_EFFECTS: CodePermissionEffect[] = ['allow', 'ask', 'deny']

export const CODE_PROVIDER_ID = 'opencode-go'

// ---------------------------------------------------------------------------
// Transcript (projected message history for a session)
// ---------------------------------------------------------------------------

export type CodeTranscriptRole = 'user' | 'assistant' | 'system' | 'shell' | 'compaction' | 'other'

export interface CodeTranscriptTool {
  callId: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'error'
  input?: string
  output?: string
  title?: string
  error?: string
}

export interface CodeTranscriptItem {
  id: string
  role: CodeTranscriptRole
  text: string
  reasoning?: string
  tools?: CodeTranscriptTool[]
  agent?: string
  model?: CodeModelRef
  createdAt?: number
  cost?: number
  error?: string
}

// ---------------------------------------------------------------------------
// Runtime setup progress (e.g. provisioning OpenCode on a remote machine)
// ---------------------------------------------------------------------------

export type CodeRuntimePhase =
  | 'connecting'
  | 'checking'
  | 'downloading'
  | 'uploading'
  | 'starting'
  | 'waiting'
  | 'ready'
  | 'error'

export interface CodeRuntimeProgress {
  connectionId: string
  connectionName: string
  phase: CodeRuntimePhase
  message: string
  /** 0..1 for determinate phases (download); null when indeterminate. */
  percent?: number | null
  timestamp: number
}

/** Events pushed from the main-process code engine to the Code window. */
export type CodeEngineEvent =
  | { kind: 'activity'; event: CodeActivityEvent }
  | { kind: 'permission'; request: CodePermissionRequest }
  | { kind: 'permission-replied'; sessionId: string; requestId: string }
  | { kind: 'form'; form: CodeFormRequest }
  | { kind: 'form-settled'; sessionId: string; formId: string }
  | { kind: 'diff'; sessionId: string; diff: CodeFileDiff[] }
  | { kind: 'session'; session: CodeSession }
  | { kind: 'progress'; progress: CodeRuntimeProgress }
