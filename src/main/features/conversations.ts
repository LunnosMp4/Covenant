import type { ChatConversation } from '../../shared/chat/chat'
import { normalizeConversation } from '../../shared/chat/chatNormalizers'
import { appStore } from '../store/appStore'

const MAX_CONVERSATIONS = 20

export function getConversations(): ChatConversation[] {
  const conversations = appStore.get('conversations', [])
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveConversation(payload: Partial<ChatConversation>): ChatConversation[] {
  const normalizedConversation = normalizeConversation(payload)
  const existing = getConversations().filter((conversation) => conversation.id !== normalizedConversation.id)
  const nextConversations = [normalizedConversation, ...existing]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS)

  appStore.set('conversations', nextConversations)
  return nextConversations
}

export function deleteConversation(id: string): ChatConversation[] {
  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId) {
    return getConversations()
  }

  const nextConversations = getConversations().filter((conversation) => conversation.id !== normalizedId)
  appStore.set('conversations', nextConversations)
  return nextConversations
}
