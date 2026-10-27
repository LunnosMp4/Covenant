import type { ChatConversation, ChatMessage, ChatRole } from '../../../../shared/chat/chat'
import type { Preprompt } from '../../../../shared/domain/preprompt'
import type { SelectedSystemPrompt } from '../types'

export const MAX_CONVERSATION_TITLE_LENGTH = 48
export const DEFAULT_CONVERSATION_TITLE = 'New chat'
export const CHAT_ROLE_ORDER: ChatRole[] = ['system', 'user', 'assistant']

export function createConversationTitle(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return DEFAULT_CONVERSATION_TITLE
  const firstLine = trimmed.split('\n')[0] || trimmed
  if (firstLine.length <= MAX_CONVERSATION_TITLE_LENGTH) return firstLine
  return `${firstLine.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 3)}...`
}

export function createSelectedSystemPrompt(preprompt: Preprompt): SelectedSystemPrompt {
  return {
    id: preprompt.id,
    title: preprompt.title,
    content: preprompt.content
  }
}

export function createCustomSystemPromptSelection(conversationId: string, content: string): SelectedSystemPrompt {
  return {
    id: `conversation-${conversationId}`,
    title: 'Custom system prompt',
    content
  }
}

export function sortConversations(conversations: ChatConversation[]): ChatConversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function normalizeMessageOrder(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    return CHAT_ROLE_ORDER.indexOf(a.role) - CHAT_ROLE_ORDER.indexOf(b.role)
  })
}

export interface SearchMatch {
  conversationId: string
  conversationTitle: string
  messageId: string
  role: ChatRole
  snippet: string
  count: number
}

export interface SearchGroup {
  conversationId: string
  conversationTitle: string
  matches: SearchMatch[]
}

export function getMessageSearchText(message: ChatMessage): string {
  const parts = [message.content]
  if (message.reasoning?.trim()) {
    parts.push(message.reasoning.trim())
  }
  return parts.join('\n')
}

export function countOccurrences(text: string, query: string): number {
  return countOccurrencesIn(text.toLowerCase(), query.toLowerCase())
}

function countOccurrencesIn(lowerText: string, lowerQuery: string): number {
  if (!lowerQuery) return 0
  let count = 0
  let index = lowerText.indexOf(lowerQuery)
  while (index !== -1) {
    count += 1
    index = lowerText.indexOf(lowerQuery, index + lowerQuery.length)
  }
  return count
}

export function buildSearchSnippet(text: string, query: string, maxLength = 96): string {
  return buildSearchSnippetFromLower(text, text.toLowerCase(), query.toLowerCase(), maxLength)
}

function buildSearchSnippetFromLower(
  text: string,
  lowerText: string,
  lowerQuery: string,
  maxLength = 96
): string {
  const index = lowerQuery ? lowerText.indexOf(lowerQuery) : -1
  if (index === -1) {
    return text.replace(/\s+/g, ' ').trim().slice(0, maxLength)
  }

  const start = Math.max(0, index - 28)
  const end = Math.min(text.length, index + lowerQuery.length + 28)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${prefix}${snippet}${suffix}`
}

interface CachedMessageSearchText {
  text: string
  lower: string
}

/**
 * Per-message search text cache.
 *
 * Chat search re-scans every message of every conversation on each keystroke
 * (and on each streamed token while the panel is open). Message objects are
 * immutable except for the one being streamed, so caching the joined text and
 * its lowercase form in a WeakMap removes the repeated string building and
 * `toLowerCase()` work without changing the results.
 */
const messageSearchTextCache = new WeakMap<ChatMessage, CachedMessageSearchText>()

function getCachedMessageSearchText(message: ChatMessage): CachedMessageSearchText {
  const cached = messageSearchTextCache.get(message)
  if (cached) return cached

  const text = getMessageSearchText(message)
  const entry: CachedMessageSearchText = { text, lower: text.toLowerCase() }
  messageSearchTextCache.set(message, entry)
  return entry
}

/** Sorts only when the messages are not already in display order. */
function ensureMessageOrder(messages: ChatMessage[]): ChatMessage[] {
  for (let index = 1; index < messages.length; index += 1) {
    if (messages[index - 1].createdAt > messages[index].createdAt) {
      return normalizeMessageOrder(messages)
    }
  }
  return messages
}

export function buildSearchMatches(
  conversations: ChatConversation[],
  activeConversation: ChatConversation | null,
  query: string
): SearchMatch[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const lowerQuery = trimmed.toLowerCase()
  const allConversations = [...conversations]
  if (activeConversation && !allConversations.some((item) => item.id === activeConversation.id)) {
    allConversations.unshift(activeConversation)
  }

  const matches: SearchMatch[] = []
  for (const conversation of allConversations) {
    for (const message of ensureMessageOrder(conversation.messages)) {
      const { text, lower } = getCachedMessageSearchText(message)
      const count = countOccurrencesIn(lower, lowerQuery)
      if (count <= 0) continue

      matches.push({
        conversationId: conversation.id,
        conversationTitle: conversation.title || DEFAULT_CONVERSATION_TITLE,
        messageId: message.id,
        role: message.role,
        snippet: buildSearchSnippetFromLower(text, lower, lowerQuery),
        count
      })
    }
  }

  return matches
}
