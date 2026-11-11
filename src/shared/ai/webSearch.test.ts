import { describe, expect, it } from 'vitest'
import type { AiModelOption } from './models'
import {
  resolveWebSearchProviderChoice,
  webSearchProviderLabel
} from './webSearch'

function model(overrides: Partial<AiModelOption> = {}): AiModelOption {
  return {
    provider: 'opencode',
    id: 'gpt-6-luna',
    label: 'GPT-6 Luna',
    maxContextTokens: 1_000_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: [],
    supportsTemperature: false,
    supportsVision: true,
    webSearch: 'native',
    ...overrides
  }
}

describe('resolveWebSearchProviderChoice', () => {
  it('keeps an explicit provider unchanged', () => {
    expect(
      resolveWebSearchProviderChoice({
        provider: 'tavily',
        chatProvider: 'opencode',
        searxngUrl: 'http://localhost:8080',
        hasOpenAIKey: true
      })
    ).toBe('tavily')
  })

  it('prioritizes a configured SearXNG endpoint in auto mode', () => {
    expect(
      resolveWebSearchProviderChoice({
        provider: 'auto',
        chatProvider: 'opencode',
        searxngUrl: 'http://192.168.1.50:8080',
        modelOption: model(),
        hasOpenAIKey: true
      })
    ).toBe('searxng')
  })

  it('uses OpenCode native search when no SearXNG is configured', () => {
    expect(
      resolveWebSearchProviderChoice({
        provider: 'auto',
        chatProvider: 'opencode',
        modelOption: model(),
        hasOpenAIKey: true
      })
    ).toBe('native')
  })

  it('falls back to OpenAI for OpenCode models without native search', () => {
    expect(
      resolveWebSearchProviderChoice({
        provider: 'auto',
        chatProvider: 'opencode',
        modelOption: model({ webSearch: 'tool' }),
        hasOpenAIKey: true
      })
    ).toBe('openai')
  })

  it('falls back to OpenAI for OpenAI chat', () => {
    expect(
      resolveWebSearchProviderChoice({
        provider: 'auto',
        chatProvider: 'openai',
        hasOpenAIKey: true
      })
    ).toBe('openai')
  })
})

describe('webSearchProviderLabel', () => {
  it('labels every provider', () => {
    expect(webSearchProviderLabel('auto')).toBe('Auto')
    expect(webSearchProviderLabel('searxng')).toBe('SearXNG')
    expect(webSearchProviderLabel('native')).toBe('OpenCode native')
    expect(webSearchProviderLabel('openai')).toBe('OpenAI')
  })
})
