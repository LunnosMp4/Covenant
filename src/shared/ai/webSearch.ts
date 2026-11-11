import type { AppConfig } from '../config'
import type { AiModelOption, ChatProviderId, WebSearchProviderId } from './models'

export type ResolvedWebSearchProvider = Exclude<WebSearchProviderId, 'auto'>

export interface WebSearchResolutionInput {
  provider: WebSearchProviderId
  chatProvider: ChatProviderId
  searxngUrl?: string
  modelOption?: AiModelOption
  hasOpenAIKey: boolean
}

export interface ResolveWebSearchProviderOptions {
  modelOption?: AiModelOption
  hasOpenAIKey?: boolean
}

/**
 * Resolve the effective web-search provider.
 *
 * Auto keeps the user's intent simple and predictable:
 *  1. A configured SearXNG endpoint always wins (self-hosted search is free
 *     and independent from the chat provider).
 *  2. OpenCode models with provider-side search use native search.
 *  3. Otherwise fall back to OpenAI when a key is available.
 *
 * Explicit provider choices are returned unchanged so users can still force
 * OpenAI, SearXNG, Tavily, Exa, or native search.
 */
export function resolveWebSearchProviderChoice(
  input: WebSearchResolutionInput
): ResolvedWebSearchProvider {
  if (input.provider !== 'auto') return input.provider

  if (input.searxngUrl?.trim()) return 'searxng'

  if (input.chatProvider === 'opencode' && input.modelOption?.webSearch === 'native') {
    return 'native'
  }

  if (input.hasOpenAIKey) return 'openai'

  // Auto ultimately lands on OpenAI even without a key so the caller can
  // surface the existing actionable "OpenAI API key is missing" error.
  return 'openai'
}

export function resolveWebSearchProviderForConfig(
  config: AppConfig,
  options: ResolveWebSearchProviderOptions = {}
): ResolvedWebSearchProvider {
  return resolveWebSearchProviderChoice({
    provider: config.webSearchProvider,
    chatProvider: config.chatProvider,
    searxngUrl: config.webSearchSearxngUrl,
    modelOption: options.modelOption,
    hasOpenAIKey: options.hasOpenAIKey ?? Boolean(config.apiKey?.trim())
  })
}

export function webSearchProviderLabel(provider: WebSearchProviderId | ResolvedWebSearchProvider): string {
  switch (provider) {
    case 'auto':
      return 'Auto'
    case 'searxng':
      return 'SearXNG'
    case 'tavily':
      return 'Tavily'
    case 'exa':
      return 'Exa'
    case 'native':
      return 'OpenCode native'
    case 'openai':
    default:
      return 'OpenAI'
  }
}
