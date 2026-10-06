import type { CodeStatus } from '../../../shared/code/code'

export type CodeStatusWithKey = CodeStatus & { hasApiKey: boolean }

export interface ToolCard {
  callId: string
  name: string
  status: 'running' | 'completed' | 'error'
  input?: string
  output?: string
  title?: string
  error?: string
  metadata?: Record<string, unknown>
}

export interface Note {
  id: string
  text: string
  tone: 'info' | 'error' | 'file' | 'shell'
}

export interface StreamingState {
  text: string
  reasoning: string
  tools: ToolCard[]
  notes: Note[]
  busy: boolean
  error?: string
}

export const EMPTY_STREAM: StreamingState = {
  text: '',
  reasoning: '',
  tools: [],
  notes: [],
  busy: false
}

export function noteId(): string {
  return Math.random().toString(36).slice(2)
}
