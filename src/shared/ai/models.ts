// Shared AI provider/model metadata used by both the main process and the
// renderer. This file must stay free of Electron/Node imports so it can be
// bundled into the renderer.

export type ChatProviderId = 'openai' | 'opencode'
export type OpenCodePlan = 'go' | 'payg'
export type WebSearchProviderId =
  | 'openai'
  | 'searxng'
  | 'tavily'
  | 'exa'
  | 'native'

export type NativeApiFamily =
  | 'responses'
  | 'chat-completions'
  | 'messages'
  | 'generate-content'

export interface AiModelPricing {
  inputPerMillion: number
  cachedInputPerMillion: number
  outputPerMillion: number
}

export interface AiModelOption {
  provider: ChatProviderId
  id: string
  label: string
  maxContextTokens: number
  supportsExtendedParams: boolean
  supportsTools: boolean
  supportsReasoning: boolean
  reasoningEfforts: string[]
  supportsTemperature: boolean
  supportsVision: boolean
  /** 'native' means the gateway can run provider-side web search. */
  webSearch: 'native' | 'tool' | false
  nativeApi?: NativeApiFamily
  pricing?: AiModelPricing
}

export const DEFAULT_CHAT_PROVIDER: ChatProviderId = 'openai'
export const DEFAULT_OPENCODE_CHAT_MODEL = 'gpt-6-luna'
export const DEFAULT_WEB_SEARCH_PROVIDER: WebSearchProviderId = 'openai'
export const DEFAULT_WEB_SEARCH_TIMEOUT_MS = 45_000

export const CHAT_PROVIDERS: Array<{ id: ChatProviderId; label: string }> = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'opencode', label: 'OpenCode' }
]

export const WEB_SEARCH_PROVIDERS: Array<{ id: WebSearchProviderId; label: string }> = [
  { id: 'openai', label: 'OpenAI (default)' },
  { id: 'searxng', label: 'SearXNG (custom endpoint)' },
  { id: 'tavily', label: 'Tavily (free tier)' },
  { id: 'exa', label: 'Exa (free tier)' },
  { id: 'native', label: 'OpenCode native search' }
]

/**
 * Offline/first-run fallback list for OpenCode models. The live catalog is
 * fetched from `/inference/{go|}/v1/models`; this list keeps the UI usable when
 * the network is unavailable or no key is configured yet.
 */
export const OPENCODE_MODEL_OPTIONS: AiModelOption[] = [
  {
    provider: 'opencode',
    id: 'gpt-6-luna',
    label: 'GPT-6 Luna',
    maxContextTokens: 1_050_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'medium', 'high'],
    supportsTemperature: false,
    supportsVision: true,
    webSearch: 'native',
    nativeApi: 'responses',
    pricing: { inputPerMillion: 0.1, cachedInputPerMillion: 0.01, outputPerMillion: 0.5 }
  },
  {
    provider: 'opencode',
    id: 'gpt-6.1-sol',
    label: 'GPT-6.1 Sol',
    maxContextTokens: 1_050_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'medium', 'high'],
    supportsTemperature: false,
    supportsVision: true,
    webSearch: 'native',
    nativeApi: 'responses',
    pricing: { inputPerMillion: 2, cachedInputPerMillion: 0.1, outputPerMillion: 10 }
  },
  {
    provider: 'opencode',
    id: 'deepseek-v4.1-flash',
    label: 'DeepSeek V4.1 Flash',
    maxContextTokens: 1_000_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'high'],
    supportsTemperature: true,
    supportsVision: true,
    webSearch: 'tool',
    nativeApi: 'chat-completions',
    pricing: { inputPerMillion: 0.3, cachedInputPerMillion: 0.006, outputPerMillion: 1.2 }
  },
  {
    provider: 'opencode',
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    maxContextTokens: 1_000_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['high'],
    supportsTemperature: true,
    supportsVision: false,
    webSearch: 'tool',
    nativeApi: 'chat-completions',
    pricing: { inputPerMillion: 1.74, cachedInputPerMillion: 0.145, outputPerMillion: 3.48 }
  },
  {
    provider: 'opencode',
    id: 'glm-5.3',
    label: 'GLM 5.3',
    maxContextTokens: 1_000_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'high'],
    supportsTemperature: true,
    supportsVision: false,
    webSearch: 'tool',
    nativeApi: 'chat-completions',
    pricing: { inputPerMillion: 1.4, cachedInputPerMillion: 0.26, outputPerMillion: 4.4 }
  },
  {
    provider: 'opencode',
    id: 'glm-5.3-flash',
    label: 'GLM 5.3 Flash',
    maxContextTokens: 1_000_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'high'],
    supportsTemperature: true,
    supportsVision: true,
    webSearch: 'tool',
    nativeApi: 'chat-completions',
    pricing: { inputPerMillion: 0.15, cachedInputPerMillion: 0.03, outputPerMillion: 0.5 }
  },
  {
    provider: 'opencode',
    id: 'kimi-k3',
    label: 'Kimi K3',
    maxContextTokens: 1_048_576,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['high'],
    supportsTemperature: false,
    supportsVision: true,
    webSearch: 'tool',
    nativeApi: 'chat-completions',
    pricing: { inputPerMillion: 3, cachedInputPerMillion: 0.3, outputPerMillion: 15 }
  },
  {
    provider: 'opencode',
    id: 'kimi-k2.7-code',
    label: 'Kimi K2.7 Code',
    maxContextTokens: 262_144,
    supportsExtendedParams: false,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: [],
    supportsTemperature: false,
    supportsVision: true,
    webSearch: 'tool',
    nativeApi: 'chat-completions',
    pricing: { inputPerMillion: 0.95, cachedInputPerMillion: 0.19, outputPerMillion: 4 }
  },
  {
    provider: 'opencode',
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    maxContextTokens: 1_000_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'medium', 'high'],
    supportsTemperature: false,
    supportsVision: true,
    webSearch: 'tool',
    nativeApi: 'messages',
    pricing: { inputPerMillion: 0.1, cachedInputPerMillion: 0.01, outputPerMillion: 0.5 }
  },
  {
    provider: 'opencode',
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon',
    maxContextTokens: 1_048_576,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'medium', 'high'],
    supportsTemperature: false,
    supportsVision: true,
    webSearch: 'tool',
    nativeApi: 'generate-content',
    pricing: { inputPerMillion: 2, cachedInputPerMillion: 0.1, outputPerMillion: 10 }
  },
  {
    provider: 'opencode',
    id: 'minimax-m3',
    label: 'MiniMax M3',
    maxContextTokens: 1_000_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['medium'],
    supportsTemperature: true,
    supportsVision: true,
    webSearch: 'tool',
    nativeApi: 'messages',
    pricing: { inputPerMillion: 0.3, cachedInputPerMillion: 0.06, outputPerMillion: 1.2 }
  },
  {
    provider: 'opencode',
    id: 'qwen3.8-max',
    label: 'Qwen3.8 Max',
    maxContextTokens: 1_000_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'medium'],
    supportsTemperature: true,
    supportsVision: true,
    webSearch: 'tool',
    nativeApi: 'messages',
    pricing: { inputPerMillion: 2, cachedInputPerMillion: 0.25, outputPerMillion: 6 }
  },
  {
    provider: 'opencode',
    id: 'qwen3.8-flash',
    label: 'Qwen3.8 Flash',
    maxContextTokens: 1_000_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'medium'],
    supportsTemperature: true,
    supportsVision: true,
    webSearch: 'tool',
    nativeApi: 'messages',
    pricing: { inputPerMillion: 0.15, cachedInputPerMillion: 0.016, outputPerMillion: 0.47 }
  },
  {
    provider: 'opencode',
    id: 'grok-4.7',
    label: 'Grok 4.7',
    maxContextTokens: 500_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'medium', 'high'],
    supportsTemperature: true,
    supportsVision: true,
    webSearch: 'native',
    nativeApi: 'responses',
    pricing: { inputPerMillion: 2, cachedInputPerMillion: 0.5, outputPerMillion: 6 }
  },
  {
    provider: 'opencode',
    id: 'hy4',
    label: 'Hy4',
    maxContextTokens: 1_048_576,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['high'],
    supportsTemperature: true,
    supportsVision: true,
    webSearch: 'tool',
    nativeApi: 'chat-completions',
    pricing: { inputPerMillion: 0.834, cachedInputPerMillion: 0.042, outputPerMillion: 2.501 }
  },
  {
    provider: 'opencode',
    id: 'step-5-preview',
    label: 'Step 5 Preview',
    maxContextTokens: 1_000_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'medium', 'high'],
    supportsTemperature: true,
    supportsVision: true,
    webSearch: 'tool',
    nativeApi: 'chat-completions',
    pricing: { inputPerMillion: 1, cachedInputPerMillion: 0.1, outputPerMillion: 2.7 }
  },
  {
    provider: 'opencode',
    id: 'mimo-v2.6-flash',
    label: 'MiMo V2.6 Flash',
    maxContextTokens: 1_048_576,
    supportsExtendedParams: false,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: [],
    supportsTemperature: true,
    supportsVision: true,
    webSearch: 'tool',
    nativeApi: 'chat-completions',
    pricing: { inputPerMillion: 0.14, cachedInputPerMillion: 0.0028, outputPerMillion: 0.28 }
  },
  {
    provider: 'opencode',
    id: 'minimax-m3.1-flash',
    label: 'MiniMax M3.1 Flash',
    maxContextTokens: 1_000_000,
    supportsExtendedParams: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'medium', 'high'],
    supportsTemperature: true,
    supportsVision: true,
    webSearch: 'tool',
    nativeApi: 'chat-completions',
    pricing: { inputPerMillion: 0.15, cachedInputPerMillion: 0.015, outputPerMillion: 0.6 }
  },
  {
    provider: 'opencode',
    id: 'longcat-2.0',
    label: 'LongCat 2.0',
    maxContextTokens: 1_000_000,
    supportsExtendedParams: false,
    supportsTools: true,
    supportsReasoning: true,
    reasoningEfforts: [],
    supportsTemperature: true,
    supportsVision: false,
    webSearch: 'tool',
    nativeApi: 'chat-completions',
    pricing: { inputPerMillion: 0.3, cachedInputPerMillion: 0.006, outputPerMillion: 1.2 }
  }
]

export function findAiModelOption(
  provider: ChatProviderId,
  modelId: string
): AiModelOption | undefined {
  if (provider === 'opencode') {
    return OPENCODE_MODEL_OPTIONS.find((model) => model.id === modelId)
  }
  return undefined
}

export function normalizeChatProvider(value: unknown): ChatProviderId {
  return value === 'opencode' ? 'opencode' : 'openai'
}

export function normalizeOpenCodePlan(value: unknown): OpenCodePlan {
  return value === 'payg' ? 'payg' : 'go'
}

export function normalizeWebSearchProvider(value: unknown): WebSearchProviderId {
  switch (value) {
    case 'searxng':
    case 'tavily':
    case 'exa':
    case 'native':
    case 'openai':
      return value
    default:
      return DEFAULT_WEB_SEARCH_PROVIDER
  }
}

export function isWebSearchProvider(value: unknown): value is WebSearchProviderId {
  return (
    value === 'openai' ||
    value === 'searxng' ||
    value === 'tavily' ||
    value === 'exa' ||
    value === 'native'
  )
}
