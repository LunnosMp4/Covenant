import type { AppConfig } from '../../../shared/config'
import type { SearchOptions, SearchResult } from './types'

/**
 * Shared HTTP plumbing for the web-search adapters.
 *
 * Tavily, Exa and SearXNG all implement the same contract: honour the caller's
 * `AbortSignal`, enforce `options.timeoutMs ?? config.webSearchTimeoutMs`, map
 * failures onto provider-specific messages and normalise the payload into
 * `SearchResult[]`. Keeping it in one place means a fix to the timeout or the
 * result parsing applies to every provider at once.
 */

export const SEARCH_USER_AGENT = 'Covenant/1.0'
export const SEARCH_TIMEOUT_FALLBACK_MS = 15_000
const MAX_RESULTS = 8

export interface SearchTimeout {
  signal: AbortSignal
  /** True when the timer — not the caller — aborted the request. */
  timedOut: () => boolean
  dispose: () => void
}

/** Builds the abort signal that combines the caller's signal with a timeout. */
export function createSearchTimeout(options: SearchOptions, timeoutMs: number): SearchTimeout {
  const controller = new AbortController()
  let timedOut = false

  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const onAbort = (): void => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', onAbort, { once: true })

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', onAbort)
    }
  }
}

export function resolveTimeoutMs(config: AppConfig, options: SearchOptions): number {
  return options.timeoutMs ?? config.webSearchTimeoutMs ?? SEARCH_TIMEOUT_FALLBACK_MS
}

export interface SearchRequest {
  /** Display name used in error messages, e.g. `Tavily`. */
  provider: string
  url: string | URL
  init: RequestInit
  config: AppConfig
  options: SearchOptions
  /** Custom message for a non-OK response; returning null keeps the generic one. */
  describeStatus?: (status: number) => string | null
}

/**
 * Performs a search request and returns the parsed JSON body.
 *
 * Throws `<Provider> search timed out after Ns.` when the timeout fired, and
 * rethrows transport errors untouched (matching the previous adapters).
 */
export async function fetchSearchJson(request: SearchRequest): Promise<unknown> {
  const { provider, url, init, config, options, describeStatus } = request
  const timeoutMs = resolveTimeoutMs(config, options)
  const timeout = createSearchTimeout(options, timeoutMs)

  try {
    const response = await fetch(url, { ...init, signal: timeout.signal })
    if (!response.ok) {
      const custom = describeStatus?.(response.status)
      throw new Error(custom ?? `${provider} returned ${response.status}.`)
    }
    return await response.json()
  } catch (error) {
    if (timeout.timedOut()) {
      throw new Error(`${provider} search timed out after ${Math.round(timeoutMs / 1000)}s.`)
    }
    throw error
  } finally {
    timeout.dispose()
  }
}

interface ResultSelectors {
  snippet: (entry: Record<string, unknown>) => string
  publishedAt?: (entry: Record<string, unknown>) => string | undefined
}

/**
 * Normalises a provider payload into at most {@link MAX_RESULTS} `SearchResult`s,
 * dropping entries without a URL. Selectors keep the provider-specific field
 * names (`content` vs `text`, `published_date` vs `publishedDate`) out of the
 * shared loop.
 */
export function normalizeSearchResults(payload: unknown, selectors: ResultSelectors): SearchResult[] {
  const rawResults =
    payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)
      ? ((payload as { results: unknown[] }).results)
      : []

  return rawResults
    .map((item): SearchResult | null => {
      if (!item || typeof item !== 'object') return null
      const entry = item as Record<string, unknown>
      const url = typeof entry.url === 'string' ? entry.url.trim() : ''
      if (!url) return null
      return {
        title: typeof entry.title === 'string' ? entry.title.trim() : url,
        url,
        snippet: selectors.snippet(entry),
        publishedAt: selectors.publishedAt?.(entry)
      }
    })
    .filter((item): item is SearchResult => item !== null)
    .slice(0, MAX_RESULTS)
}

/** Reads a trimmed string field, or an empty string when absent. */
export function readString(entry: Record<string, unknown>, key: string): string {
  const value = entry[key]
  return typeof value === 'string' ? value.trim() : ''
}
