import type { Dispatcher } from 'undici'
import { resolveOpenAIProxyUrl } from '../../proxy'
import type { AppConfig } from '../../../shared/config'
import { createAgentDispatcher, createProxyDispatcher } from '../../services/proxyDispatcher'
import { getSearchSecret } from './credentials'
import {
  SEARCH_USER_AGENT,
  fetchSearchJson,
  normalizeSearchResults,
  readString
} from './http'
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

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': SEARCH_USER_AGENT
  }
  const auth = buildAuthHeader(config)
  if (auth) headers.Authorization = auth

  const dispatcher = await createDispatcher(config, normalized)
  const payload = await fetchSearchJson({
    provider: 'SearXNG',
    url,
    config,
    options,
    describeStatus: (status) => {
      if (status === 403) {
        return 'SearXNG returned 403. Enable JSON in its settings.yml (search.formats: [html, json]) and make sure the limiter is not blocking Covenant.'
      }
      if (status === 401) {
        return 'SearXNG requires authentication. Add the username/password or bearer token in settings.'
      }
      return null
    },
    init: {
      method: 'GET',
      headers,
      ...(dispatcher ? { dispatcher } : {})
    } as RequestInit
  })

  return normalizeSearchResults(payload, {
    snippet: (entry) => readString(entry, 'content') || readString(entry, 'snippet'),
    publishedAt: (entry) =>
      typeof entry.publishedDate === 'string' ? entry.publishedDate : undefined
  })
}
