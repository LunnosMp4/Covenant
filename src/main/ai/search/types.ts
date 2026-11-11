export interface SearchResult {
  title: string
  url: string
  snippet: string
  publishedAt?: string
}

export interface SearchOptions {
  signal?: AbortSignal
  timeoutMs?: number
  query: string
}
