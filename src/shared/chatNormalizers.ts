import { randomUUID } from 'crypto'
import {
  CHAT_ROLE_SET,
  type ChatConversation,
  type ChatMessage,
  type ChatRole,
  type ChatUsage,
  type ReasoningStep,
  type Source
} from './chat'

export function normalizeChatUsage(payload: unknown): ChatUsage | undefined {
  if (!payload || typeof payload !== 'object') return undefined

  const raw = payload as Partial<ChatUsage>
  const promptTokens =
    typeof raw.promptTokens === 'number' && Number.isFinite(raw.promptTokens)
      ? raw.promptTokens
      : undefined
  const completionTokens =
    typeof raw.completionTokens === 'number' && Number.isFinite(raw.completionTokens)
      ? raw.completionTokens
      : undefined
  const totalTokens =
    typeof raw.totalTokens === 'number' && Number.isFinite(raw.totalTokens)
      ? raw.totalTokens
      : undefined

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens
  }
}

export function normalizeSources(payload: unknown): Source[] | undefined {
  if (!Array.isArray(payload)) return undefined

  const sources = payload
    .map((item): Source | null => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      const url = typeof raw.url === 'string' ? raw.url.trim() : ''
      if (!url) return null
      const title = typeof raw.title === 'string' ? raw.title.trim() : ''
      return { title, url }
    })
    .filter((source): source is Source => Boolean(source))

  return sources.length > 0 ? sources : undefined
}

export function normalizeReasoningSteps(payload: unknown): ReasoningStep[] | undefined {
  if (!Array.isArray(payload)) return undefined

  const steps = payload
    .map((item): ReasoningStep | null => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      if (raw.type === 'reasoning') {
        const text = typeof raw.text === 'string' ? raw.text : ''
        if (!text) return null
        return { type: 'reasoning', text }
      }
      if (raw.type === 'web_search') {
        const id = typeof raw.id === 'string' ? raw.id : ''
        if (!id) return null
        const query = typeof raw.query === 'string' ? raw.query : ''
        const status = raw.status === 'done' ? 'done' : 'searching'
        const sources = normalizeSources(raw.sources) ?? []
        return { type: 'web_search', id, query, status, sources }
      }
      return null
    })
    .filter((step): step is ReasoningStep => Boolean(step))

  return steps.length > 0 ? steps : undefined
}

export function normalizeChatMessage(payload: Partial<ChatMessage>): ChatMessage | null {
  const role = typeof payload.role === 'string' ? payload.role.trim() : ''
  if (!CHAT_ROLE_SET.has(role as ChatRole)) return null

  const content = typeof payload.content === 'string' ? payload.content.trim() : ''
  if (!content) return null

  const createdAt =
    typeof payload.createdAt === 'number' && Number.isFinite(payload.createdAt)
      ? payload.createdAt
      : Date.now()

  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID()

  const reasoning =
    typeof payload.reasoning === 'string' && payload.reasoning.trim() ? payload.reasoning.trim() : undefined
  const reasoningTitle =
    typeof payload.reasoningTitle === 'string' && payload.reasoningTitle.trim()
      ? payload.reasoningTitle.trim()
      : undefined
  const steps = normalizeReasoningSteps(payload.steps)
  const usage = normalizeChatUsage(payload.usage)
  const model = typeof payload.model === 'string' && payload.model.trim() ? payload.model.trim() : undefined
  const sources = normalizeSources(payload.sources)
  const stopped = payload.stopped === true ? true : undefined

  return {
    id,
    role: role as ChatRole,
    content,
    createdAt,
    reasoning,
    reasoningTitle,
    steps,
    usage,
    model,
    sources,
    stopped
  }
}

export function normalizeConversation(payload: Partial<ChatConversation>): ChatConversation {
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID()
  const title = typeof payload.title === 'string' ? payload.title.trim() : ''
  const normalizedTitle = title || 'New chat'
  const createdAt =
    typeof payload.createdAt === 'number' && Number.isFinite(payload.createdAt)
      ? payload.createdAt
      : Date.now()
  const updatedAt =
    typeof payload.updatedAt === 'number' && Number.isFinite(payload.updatedAt)
      ? payload.updatedAt
      : createdAt
  const systemPrompt =
    typeof payload.systemPrompt === 'string' && payload.systemPrompt.trim()
      ? payload.systemPrompt.trim()
      : undefined

  const rawMessages = Array.isArray(payload.messages) ? payload.messages : []
  const normalizedMessages = rawMessages
    .map((message) => normalizeChatMessage(message))
    .filter((message): message is ChatMessage => Boolean(message))

  return {
    id,
    title: normalizedTitle,
    createdAt,
    updatedAt,
    messages: normalizedMessages,
    systemPrompt
  }
}