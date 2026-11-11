import type { Dispatcher } from 'undici'
import { resolveOpenAIProxyUrl } from '../../proxy'
import type { AppConfig } from '../../../shared/config'
import { createAgentDispatcher, createProxyDispatcher } from '../../services/proxyDispatcher'
import { getSearchSecret } from './credentials'
import type { SearchOptions, SearchResult } from './types'

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true
  if (/^127\./.test(host)) return true
  if (/^10\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  return false
}

async function createDispatcher(config: AppConfig, baseUrl: string): Promise<Dispatcher | undefined> {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    return undefined
  }

  const local = isPrivateHost(parsed.hostname)
  if (config.webSearchBypassProxyForLocal !== false && local) {
    if (parsed.protocol === 'https:' && config.webSearchSearxngAllowInsecure) {
      return createAgentDispatcher({ connect: { rejectUnauthorized: false } })
    }
    return undefined
  }

  const proxyUrl = resolveOpenAIProxyUrl(config.proxyUrl)
  if (proxyUrl) return createProxyDispatcher(proxyUrl)
  if (parsed.protocol === 'https:' && config.webSearchSearxngAllowInsecure) {
    return createAgentDispatcher({ connect: { rejectUnauthorized: false } })
  }
  return undefined
}

function buildAuthHeader(config: AppConfig): string | undefined {
  if (config.webSearchSearxngAuthType === 'basic') {
    const username = config.webSearchSearxngUsername?.trim() ?? ''
    const password = getSearchSecret('searxng') ?? ''
    if (!username && !password) return undefined
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  }
  if (config.webSearchSearxngAuthType === 'bearer') {
    const token = getSearchSecret('searxng')
    return token ? `Bearer ${token}` : undefined
  }
  return undefined
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

export async function searchSearxng(
  query: string,
  config: AppConfig,
  options: SearchOptions = { query }
): Promise<SearchResult[]> {
  const baseUrl = config.webSearchSearxngUrl?.trim()
  if (!baseUrl) {
    throw new Error('SearXNG endpoint is not configured. Add it in Settings > AI > Web Search.')
  }

  const normalized = normalizeBaseUrl(baseUrl)
  let endpoint: URL
  try {
    endpoint = new URL(normalized)
  } catch {
    throw new Error('SearXNG endpoint is not a valid URL. Add a full http(s) URL in Settings > AI > Web Search.')
  }
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    throw new Error('SearXNG endpoint must use http or https.')
  }

  const url = new URL(`${normalized}/search`)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('categories', 'general')
  url.searchParams.set('safesearch', '0')

  const timeoutMs = options.timeoutMs ?? config.webSearchTimeoutMs ?? 15_000
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onCallerAbort = (): void => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', onCallerAbort, { once: true })

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'Covenant/1.0'
  }
  const auth = buildAuthHeader(config)
  if (auth) headers.Authorization = auth

  const dispatcher = await createDispatcher(config, normalized)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {})
    } as RequestInit)

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error(
          'SearXNG returned 403. Enable JSON in its settings.yml (search.formats: [html, json]) and make sure the limiter is not blocking Covenant.'
        )
      }
      if (response.status === 401) {
        throw new Error('SearXNG requires authentication. Add the username/password or bearer token in settings.')
      }
      throw new Error(`SearXNG returned ${response.status}.`)
    }

    const payload = (await response.json()) as { results?: unknown }
    const rawResults = Array.isArray(payload.results) ? payload.results : []
    return rawResults
      .map((item): SearchResult | null => {
        if (!item || typeof item !== 'object') return null
        const entry = item as Record<string, unknown>
        const urlValue = typeof entry.url === 'string' ? entry.url.trim() : ''
        if (!urlValue) return null
        return {
          title: typeof entry.title === 'string' ? entry.title.trim() : urlValue,
          url: urlValue,
          snippet:
            typeof entry.content === 'string'
              ? entry.content.trim()
              : typeof entry.snippet === 'string'
                ? entry.snippet.trim()
                : '',
          publishedAt:
            typeof entry.publishedDate === 'string' ? entry.publishedDate : undefined
        }
      })
      .filter((item): item is SearchResult => item !== null)
      .slice(0, 8)
  } catch (error) {
    if (timedOut) {
      throw new Error(`SearXNG search timed out after ${Math.round(timeoutMs / 1000)}s.`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onCallerAbort)
  }
}
