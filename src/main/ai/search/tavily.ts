import type { AppConfig } from '../../../shared/config'
import { resolveOpenAIProxyUrl } from '../../proxy'
import { createProxyDispatcher } from '../../services/proxyDispatcher'
import { getSearchSecret } from './credentials'
import {
  SEARCH_USER_AGENT,
  fetchSearchJson,
  normalizeSearchResults,
  readString
} from './http'
import type { SearchOptions, SearchResult } from './types'

export async function searchTavily(
  query: string,
  config: AppConfig,
  options: SearchOptions = { query }
): Promise<SearchResult[]> {
  const apiKey = getSearchSecret('tavily')
  if (!apiKey) throw new Error('Tavily API key is missing. Add it in Settings > AI > Web Search.')

  const agent = await createProxyDispatcher(resolveOpenAIProxyUrl(config.proxyUrl))
  const payload = await fetchSearchJson({
    provider: 'Tavily',
    url: 'https://api.tavily.com/search',
    config,
    options,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': SEARCH_USER_AGENT
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 6,
        include_answer: false
      }),
      ...(agent ? { dispatcher: agent } : {})
    } as RequestInit
  })

  return normalizeSearchResults(payload, {
    snippet: (entry) => readString(entry, 'content'),
    publishedAt: (entry) =>
      typeof entry.published_date === 'string' ? entry.published_date : undefined
  })
}
