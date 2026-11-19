import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../../../shared/config'
import {
  createSearchTimeout,
  fetchSearchJson,
  normalizeSearchResults,
  readString,
  resolveTimeoutMs
} from './http'

const config = { webSearchTimeoutMs: 15_000 } as AppConfig

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('normalizeSearchResults', () => {
  it('maps provider fields and falls back to the URL as title', () => {
    const results = normalizeSearchResults(
      {
        results: [
          { url: ' https://a.test/x ', title: ' A ', content: ' snippet ' },
          { url: 'https://b.test', content: 'other' }
        ]
      },
      { snippet: (entry) => readString(entry, 'content') }
    )

    expect(results).toEqual([
      { title: 'A', url: 'https://a.test/x', snippet: 'snippet', publishedAt: undefined },
      { title: 'https://b.test', url: 'https://b.test', snippet: 'other', publishedAt: undefined }
    ])
  })

  it('drops entries without a usable URL and non-object entries', () => {
    const results = normalizeSearchResults(
      { results: [null, {}, { url: '' }, { url: 42 }, { url: 'https://ok.test' }] },
      { snippet: () => '' }
    )
    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://ok.test')
  })

  it('caps the result list at eight entries', () => {
    const payload = {
      results: Array.from({ length: 20 }, (_, index) => ({ url: `https://x.test/${index}` }))
    }
    expect(normalizeSearchResults(payload, { snippet: () => '' })).toHaveLength(8)
  })

  it('treats a missing results array as empty', () => {
    expect(normalizeSearchResults(null, { snippet: () => '' })).toEqual([])
    expect(normalizeSearchResults({ results: 'nope' }, { snippet: () => '' })).toEqual([])
  })

  it('reads optional published dates through the selector', () => {
    const results = normalizeSearchResults(
      { results: [{ url: 'https://x.test', published_date: '2024-01-01' }] },
      {
        snippet: () => '',
        publishedAt: (entry) =>
          typeof entry.published_date === 'string' ? entry.published_date : undefined
      }
    )
    expect(results[0].publishedAt).toBe('2024-01-01')
  })
})

describe('resolveTimeoutMs', () => {
  it('prefers the caller timeout, then the config, then the fallback', () => {
    expect(resolveTimeoutMs(config, { query: 'q', timeoutMs: 1234 })).toBe(1234)
    expect(resolveTimeoutMs(config, { query: 'q' })).toBe(15_000)
    expect(resolveTimeoutMs({} as AppConfig, { query: 'q' })).toBe(15_000)
  })
})

describe('fetchSearchJson', () => {
  it('returns the parsed body', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchSearchJson({
        provider: 'Tavily',
        url: 'https://api.test',
        init: { method: 'POST' },
        config,
        options: { query: 'q' }
      })
    ).resolves.toEqual({ results: [] })
  })

  it('maps a non-OK response to the provider message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))

    await expect(
      fetchSearchJson({
        provider: 'Exa',
        url: 'https://api.test',
        init: {},
        config,
        options: { query: 'q' }
      })
    ).rejects.toThrow('Exa returned 500.')
  })

  it('lets the caller override the status message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })))

    await expect(
      fetchSearchJson({
        provider: 'SearXNG',
        url: 'https://api.test',
        init: {},
        config,
        options: { query: 'q' },
        describeStatus: (status) => (status === 403 ? 'Enable JSON in settings.yml' : null)
      })
    ).rejects.toThrow('Enable JSON in settings.yml')
  })

  it('reports a timeout when the timer aborts the request', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: unknown, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          })
      )
    )

    const promise = fetchSearchJson({
      provider: 'SearXNG',
      url: 'https://api.test',
      init: {},
      config: { webSearchTimeoutMs: 3000 } as AppConfig,
      options: { query: 'q' }
    })
    const assertion = expect(promise).rejects.toThrow('SearXNG search timed out after 3s.')

    await vi.advanceTimersByTimeAsync(3000)
    await assertion
  })
})

describe('createSearchTimeout', () => {
  it('aborts when the caller signal fires and reports no timeout', () => {
    const outer = new AbortController()
    const timeout = createSearchTimeout({ query: 'q', signal: outer.signal }, 10_000)

    outer.abort()
    expect(timeout.signal.aborted).toBe(true)
    expect(timeout.timedOut()).toBe(false)
    timeout.dispose()
  })

  it('stops listening after dispose', () => {
    const outer = new AbortController()
    const timeout = createSearchTimeout({ query: 'q', signal: outer.signal }, 10_000)

    timeout.dispose()
    outer.abort()
    expect(timeout.signal.aborted).toBe(false)
  })
})
