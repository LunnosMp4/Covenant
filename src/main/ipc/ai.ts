import { app, ipcMain } from 'electron'
import {
  DEFAULT_OPENCODE_CHAT_MODEL,
  getActiveChatModel,
  getModelOptionFor,
  getModelOptionsForProvider,
  normalizeChatProvider,
  resolveWebSearchProviderForConfig
} from '../../shared/config'
import { webSearchProviderLabel } from '../../shared/ai/webSearch'
import { isWebSearchProvider } from '../../shared/ai/models'
import { readConfig } from '../config/configStore'
import {
  clearGoApiKey,
  getGoApiKey,
  hasGoApiKey,
  saveGoApiKey
} from '../code/codeCredentials'
import { createOpenAIClient } from '../openai/client'
import { resolveOpenAIProxyUrl } from '../proxy'
import {
  clearOpenCodeModelCache,
  getCachedOpenCodeModel,
  listOpenCodeModels
} from '../ai/modelCatalog'
import { getOpenAIKey, getOpenCodeBaseUrl } from '../ai/provider'
import { clearSearchSecret, getSearchSecret, saveSearchSecret } from '../ai/search/credentials'
import { searchWithOpenAI } from '../ai/search/openai'
import { searchSearxng } from '../ai/search/searxng'
import { searchTavily } from '../ai/search/tavily'
import { searchExa } from '../ai/search/exa'

async function testOpenCodeKey(): Promise<{ ok: boolean; error?: string }> {
  const apiKey = getGoApiKey()
  if (!apiKey) return { ok: false, error: 'No OpenCode key is stored.' }

  const config = readConfig()
  const baseURL = getOpenCodeBaseUrl(config.opencodePlan)
  const client = await createOpenAIClient(apiKey, resolveOpenAIProxyUrl(config.proxyUrl), {
    baseURL,
    timeout: 20_000,
    maxRetries: 0,
    defaultHeaders: {
      'User-Agent': `Covenant/${app.getVersion()}`,
      'x-opencode-session': 'ses_covenant-key-test'
    }
  })

  try {
    await client.responses.create({
      model: DEFAULT_OPENCODE_CHAT_MODEL,
      input: 'Reply with the single word: ok',
      max_output_tokens: 2
    } as never)
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'OpenCode key test failed.'
    }
  }
}

async function testWebSearch(
  requestedProvider?: unknown
): Promise<{ ok: boolean; message: string; resultCount?: number }> {
  const config = readConfig()
  const activeModel = getActiveChatModel(config)
  const modelOption =
    (config.chatProvider === 'opencode' ? getCachedOpenCodeModel(activeModel) : undefined) ??
    getModelOptionFor(config.chatProvider, activeModel)
  const resolvedProvider = resolveWebSearchProviderForConfig(config, {
    modelOption,
    hasOpenAIKey: Boolean(getOpenAIKey(config))
  })
  const provider =
    requestedProvider === 'searxng' ||
    requestedProvider === 'tavily' ||
    requestedProvider === 'exa' ||
    requestedProvider === 'openai' ||
    requestedProvider === 'native'
      ? requestedProvider
      : resolvedProvider

  try {
    switch (provider) {
      case 'searxng': {
        const results = await searchSearxng('Covenant web search test', config)
        return { ok: true, message: `SearXNG returned ${results.length} results.`, resultCount: results.length }
      }
      case 'tavily': {
        const results = await searchTavily('Covenant web search test', config)
        return { ok: true, message: `Tavily returned ${results.length} results.`, resultCount: results.length }
      }
      case 'exa': {
        const results = await searchExa('Covenant web search test', config)
        return { ok: true, message: `Exa returned ${results.length} results.`, resultCount: results.length }
      }
      case 'native': {
        const supported = modelOption?.webSearch === 'native'
        return {
          ok: supported,
          message: supported
            ? 'Native OpenCode search is used by the selected model.'
            : 'Native search requires an OpenCode model that supports it.'
        }
      }
      case 'openai':
      default: {
        const result = await searchWithOpenAI('Covenant web search test', config)
        return {
          ok: true,
          message: `OpenAI search returned ${result.sources.length} sources.`,
          resultCount: result.sources.length
        }
      }
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : `Web search test failed (${webSearchProviderLabel(provider)}).`
    }
  }
}

export function registerAiIpc(): void {
  ipcMain.handle('ai:list-models', async (_event, provider: unknown) => {
    const normalized = normalizeChatProvider(provider)
    if (normalized === 'opencode') {
      const config = readConfig()
      const models = await listOpenCodeModels(config.opencodePlan)
      return { ok: true as const, models }
    }
    return { ok: true as const, models: getModelOptionsForProvider('openai') }
  })

  ipcMain.handle('ai:refresh-models', async () => {
    clearOpenCodeModelCache()
    const config = readConfig()
    const models = await listOpenCodeModels(config.opencodePlan, { force: true })
    return { ok: true as const, models }
  })

  ipcMain.handle('ai:key-status', () => {
    const config = readConfig()
    const openaiKey = getOpenAIKey(config)
    return {
      openai: {
        configured: Boolean(openaiKey),
        source: config.apiKey?.trim()
          ? ('config' as const)
          : process.env.OPENAI_API_KEY
            ? ('env' as const)
            : ('none' as const)
      },
      admin: { configured: Boolean(config.adminApiKey?.trim()) },
      opencode: { configured: hasGoApiKey() },
      search: {
        searxng: Boolean(getSearchSecret('searxng')),
        tavily: Boolean(getSearchSecret('tavily')),
        exa: Boolean(getSearchSecret('exa'))
      }
    }
  })

  ipcMain.handle('ai:opencode-key:set', async (_event, key: unknown) => {
    try {
      const value = typeof key === 'string' ? key.trim() : ''
      if (!value) throw new Error('OpenCode API key is required.')
      saveGoApiKey(value)
      clearOpenCodeModelCache()
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to save key.' }
    }
  })

  ipcMain.handle('ai:opencode-key:clear', () => {
    clearGoApiKey()
    clearOpenCodeModelCache()
    return { ok: true as const }
  })

  ipcMain.handle('ai:opencode-key:test', async () => testOpenCodeKey())

  ipcMain.handle('ai:web-search:set-secret', (_event, payload: unknown) => {
    try {
      const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
      const provider = raw.provider
      const secret = typeof raw.secret === 'string' ? raw.secret : ''
      if (!isWebSearchProvider(provider) || provider === 'openai' || provider === 'native') {
        throw new Error('A search provider that uses credentials is required.')
      }
      saveSearchSecret(provider, secret)
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to save credential.' }
    }
  })

  ipcMain.handle('ai:web-search:clear-secret', (_event, provider: unknown) => {
    if (!isWebSearchProvider(provider) || provider === 'openai' || provider === 'native') {
      return { ok: false as const, error: 'Unknown search provider.' }
    }
    clearSearchSecret(provider)
    return { ok: true as const }
  })

  ipcMain.handle('ai:web-search:test', async (_event, provider: unknown) =>
    testWebSearch(provider)
  )
}
