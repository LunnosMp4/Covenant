// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ChatConversation } from '../../../shared/chat/chat'
import ChatHistorySidebar from './ChatHistorySidebar'

afterEach(() => {
  cleanup()
})

const DAY_MS = 86_400_000

function conversation(id: string, title: string, updatedAt: number): ChatConversation {
  return { id, title, createdAt: updatedAt, updatedAt, messages: [] }
}

const conversations = [
  conversation('a', 'Alpha', Date.now()),
  conversation('b', 'Bravo', Date.now() - DAY_MS)
]

function renderSidebar(overrides: Partial<Parameters<typeof ChatHistorySidebar>[0]> = {}) {
  const onSelect = vi.fn()
  const onDelete = vi.fn()
  const onNewChat = vi.fn()

  render(
    <ChatHistorySidebar
      conversations={conversations}
      activeConversationId="a"
      onSelect={onSelect}
      onDelete={onDelete}
      onNewChat={onNewChat}
      newChatDisabled={false}
      {...overrides}
    />
  )

  return { onSelect, onDelete, onNewChat }
}

describe('ChatHistorySidebar', () => {
  it('groups conversations under day headers', () => {
    renderSidebar()

    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Yesterday')).toBeTruthy()

    const active = screen.getByText('Alpha').closest('[aria-current]')
    expect(active?.getAttribute('aria-current')).toBe('true')
  })

  it('selects and deletes conversations', () => {
    const { onSelect, onDelete } = renderSidebar()

    fireEvent.click(screen.getByText('Bravo'))
    expect(onSelect).toHaveBeenCalledWith(conversations[1])

    fireEvent.click(screen.getByLabelText('Delete Alpha'))
    expect(onDelete).toHaveBeenCalledWith(conversations[0])
  })

  it('starts a new chat, and blocks it while a response streams', () => {
    const { onNewChat } = renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: /new chat/i }))
    expect(onNewChat).toHaveBeenCalledTimes(1)

    cleanup()
    renderSidebar({ newChatDisabled: true })
    expect(
      screen.getByRole('button', { name: /new chat/i }).hasAttribute('disabled')
    ).toBe(true)
  })

  it('shows an empty state when history is empty', () => {
    renderSidebar({ conversations: [] })
    expect(screen.getByText('No conversations yet')).toBeTruthy()
  })
})
