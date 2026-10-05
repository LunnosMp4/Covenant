import { describe, expect, it } from 'vitest'
import type { ChatConversation, ChatMessage, ChatRole } from './chat'
import {
  normalizeChatMessage,
  normalizeChatUsage,
  normalizeConversation,
  normalizeReasoningSteps,
  normalizeSources
} from './chatNormalizers'

describe('normalizeChatUsage', () => {
  it('returns undefined for non-object or empty input', () => {
    expect(normalizeChatUsage(undefined)).toBeUndefined()
    expect(normalizeChatUsage('x')).toBeUndefined()
    expect(normalizeChatUsage({})).toBeUndefined()
  })

  it('keeps numeric token fields', () => {
    expect(normalizeChatUsage({ promptTokens: 10, completionTokens: 5, totalTokens: 15 })).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15
    })
  })

  it('returns undefined when all fields are invalid', () => {
    expect(normalizeChatUsage({ promptTokens: 'x', totalTokens: Number.NaN })).toBeUndefined()
  })
})

describe('normalizeSources', () => {
  it('returns undefined for non-array input', () => {
    expect(normalizeSources(undefined)).toBeUndefined()
    expect(normalizeSources([])).toBeUndefined()
  })

  it('trims fields and drops sources without a url', () => {
    expect(normalizeSources([{ title: ' A ', url: ' http://a ' }, { title: 'no url' }])).toEqual([
      { title: 'A', url: 'http://a' }
    ])
  })
})

describe('normalizeReasoningSteps', () => {
  it('returns undefined for non-array input', () => {
    expect(normalizeReasoningSteps(undefined)).toBeUndefined()
    expect(normalizeReasoningSteps([])).toBeUndefined()
  })

  it('normalizes reasoning steps (preserving whitespace)', () => {
    expect(normalizeReasoningSteps([{ type: 'reasoning', text: ' think ' }])).toEqual([
      { type: 'reasoning', text: ' think ' }
    ])
  })

  it('defaults web_search status to searching and preserves sources', () => {
    const steps = normalizeReasoningSteps([
      {
        type: 'web_search',
        id: 'w1',
        query: 'hello',
        sources: [{ url: 'http://x', title: 'X' }]
      }
    ])
    expect(steps).toEqual([
      { type: 'web_search', id: 'w1', query: 'hello', status: 'searching', sources: [{ url: 'http://x', title: 'X' }] }
    ])
  })

  it('keeps done status when provided', () => {
    const steps = normalizeReasoningSteps([{ type: 'web_search', id: 'w2', query: 'q', status: 'done' }])
    expect(steps?.[0]).toMatchObject({ status: 'done' })
  })

  it('filters invalid steps', () => {
    expect(normalizeReasoningSteps([{ type: 'reasoning', text: '' }, { type: 'web_search', id: '' }, 'x'])).toBeUndefined()
  })
})

describe('normalizeChatMessage', () => {
  it('returns null for invalid role or empty content', () => {
    expect(normalizeChatMessage({ role: 'admin' as ChatRole, content: 'hi' })).toBeNull()
    expect(normalizeChatMessage({ role: 'user', content: '   ' })).toBeNull()
    expect(normalizeChatMessage({ role: 'user' })).toBeNull()
  })

  it('trims content and generates missing id/createdAt', () => {
    const message = normalizeChatMessage({ role: 'user', content: '  hello  ' })
    expect(message).not.toBeNull()
    expect(message?.role).toBe('user')
    expect(message?.content).toBe('hello')
    expect(message?.id).toBeDefined()
    expect(typeof message?.createdAt).toBe('number')
  })

  it('preserves provided id, model and stopped flag', () => {
    const message = normalizeChatMessage({ role: 'assistant', content: 'x', id: 'm1', model: 'gpt-5', stopped: true })
    expect(message?.id).toBe('m1')
    expect(message?.model).toBe('gpt-5')
    expect(message?.stopped).toBe(true)
  })
})

describe('normalizeConversation', () => {
  it('uses New chat title and defaults timestamps', () => {
    const conversation = normalizeConversation({})
    expect(conversation.title).toBe('New chat')
    expect(conversation.messages).toEqual([])
    expect(typeof conversation.createdAt).toBe('number')
    expect(conversation.updatedAt).toBe(conversation.createdAt)
  })

  it('trims title and filters invalid messages', () => {
    const conversation = normalizeConversation({
      id: 'c1',
      title: '  My chat  ',
      messages: [
        { role: 'user', content: '  valid  ' },
        { role: 'user', content: '' }
      ]
    } as Partial<ChatConversation>)
    expect(conversation.id).toBe('c1')
    expect(conversation.title).toBe('My chat')
    expect(conversation.messages).toHaveLength(1)
    expect(conversation.messages[0]?.content).toBe('valid')
  })
})