import { DEFAULT_WEB_SEARCH_TIMEOUT_MS, type AppConfig } from '../../../shared/config'
import { createOpenAIClient } from '../../openai/client'
import { resolveOpenAIProxyUrl } from '../../proxy'
import { getOpenAIKey } from '../provider'
import type { SearchOptions, SearchResult } from './types'

const SEARCH_MODEL = 'gpt-6-luna'
const MAX_OUTPUT_TOKENS = 300
const MIN_SEARCH_TIMEOUT_MS = 3000

function extractSources(output: Array<Record<string, unknown>> | undefined): SearchResult[] {
  const sources: SearchResult[] = []
  for (const item of output ?? []) {
    if (item.type !== 'web_search_call') continue
    const action = item.action as Record<string, unknown> | undefined
    const rawSources: Array<Record<string, unknown>> = []
    if (Array.isArray(action?.sources)) {
      rawSources.push(...(action.sources as Array<Record<string, unknown>>))
    }
    if (Array.isArray(action?.results)) {
      for (const entry of action.results as Array<Record<string, unknown>>) {
        if (Array.isArray(entry.results)) {
          rawSources.push(...(entry.results as Array<Record<string, unknown>>))
        }
      }
    }
    for (const source of rawSources) {
      const url =
        typeof source.url === 'string'
          ? source.url
          : typeof source.link === 'string'
            ? source.link
            : typeof source.href === 'string'
              ? source.href
              : ''
      if (!url) continue
      sources.push({
        title:
          typeof source.title === 'string'
            ? source.title
            : typeof source.name === 'string'
              ? source.name
              : url,
        url,
        snippet:
          typeof source.snippet === 'string'
            ? source.snippet
            : typeof source.description === 'string'
              ? source.description
              : ''
      })
    }
  }

  const seen = new Set<string>()
  return sources.filter((source) => {
    if (seen.has(source.url)) return false
    seen.add(source.url)
    return true
  })
}

export async function searchWithOpenAI(
  query: string,
  config: AppConfig,
  options: SearchOptions = { query }
): Promise<{ text: string; sources: SearchResult[] }> {
  const apiKey = getOpenAIKey(config)
  if (!apiKey) {
    throw new Error('OpenAI API key is missing. Add it in Settings > AI > Providers & Keys to use OpenAI web search.')
  }

  const client = await createOpenAIClient(apiKey, resolveOpenAIProxyUrl(config.proxyUrl), {
    timeout: Math.max(
      options.timeoutMs ?? config.webSearchTimeoutMs ?? DEFAULT_WEB_SEARCH_TIMEOUT_MS,
      MIN_SEARCH_TIMEOUT_MS
    ),
    maxRetries: 0
  })

  const response = await client.responses.create(
    {
      model: SEARCH_MODEL,
      tools: [{ type: 'web_search' }],
      max_output_tokens: MAX_OUTPUT_TOKENS,
      reasoning: { effort: 'low' },
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Search the web for: ${query}\n\nReturn a concise, factual summary of the most relevant results. Include source links. Do not answer from memory.`
            }
          ]
        }
      ]
    } as never,
    { signal: options.signal }
  )

  const payload = response as unknown as {
    output_text?: unknown
    output?: Array<Record<string, unknown>>
  }
  const text = typeof payload.output_text === 'string' ? payload.output_text.trim() : ''
  return {
    text: text || 'No web search summary returned.',
    sources: extractSources(payload.output)
  }
}
