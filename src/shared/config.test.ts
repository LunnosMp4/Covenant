import { describe, expect, it } from 'vitest'
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_SHORTCUTS,
  getModelCapabilities,
  modelDoesReasoning,
  modelSupportsExtendedParams,
  modelSupportsWebSearch,
  normalizeChatModelId,
  normalizeShortcuts
} from './config'

describe('model capability helpers', () => {
  it('exposes the configured model options', () => {
    expect(CHAT_MODEL_OPTIONS.length).toBeGreaterThanOrEqual(2)
    expect(DEFAULT_CHAT_MODEL).toBe('gpt-6-luna')
  })

  it('looks up a model by id', () => {
    expect(getModelCapabilities('gpt-6-luna')?.label).toBe('GPT-6 Luna')
    expect(getModelCapabilities('gpt-6.1-sol')?.label).toBe('GPT-6.1 Sol')
    expect(getModelCapabilities('nope')).toBeUndefined()
  })

  it('detects extended-param support only for known models', () => {
    expect(modelSupportsExtendedParams('gpt-6-luna')).toBe(true)
    expect(modelSupportsExtendedParams('gpt-4o-mini')).toBe(false)
  })

  it('detects reasoning models by prefix', () => {
    expect(modelDoesReasoning('gpt-6-luna')).toBe(true)
    expect(modelDoesReasoning('o3-mini')).toBe(true)
    expect(modelDoesReasoning('gpt-4o-mini')).toBe(false)
  })

  it('detects web-search capable models', () => {
    expect(modelSupportsWebSearch('gpt-6-luna')).toBe(true)
    expect(modelSupportsWebSearch('gpt-4o')).toBe(true)
    expect(modelSupportsWebSearch('gpt-3.5-turbo')).toBe(false)
  })
})

describe('normalizeChatModelId', () => {
  it('migrates legacy model ids to the current ones', () => {
    expect(normalizeChatModelId('gpt-5.6-luna')).toBe('gpt-6-luna')
    expect(normalizeChatModelId('gpt-5.6-terra')).toBe('gpt-6.1-sol')
  })

  it('keeps current and unknown ids and falls back for empty input', () => {
    expect(normalizeChatModelId('gpt-6-luna')).toBe('gpt-6-luna')
    expect(normalizeChatModelId('custom-model')).toBe('custom-model')
    expect(normalizeChatModelId('')).toBe(DEFAULT_CHAT_MODEL)
    expect(normalizeChatModelId(undefined)).toBe(DEFAULT_CHAT_MODEL)
  })
})

describe('normalizeShortcuts', () => {
  it('returns defaults for missing input', () => {
    expect(normalizeShortcuts(undefined)).toEqual(DEFAULT_SHORTCUTS)
    expect(normalizeShortcuts(null)).toEqual(DEFAULT_SHORTCUTS)
  })

  it('fills gaps with defaults and keeps valid values', () => {
    const normalized = normalizeShortcuts({ openApp: 'Ctrl+Space' })
    expect(normalized.openApp).toBe('Ctrl+Space')
    expect(normalized.openLastConversation).toBe(DEFAULT_SHORTCUTS.openLastConversation)
    expect(normalized.openAppTerminal).toBe(DEFAULT_SHORTCUTS.openAppTerminal)
    expect(normalized.openTasks).toBe(DEFAULT_SHORTCUTS.openTasks)
  })

  it('ignores non-string values', () => {
    const normalized = normalizeShortcuts({ openApp: 42, openTasks: 'Alt+K' })
    expect(normalized.openApp).toBe(DEFAULT_SHORTCUTS.openApp)
    expect(normalized.openTasks).toBe('Alt+K')
  })
})