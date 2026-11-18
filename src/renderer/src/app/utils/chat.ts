import type { ChatConversation, ChatMessage, ChatRole } from '../../../../shared/chat/chat'
import type { Preprompt } from '../../../../shared/domain/preprompt'
import { describeUiSpec } from '../../../../shared/ui/describe'
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

export interface ConversationGroup {
  label: string
  conversations: ChatConversation[]
}

const DAY_MS = 86_400_000

const ROW_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})
const ROW_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const ROW_MONTH_DAY_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const ROW_FULL_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric'
})
const DAY_LABEL_WITH_YEAR_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Whole calendar days between `timestamp` and `now` (today = 0, yesterday = 1). */
function daysBefore(timestamp: number, now: number): number {
  return Math.round((startOfDay(now) - startOfDay(timestamp)) / DAY_MS)
}

/**
 * Buckets conversations the way people remember them — calendar days, not
 * rolling hours — so the history reads as "Today / Yesterday / older".
 * Empty buckets are dropped and each bucket keeps newest-first order.
 */
export function groupConversationsByRecency(
  conversations: ChatConversation[],
  now = Date.now()
): ConversationGroup[] {
  const groups: ConversationGroup[] = [
    { label: 'Today', conversations: [] },
    { label: 'Yesterday', conversations: [] },
    { label: 'Previous 7 days', conversations: [] },
    { label: 'Previous 30 days', conversations: [] },
    { label: 'Older', conversations: [] }
  ]

  for (const conversation of sortConversations(conversations)) {
    const days = daysBefore(conversation.updatedAt, now)
    const group =
      days <= 0
        ? groups[0]
        : days === 1
          ? groups[1]
          : days <= 7
            ? groups[2]
            : days <= 30
              ? groups[3]
              : groups[4]
    group.conversations.push(conversation)
  }

  return groups.filter((group) => group.conversations.length > 0)
}

/**
 * Compact timestamp for a history row. The bucket header already carries the
 * day for older entries, so only the time (today) or the weekday (this week)
 * needs to be repeated.
 */
export function formatConversationRowTimestamp(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp)
  const days = daysBefore(timestamp, now)

  if (days <= 0) return ROW_TIME_FORMATTER.format(date)
  if (days === 1) return 'Yesterday'
  if (days <= 7) return ROW_WEEKDAY_FORMATTER.format(date)
  if (date.getFullYear() === new Date(now).getFullYear()) {
    return ROW_MONTH_DAY_FORMATTER.format(date)
  }
  return ROW_FULL_DATE_FORMATTER.format(date)
}

export interface ConversationDayGroup {
  /** Stable key for the local calendar day (`YYYY-MM-DD`). */
  key: string
  label: string
  conversations: ChatConversation[]
}

/** Local (not UTC) day key so a conversation never moves to the wrong group. */
function dayKey(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function formatConversationDayLabel(timestamp: number, now = Date.now()): string {
  const days = daysBefore(timestamp, now)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'

  const date = new Date(timestamp)
  return date.getFullYear() === new Date(now).getFullYear()
    ? DAY_LABEL_FORMATTER.format(date)
    : DAY_LABEL_WITH_YEAR_FORMATTER.format(date)
}

/**
 * Groups conversations by calendar day (newest first), one group per day.
 *
 * The wide-chat history rail shows every day instead of the recency buckets the
 * popover uses, so the date is a real anchor rather than a coarse label.
 * `sortConversations` guarantees descending `updatedAt`, which means each day
 * is contiguous: grouping only needs to compare against the previous entry.
 */
export function groupConversationsByDay(
  conversations: ChatConversation[],
  now = Date.now()
): ConversationDayGroup[] {
  const groups: ConversationDayGroup[] = []
  let currentKey: string | null = null

  for (const conversation of sortConversations(conversations)) {
    const dayStart = startOfDay(conversation.updatedAt)
    const key = dayKey(dayStart)

    if (key === currentKey && groups.length > 0) {
      groups[groups.length - 1].conversations.push(conversation)
      continue
    }

    currentKey = key
    groups.push({
      key,
      label: formatConversationDayLabel(dayStart, now),
      conversations: [conversation]
    })
  }

  return groups
}

export interface SubmitSystemPromptInput {
  /** True when the submit will create a conversation instead of continuing one. */
  isNewConversation: boolean
  /** True when the composer currently holds an `@instruction` chip. */
  mentionsInstruction: boolean
  composerPrompt?: string | null
  conversationPrompt?: string | null
}

/**
 * Decides which system prompt a submitted prompt carries.
 *
 * A brand-new conversation only inherits an instruction the user explicitly
 * mentioned in the composer. Otherwise the instruction stored on the previous
 * conversation would leak into every new thread after closing it. Existing
 * conversations keep their stored prompt for follow-up messages.
 */
export function resolveSubmitSystemPrompt({
  isNewConversation,
  mentionsInstruction,
  composerPrompt,
  conversationPrompt
}: SubmitSystemPromptInput): string {
  const composer = composerPrompt?.trim() ?? ''
  if (isNewConversation) {
    return mentionsInstruction ? composer : ''
  }
  return composer || conversationPrompt?.trim() || ''
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
  if (message.parts && message.parts.length > 0) {
    parts.push(...message.parts.map((part) => describeUiSpec(part.surface.spec)))
  }
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
