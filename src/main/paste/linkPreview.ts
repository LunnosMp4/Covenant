const MAX_PREVIEW_BYTES = 64 * 1024
const FETCH_TIMEOUT_MS = 3500
const MAX_CACHE_ENTRIES = 200

const titleCache = new Map<string, string | null>()

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match) return null
  const title = decodeEntities(match[1].replace(/\s+/g, ' ').trim())
  return title.length > 0 ? title.slice(0, 200) : null
}

async function readCapped(response: Response): Promise<string> {
  const body = response.body
  if (!body) return ''

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      received += value.length
      if (received >= MAX_PREVIEW_BYTES) {
        await reader.cancel().catch(() => undefined)
        break
      }
    }
  } catch {
    // Fall back to whatever we managed to read.
  }

  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Non-blocking best-effort fetch of a page's <title>. Results (including
 * failures) are cached so repeated copies of the same link are cheap.
 */
export async function fetchLinkTitle(url: string): Promise<string | null> {
  if (titleCache.has(url)) return titleCache.get(url) ?? null

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    titleCache.set(url, null)
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    titleCache.set(url, null)
    return null
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let title: string | null = null
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; Covenant/1.0)' }
    })
    if (response.ok) {
      const html = await readCapped(response)
      title = extractTitle(html)
    }
  } catch {
    title = null
  } finally {
    clearTimeout(timeout)
  }

  if (titleCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = titleCache.keys().next().value
    if (oldest !== undefined) titleCache.delete(oldest)
  }
  titleCache.set(url, title)
  return title
}
