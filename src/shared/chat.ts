export type ChatRole = 'system' | 'user' | 'assistant'

export type InputImageContent = { type: 'input_image'; image_url: string }
export type InputTextContent = { type: 'input_text'; text: string }
export type InputContent = InputTextContent | InputImageContent

export interface ChatMessageImage {
  base64: string
  fileName: string
  mimeType: string
}

export interface Source {
  title: string
  url: string
}

export type ReasoningStep =
  | { type: 'reasoning'; text: string }
  | { type: 'web_search'; id: string; query: string; status: 'searching' | 'done'; sources: Source[] }
  | {
      type: 'tool'
      id: string
      name: string
      serverName?: string
      query?: string
      status: 'running' | 'done' | 'error'
      content?: string
    }

export interface ChatUsage {
  promptTokens?: number
  cachedPromptTokens?: number
  cacheWritePromptTokens?: number
  completionTokens?: number
  totalTokens?: number
  reasoningTokens?: number
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  reasoning?: string
  reasoningTitle?: string
  steps?: ReasoningStep[]
  usage?: ChatUsage
  model?: string
  sources?: Source[]
  stopped?: boolean
  images?: ChatMessageImage[]
}

export interface ChatConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  systemPrompt?: string
}

export type ChatStreamEventType =
  | 'content'
  | 'reasoning'
  | 'done'
  | 'error'
  | 'reasoning-start'
  | 'reasoning-title'
  | 'reasoning-delta'
  | 'reasoning-end'
  | 'tool-start'
  | 'tool-query'
  | 'tool-result'
  | 'sources'

export interface ChatStreamEvent {
  id: string
  type: ChatStreamEventType
  delta?: string
  usage?: ChatUsage
  error?: string
  model?: string
  itemId?: string
  title?: string
  toolType?: string
  toolName?: string
  actionType?: string
  query?: string
  serverName?: string
  status?: 'running' | 'done' | 'error'
  content?: string
  sources?: Source[]
  stopped?: boolean
}

export const CHAT_ROLE_SET = new Set<ChatRole>(['system', 'user', 'assistant'])

export type SanitizedMessageContent =
  | string
  | Array<{ type: string; text?: string; image_url?: string }>

export interface SanitizedMessage {
  role: ChatRole
  content: string | InputContent[]
}