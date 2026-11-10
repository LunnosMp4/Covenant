import { randomUUID } from 'crypto'
import { app } from 'electron'
import type OpenAI from 'openai'
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_OPENCODE_CHAT_MODEL,
  getModelOptionFor,
  type AiModelOption,
  type AppConfig,
  type ChatProviderId
} from '../../shared/config'
import { getGoApiKey } from '../code/codeCredentials'
import { createOpenAIClient } from '../openai/client'
import { resolveOpenAIProxyUrl } from '../proxy'
import { getCachedOpenCodeModel } from './modelCatalog'

export interface ChatProviderContext {
  provider: ChatProviderId
  model: string
  modelOption: AiModelOption
  client: OpenAI
  sessionId: string
  isOpenCode: boolean
}

export interface ResolveProviderOptions {
  sessionId?: string
  model?: string
}

function fallbackModelOption(provider: ChatProviderId, modelId: string): AiModelOption {
  return {
    provider,
    id: modelId,
    label: modelId,
    maxContextTokens: 1_000_000,
    supportsExtendedParams: false,
    supportsTools: true,
    supportsReasoning: false,
    reasoningEfforts: [],
    supportsTemperature: true,
    supportsVision: false,
    webSearch: 'tool'
  }
}

function normalizeSessionId(value?: string): string {
  const trimmed = value?.trim()
  if (trimmed) return trimmed.startsWith('ses_') ? trimmed : `ses_${trimmed}`
  return `ses_${randomUUID()}`
}

export function getOpenAIKey(config: AppConfig): string {
  return config.apiKey || process.env.OPENAI_API_KEY || ''
}

export function getOpenCodeBaseUrl(plan: AppConfig['opencodePlan']): string {
  return plan === 'payg'
    ? 'https://opencode.ai/inference/openai/v1'
    : 'https://opencode.ai/inference/go/openai/v1'
}

export function hasProviderKey(config: AppConfig): boolean {
  if (config.chatProvider === 'opencode') return Boolean(getGoApiKey())
  return Boolean(getOpenAIKey(config))
}

export function providerKeyError(provider: ChatProviderId): string {
  return provider === 'opencode'
    ? 'OpenCode API key is missing. Add it in Settings > AI Provider.'
    : 'OpenAI API key is missing. Add it in Settings > General or set OPENAI_API_KEY.'
}

export function resolveChatProvider(
  config: AppConfig,
  options: ResolveProviderOptions = {}
): ChatProviderContext {
  const provider = config.chatProvider
  const sessionId = normalizeSessionId(options.sessionId)

  if (provider === 'opencode') {
    const apiKey = getGoApiKey()
    if (!apiKey) throw new Error(providerKeyError(provider))
    const client = createOpenAIClient(apiKey, resolveOpenAIProxyUrl(config.proxyUrl), {
      baseURL: getOpenCodeBaseUrl(config.opencodePlan),
      defaultHeaders: {
        'User-Agent': `Covenant/${app.getVersion()}`,
        'x-opencode-session': sessionId
      }
    })
    const model =
      options.model?.trim() ||
      config.opencodeChatModel ||
      DEFAULT_OPENCODE_CHAT_MODEL
    const modelOption =
      getCachedOpenCodeModel(model) ??
      getModelOptionFor('opencode', model) ??
      fallbackModelOption('opencode', model)
    return {
      provider,
      model,
      modelOption,
      client,
      sessionId,
      isOpenCode: true
    }
  }

  const apiKey = getOpenAIKey(config)
  if (!apiKey) throw new Error(providerKeyError(provider))
  const client = createOpenAIClient(apiKey, resolveOpenAIProxyUrl(config.proxyUrl), {
    defaultHeaders: {
      'User-Agent': `Covenant/${app.getVersion()}`
    }
  })
  const model = options.model?.trim() || config.chatModel || DEFAULT_CHAT_MODEL
  const modelOption =
    getModelOptionFor('openai', model) ?? fallbackModelOption('openai', model)
  return {
    provider,
    model,
    modelOption,
    client,
    sessionId,
    isOpenCode: false
  }
}
