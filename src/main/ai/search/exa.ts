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

export async function searchExa(
  query: string,
  config: AppConfig,
  options: SearchOptions = { query }
): Promise<SearchResult[]> {
  const apiKey = getSearchSecret('exa')
  if (!apiKey) throw new Error('Exa API key is missing. Add it in Settings > AI > Web Search.')

  const agent = await createProxyDispatcher(resolveOpenAIProxyUrl(config.proxyUrl))
  const payload = await fetchSearchJson({
    provider: 'Exa',
    url: 'https://api.exa.ai/search',
    config,
    options,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': SEARCH_USER_AGENT
      },
      body: JSON.stringify({
        query,
        type: 'lite',
        numResults: 6,
        contents: { text: { maxCharacters: 1200 } }
      }),
      ...(agent ? { dispatcher: agent } : {})
    } as RequestInit
  })

  return normalizeSearchResults(payload, {
    snippet: (entry) => readString(entry, 'text'),
    publishedAt: (entry) =>
      typeof entry.publishedDate === 'string' ? entry.publishedDate : undefined
  })
}
