import { ProxyAgent, type Dispatcher } from 'undici'
import type { AppConfig } from '../../../shared/config'
import { resolveOpenAIProxyUrl } from '../../proxy'
import { getSearchSecret } from './credentials'
import type { SearchOptions, SearchResult } from './types'

function dispatcher(config: AppConfig): Dispatcher | undefined {
  const proxyUrl = resolveOpenAIProxyUrl(config.proxyUrl)
  return proxyUrl ? new ProxyAgent(proxyUrl) : undefined
}

export async function searchTavily(
  query: string,
  config: AppConfig,
  options: SearchOptions = { query }
): Promise<SearchResult[]> {
  const apiKey = getSearchSecret('tavily')
  if (!apiKey) throw new Error('Tavily API key is missing. Add it in Settings > AI Provider > Web search.')

  const agent = dispatcher(config)
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? config.webSearchTimeoutMs ?? 15_000
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onAbort = (): void => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Covenant/1.0'
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 6,
        include_answer: false
      }),
      signal: controller.signal,
      ...(agent ? { dispatcher: agent } : {})
    } as RequestInit)

    if (!response.ok) {
      throw new Error(`Tavily returned ${response.status}.`)
    }
    const payload = (await response.json()) as { results?: unknown }
    const results = Array.isArray(payload.results) ? payload.results : []
    return results
      .map((item): SearchResult | null => {
        if (!item || typeof item !== 'object') return null
        const entry = item as Record<string, unknown>
        const url = typeof entry.url === 'string' ? entry.url.trim() : ''
        if (!url) return null
        return {
          title: typeof entry.title === 'string' ? entry.title.trim() : url,
          url,
          snippet: typeof entry.content === 'string' ? entry.content.trim() : '',
          publishedAt: typeof entry.published_date === 'string' ? entry.published_date : undefined
        }
      })
      .filter((item): item is SearchResult => item !== null)
      .slice(0, 8)
  } catch (error) {
    if (timedOut) {
      throw new Error(`Tavily search timed out after ${Math.round(timeoutMs / 1000)}s.`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onAbort)
  }
}
