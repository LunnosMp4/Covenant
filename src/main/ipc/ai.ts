import { app, ipcMain } from 'electron'
import {
  DEFAULT_OPENCODE_CHAT_MODEL,
  getModelOptionsForProvider,
  type ChatProviderId
} from '../../shared/config'
import { readConfig } from '../config/configStore'
import {
  clearGoApiKey,
  getGoApiKey,
  hasGoApiKey,
  saveGoApiKey
} from '../code/codeCredentials'
import { createOpenAIClient } from '../openai/client'
import { resolveOpenAIProxyUrl } from '../proxy'
import { clearOpenCodeModelCache, listOpenCodeModels } from '../ai/modelCatalog'
import {
  clearSearchSecret,
  hasSearchSecret,
  saveSearchSecret
} from '../ai/search/credentials'
import { searchWithOpenAI } from '../ai/search/openai'
import { searchSearxng } from '../ai/search/searxng'
import { searchTavily } from '../ai/search/tavily'
import { searchExa } from '../ai/search/exa'

function normalizeProvider(value: unknown): ChatProviderId {
  return value === 'opencode' ? 'opencode' : 'openai'
}

async function testOpenCodeKey(): Promise<{ ok: boolean; error?: string }> {
  const apiKey = getGoApiKey()
  if (!apiKey) return { ok: false, error: 'No OpenCode key is stored.' }

  const config = readConfig()
  const baseURL =
    config.opencodePlan === 'payg'
      ? 'https://opencode.ai/inference/openai/v1'
      : 'https://opencode.ai/inference/go/openai/v1'
  const client = createOpenAIClient(apiKey, resolveOpenAIProxyUrl(config.proxyUrl), {
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

async function testWebSearch(): Promise<{ ok: boolean; message: string; resultCount?: number }> {
  const config = readConfig()
  try {
    switch (config.webSearchProvider) {
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
      case 'native':
        return { ok: true, message: 'Native OpenCode search is used when the selected model supports it.' }
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
      message: error instanceof Error ? error.message : 'Web search test failed.'
    }
  }
}

export function registerAiIpc(): void {
  ipcMain.handle('ai:list-models', async (_event, provider: unknown) => {
    const normalized = normalizeProvider(provider)
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
    return {
      openai: Boolean(config.apiKey || process.env.OPENAI_API_KEY),
      opencode: hasGoApiKey(),
      search: {
        provider: config.webSearchProvider,
        hasSecret: hasSearchSecret(config.webSearchProvider),
        searxngConfigured: Boolean(config.webSearchSearxngUrl)
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
      const provider = typeof raw.provider === 'string' ? raw.provider : ''
      const secret = typeof raw.secret === 'string' ? raw.secret : ''
      if (!provider) throw new Error('A search provider is required.')
      saveSearchSecret(provider, secret)
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to save credential.' }
    }
  })

  ipcMain.handle('ai:web-search:clear-secret', (_event, provider: unknown) => {
    if (typeof provider === 'string' && provider.trim()) {
      clearSearchSecret(provider.trim())
    }
    return { ok: true as const }
  })

  ipcMain.handle('ai:web-search:test', async () => testWebSearch())
}
