import { ProxyAgent, type Dispatcher } from 'undici'
import type { AppConfig } from '../../../shared/config'
import { resolveOpenAIProxyUrl } from '../../proxy'
import { getSearchSecret } from './credentials'
import type { SearchOptions, SearchResult } from './types'

function dispatcher(config: AppConfig): Dispatcher | undefined {
  const proxyUrl = resolveOpenAIProxyUrl(config.proxyUrl)
  return proxyUrl ? new ProxyAgent(proxyUrl) : undefined
}

export async function searchExa(
  query: string,
  config: AppConfig,
  options: SearchOptions = { query }
): Promise<SearchResult[]> {
  const apiKey = getSearchSecret('exa')
  if (!apiKey) throw new Error('Exa API key is missing. Add it in Settings > AI Provider > Web search.')

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
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'Covenant/1.0'
      },
      body: JSON.stringify({
        query,
        type: 'lite',
        numResults: 6,
        contents: { text: { maxCharacters: 1200 } }
      }),
      signal: controller.signal,
      ...(agent ? { dispatcher: agent } : {})
    } as RequestInit)

    if (!response.ok) {
      throw new Error(`Exa returned ${response.status}.`)
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
          snippet: typeof entry.text === 'string' ? entry.text.trim() : '',
          publishedAt: typeof entry.publishedDate === 'string' ? entry.publishedDate : undefined
        }
      })
      .filter((item): item is SearchResult => item !== null)
      .slice(0, 8)
  } catch (error) {
    if (timedOut) {
      throw new Error(`Exa search timed out after ${Math.round(timeoutMs / 1000)}s.`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onAbort)
  }
}
