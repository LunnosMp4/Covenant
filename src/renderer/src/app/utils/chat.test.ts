import { describe, expect, it } from 'vitest'
import type { ChatConversation, ChatMessage } from '../../../../shared/chat/chat'
import { buildSearchMatches, countOccurrences, buildSearchSnippet } from './chat'

function message(id: string, role: ChatMessage['role'], content: string, createdAt: number): ChatMessage {
  return { id, role, content, createdAt }
}

function conversation(id: string, messages: ChatMessage[]): ChatConversation {
  return { id, title: id, createdAt: 1, updatedAt: 1, messages }
}

describe('chat search', () => {
  it('counts non-overlapping occurrences', () => {
    expect(countOccurrences('aaaa', 'aa')).toBe(2)
    expect(countOccurrences('abc', 'z')).toBe(0)
    expect(countOccurrences('abc', '')).toBe(0)
  })

  it('builds a snippet around the match with ellipses', () => {
    const text = `${'x'.repeat(60)}needle${'y'.repeat(60)}`
    const snippet = buildSearchSnippet(text, 'needle')
    expect(snippet).toContain('needle')
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
  })

  it('finds matches across every conversation', () => {
    const conversations = [
      conversation('c1', [message('m1', 'user', 'alpha needle beta', 1)]),
      conversation('c2', [message('m2', 'assistant', 'no match here', 2)])
    ]

    const matches = buildSearchMatches(conversations, null, 'needle')
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ conversationId: 'c1', messageId: 'm1', count: 1 })
  })

  it('searches reasoning as well as content', () => {
    const conversations = [
      conversation('c1', [
        { ...message('m1', 'assistant', 'content', 1), reasoning: 'reasoning needle' }
      ])
    ]

    expect(buildSearchMatches(conversations, null, 'needle')).toHaveLength(1)
  })

  it('keeps message order stable and returns identical results when repeated', () => {
    const conversations = [
      conversation('c1', [
        message('m2', 'assistant', 'needle two', 20),
        message('m1', 'user', 'needle one', 10)
      ])
    ]

    const first = buildSearchMatches(conversations, null, 'needle')
    const second = buildSearchMatches(conversations, null, 'needle')

    expect(first.map((match) => match.messageId)).toEqual(['m1', 'm2'])
    expect(second).toEqual(first)
  })

  it('includes the active conversation when it is not in the history list', () => {
    const active = conversation('active', [message('m1', 'user', 'needle', 1)])
    expect(buildSearchMatches([], active, 'needle')).toHaveLength(1)
  })

  it('returns no matches for an empty query', () => {
    const conversations = [conversation('c1', [message('m1', 'user', 'needle', 1)])]
    expect(buildSearchMatches(conversations, null, '   ')).toEqual([])
  })
})
