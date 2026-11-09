import type { AiModelOption, AppConfig, WebSearchProviderId } from '../../shared/config'
import type { BuiltinToolHandler, BuiltinToolResult } from '../services/builtinTools'
import { log } from '../logger'
import { searchExa } from './search/exa'
import { searchWithOpenAI } from './search/openai'
import { searchSearxng } from './search/searxng'
import { searchTavily } from './search/tavily'
import type { SearchResult } from './search/types'

export interface WebSearchResult {
  text: string
  sources: SearchResult[]
}

function formatResults(query: string, results: SearchResult[], summary?: string): string {
  const lines: string[] = [`Web search results for "${query}":`]
  if (summary) {
    lines.push('', summary, '')
  }
  if (results.length === 0) {
    lines.push('No results found.')
    return lines.join('\n')
  }
  results.forEach((result, index) => {
    lines.push(`${index + 1}. ${result.title}`)
    lines.push(`   ${result.url}`)
    if (result.snippet) {
      lines.push(`   ${result.snippet.replace(/\s+/g, ' ').slice(0, 500)}`)
    }
  })
  return lines.join('\n')
}

async function runProvider(
  provider: WebSearchProviderId,
  query: string,
  config: AppConfig,
  signal?: AbortSignal
): Promise<WebSearchResult> {
  const options = { query, signal, timeoutMs: config.webSearchTimeoutMs }
  switch (provider) {
    case 'searxng': {
      const sources = await searchSearxng(query, config, options)
      return { text: formatResults(query, sources), sources }
    }
    case 'tavily': {
      const sources = await searchTavily(query, config, options)
      return { text: formatResults(query, sources), sources }
    }
    case 'exa': {
      const sources = await searchExa(query, config, options)
      return { text: formatResults(query, sources), sources }
    }
    case 'openai':
    case 'native':
    default: {
      const result = await searchWithOpenAI(query, config, options)
      return { text: formatResults(query, result.sources, result.text), sources: result.sources }
    }
  }
}

export async function searchWeb(
  query: string,
  config: AppConfig,
  signal?: AbortSignal
): Promise<WebSearchResult> {
  const provider = config.webSearchProvider
  try {
    return await runProvider(provider, query, config, signal)
  } catch (error) {
    const fallback = config.webSearchFallbackProvider
    if (fallback && fallback !== 'none' && fallback !== provider) {
      try {
        return await runProvider(fallback, query, config, signal)
      } catch {
        // Surface the original error below.
      }
    }
    throw error
  }
}

export function shouldUseNativeWebSearch(
  config: AppConfig,
  modelOption: AiModelOption
): boolean {
  return config.webSearchProvider === 'native' && modelOption.webSearch === 'native'
}

export function createWebSearchHandler(config: AppConfig): BuiltinToolHandler {
  return {
    name: 'web_search',
    toolType: 'web_search',
    async execute(rawArguments, ctx): Promise<BuiltinToolResult> {
      let query = ''
      try {
        const parsed = JSON.parse(rawArguments) as Record<string, unknown>
        query = typeof parsed.query === 'string' ? parsed.query.trim() : ''
      } catch {
        // Fall through to the error below.
      }
      if (!query) {
        return { content: 'A search query is required.', isError: true }
      }

      try {
        const result = await searchWeb(query, config, ctx.signal)
        return {
          content: result.text,
          isError: false,
          sources: result.sources.map((source) => ({ title: source.title, url: source.url })),
          query
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Web search failed.'
        log.warn(`Web search failed (${config.webSearchProvider})`, error)
        return {
          content: message,
          isError: true,
          query
        }
      }
    }
  }
}
