import { describe, expect, it } from 'vitest'
import type { ChatConversation, ChatMessage } from '../../../../shared/chat/chat'
import {
  buildSearchMatches,
  countOccurrences,
  buildSearchSnippet,
  formatConversationRowTimestamp,
  groupConversationsByDay,
  groupConversationsByRecency,
  resolveSubmitSystemPrompt,
  sortConversations
} from './chat'

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

describe('conversation history grouping', () => {
  const NOW = new Date(2026, 9, 31, 15, 0, 0).getTime()
  const at = (daysAgo: number, hour = 10): number => {
    const date = new Date(2026, 9, 31, hour, 0, 0)
    date.setDate(date.getDate() - daysAgo)
    return date.getTime()
  }

  function datedConversation(id: string, updatedAt: number): ChatConversation {
    return { id, title: id, createdAt: updatedAt, updatedAt, messages: [] }
  }

  it('buckets by calendar day and drops empty groups', () => {
    const conversations = [
      datedConversation('today', at(0)),
      datedConversation('yesterday', at(1)),
      datedConversation('week', at(4)),
      datedConversation('month', at(12)),
      datedConversation('old', at(90))
    ]

    const groups = groupConversationsByRecency(conversations, NOW)

    expect(groups.map((group) => group.label)).toEqual([
      'Today',
      'Yesterday',
      'Previous 7 days',
      'Previous 30 days',
      'Older'
    ])
    expect(groups.map((group) => group.conversations.map((item) => item.id))).toEqual([
      ['today'],
      ['yesterday'],
      ['week'],
      ['month'],
      ['old']
    ])
  })

  it('keeps newest-first order inside a group', () => {
    const groups = groupConversationsByRecency(
      [datedConversation('older', at(0, 8)), datedConversation('newer', at(0, 14))],
      NOW
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].conversations.map((item) => item.id)).toEqual(['newer', 'older'])
  })

  it('returns no groups for an empty history', () => {
    expect(groupConversationsByRecency([], NOW)).toEqual([])
  })

  it('formats row timestamps relative to the bucket', () => {
    expect(formatConversationRowTimestamp(at(0, 9), NOW)).toMatch(/^\d{2}:\d{2}$/)
    expect(formatConversationRowTimestamp(at(1), NOW)).toBe('Yesterday')
    expect(formatConversationRowTimestamp(at(3), NOW)).toMatch(/^[A-Z][a-z]{2}$/)
    expect(formatConversationRowTimestamp(at(20), NOW)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)
  })

  it('sorts conversations without mutating the input', () => {
    const a = datedConversation('a', at(2))
    const b = datedConversation('b', at(0))
    const input = [a, b]

    expect(sortConversations(input).map((item) => item.id)).toEqual(['b', 'a'])
    expect(input.map((item) => item.id)).toEqual(['a', 'b'])
  })
})

describe('conversation day grouping', () => {
  const NOW = new Date(2026, 9, 31, 15, 0, 0).getTime()
  const at = (daysAgo: number, hour = 10): number => {
    const date = new Date(2026, 9, 31, hour, 0, 0)
    date.setDate(date.getDate() - daysAgo)
    return date.getTime()
  }

  function datedConversation(id: string, updatedAt: number): ChatConversation {
    return { id, title: id, createdAt: updatedAt, updatedAt, messages: [] }
  }

  it('groups by calendar day, newest first, with no empty groups', () => {
    const groups = groupConversationsByDay(
      [
        datedConversation('old', at(3, 9)),
        datedConversation('today-early', at(0, 8)),
        datedConversation('today-late', at(0, 14)),
        datedConversation('yesterday', at(1, 12))
      ],
      NOW
    )

    expect(groups).toHaveLength(3)
    expect(groups[0].label).toBe('Today')
    expect(groups[1].label).toBe('Yesterday')
    expect(groups[2].label).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/)
    expect(groups.map((group) => group.conversations.map((item) => item.id))).toEqual([
      ['today-late', 'today-early'],
      ['yesterday'],
      ['old']
    ])
    // The day key is stable and local (not a UTC ISO timestamp).
    expect(groups[0].key).toBe('2026-10-31')
    expect(groups[1].key).toBe('2026-10-30')
  })

  it('adds the year to labels from another year', () => {
    const now = new Date(2026, 0, 5, 12, 0, 0).getTime()
    const groups = groupConversationsByDay(
      [datedConversation('december', new Date(2025, 11, 30, 10, 0, 0).getTime())],
      now
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].label).toMatch(/2025$/)
  })

  it('returns no groups for an empty history', () => {
    expect(groupConversationsByDay([], NOW)).toEqual([])
  })

  it('does not mutate the input order', () => {
    const input = [datedConversation('older', at(0, 8)), datedConversation('newer', at(0, 14))]
    groupConversationsByDay(input, NOW)

    expect(input.map((item) => item.id)).toEqual(['older', 'newer'])
  })
})

describe('submit system prompt resolution', () => {
  it('never inherits the previous instruction into a new conversation', () => {
    expect(
      resolveSubmitSystemPrompt({
        isNewConversation: true,
        mentionsInstruction: false,
        composerPrompt: 'Previous instruction',
        conversationPrompt: 'Previous instruction'
      })
    ).toBe('')
  })

  it('keeps an instruction explicitly mentioned in the composer', () => {
    expect(
      resolveSubmitSystemPrompt({
        isNewConversation: true,
        mentionsInstruction: true,
        composerPrompt: '  New instruction  '
      })
    ).toBe('New instruction')
  })

  it('prefers the composer instruction inside an existing conversation', () => {
    expect(
      resolveSubmitSystemPrompt({
        isNewConversation: false,
        mentionsInstruction: false,
        composerPrompt: 'New instruction',
        conversationPrompt: 'Old instruction'
      })
    ).toBe('New instruction')
  })

  it('falls back to the conversation instruction for follow-ups', () => {
    expect(
      resolveSubmitSystemPrompt({
        isNewConversation: false,
        mentionsInstruction: false,
        conversationPrompt: ' Stored instruction '
      })
    ).toBe('Stored instruction')
  })

  it('returns an empty string when nothing is selected', () => {
    expect(
      resolveSubmitSystemPrompt({ isNewConversation: false, mentionsInstruction: false })
    ).toBe('')
  })
})
