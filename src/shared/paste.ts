/**
 * Shared types for the Paste Manager (clipboard history) feature.
 *
 * These types are intentionally free of Electron/Node imports so they can be
 * consumed from the main process, the preload bridge and the renderer, and be
 * unit tested in isolation.
 */

export type PasteItemType = 'text' | 'rich' | 'image' | 'link' | 'file'

export const PASTE_ITEM_TYPES: readonly PasteItemType[] = ['text', 'rich', 'image', 'link', 'file']

export type PastePasteBehavior = 'copy'

/**
 * Lightweight per-item metadata. The whole array is loaded into memory at
 * startup from `index.json`; it must stay small (no full content, no base64).
 */
export interface PasteItemMeta {
  id: string
  type: PasteItemType
  createdAt: number
  /** Truncated, single-line preview for the list. ~50-100 chars. */
  preview: string
  /** Short searchable text (first few hundred chars) kept small in the index. */
  searchText?: string
  pinned: boolean
  /** Approximate payload size in bytes (text length, file size, image bytes). */
  size: number
  /** Fast content hash used for consecutive-duplicate detection. */
  hash: string
  /** Source application (best-effort; currently always unset). */
  sourceApp?: string | null
  /** For link items. */
  linkTitle?: string
  linkUrl?: string
  /** Optional OCR text for image items, when enabled. */
  ocrText?: string
  /** Character/word counts for text-like items. */
  charCount?: number
  wordCount?: number
  /** Image dimensions when known. */
  imageWidth?: number
  imageHeight?: number
  /** Basename of the blob file (image bytes) stored under `blobs/`. */
  blobFile?: string
  /** Basename of the thumbnail file stored under `blobs/`. */
  thumbFile?: string
  /** Basename of the full-content JSON file stored under `items/`. */
  contentFile?: string
  /** Inline full text for small text-like payloads (avoids a file write). */
  inlineText?: string
  /** File paths for file items. */
  filePaths?: string[]
}

export interface PasteItemDetail {
  meta: PasteItemMeta
  /** Full text (text/rich/link/file) lazily loaded from disk or index. */
  text?: string
  /** HTML source for rich text items. */
  html?: string
}

export interface PasteManagerSettings {
  enabled: boolean
  /** Max unpinned items to retain. */
  maxItems: number
  /** Max age in days for unpinned items, or null for unlimited. */
  maxAgeDays: number | null
  captureImages: boolean
  captureRichText: boolean
  fetchLinkPreviews: boolean
  ocrEnabled: boolean
  pasteBehavior: PastePasteBehavior
}

export const DEFAULT_PASTE_SETTINGS: PasteManagerSettings = {
  enabled: true,
  maxItems: 1000,
  maxAgeDays: null,
  captureImages: true,
  captureRichText: true,
  fetchLinkPreviews: true,
  ocrEnabled: false,
  pasteBehavior: 'copy'
}

export const MIN_PASTE_ITEMS = 10
export const MAX_PASTE_ITEMS = 100_000
export const MIN_PASTE_AGE_DAYS = 1
export const MAX_PASTE_AGE_DAYS = 3650
/** Text payloads at or below this size are stored inline in the index. */
export const PASTE_INLINE_TEXT_LIMIT = 2048
/** Preview length target. */
export const PASTE_PREVIEW_LENGTH = 100

const PASTE_ITEM_TYPE_SET = new Set<string>(PASTE_ITEM_TYPES)

export function isPasteItemType(value: unknown): value is PasteItemType {
  return typeof value === 'string' && PASTE_ITEM_TYPE_SET.has(value)
}

export function normalizePasteItemType(value: unknown): PasteItemType {
  return isPasteItemType(value) ? value : 'text'
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.round(numeric)))
}

export function normalizePasteManagerSettings(raw: unknown): PasteManagerSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PASTE_SETTINGS }
  }

  const obj = raw as Record<string, unknown>
  const maxAgeRaw = obj.maxAgeDays
  let maxAgeDays: number | null
  if (maxAgeRaw === null || maxAgeRaw === undefined || maxAgeRaw === '') {
    maxAgeDays = null
  } else {
    const numeric = typeof maxAgeRaw === 'number' ? maxAgeRaw : Number(maxAgeRaw)
    maxAgeDays = Number.isFinite(numeric)
      ? clampNumber(numeric, DEFAULT_PASTE_SETTINGS.maxItems, MIN_PASTE_AGE_DAYS, MAX_PASTE_AGE_DAYS)
      : null
  }

  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : DEFAULT_PASTE_SETTINGS.enabled,
    maxItems: clampNumber(obj.maxItems, DEFAULT_PASTE_SETTINGS.maxItems, MIN_PASTE_ITEMS, MAX_PASTE_ITEMS),
    maxAgeDays,
    captureImages:
      typeof obj.captureImages === 'boolean' ? obj.captureImages : DEFAULT_PASTE_SETTINGS.captureImages,
    captureRichText:
      typeof obj.captureRichText === 'boolean' ? obj.captureRichText : DEFAULT_PASTE_SETTINGS.captureRichText,
    fetchLinkPreviews:
      typeof obj.fetchLinkPreviews === 'boolean'
        ? obj.fetchLinkPreviews
        : DEFAULT_PASTE_SETTINGS.fetchLinkPreviews,
    ocrEnabled: typeof obj.ocrEnabled === 'boolean' ? obj.ocrEnabled : DEFAULT_PASTE_SETTINGS.ocrEnabled,
    // Only 'copy' is supported for now; reserved for a future native paste mode.
    pasteBehavior: DEFAULT_PASTE_SETTINGS.pasteBehavior
  }
}

/** Collapses whitespace and truncates for list previews. */
export function truncatePreview(text: string, maxLength = PASTE_PREVIEW_LENGTH): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxLength) return collapsed
  return `${collapsed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

const URL_PATTERN = /^(https?:\/\/|www\.)[^\s]+$/i

/** True when the whole string is a single http(s)/www URL. */
export function isProbablyUrl(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || /\s/.test(trimmed)) return false
  return URL_PATTERN.test(trimmed)
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/**
 * Normalizes a URL for comparison/preview fetching. Adds https:// to bare
 * `www.` hosts. Returns null when the input is not a usable URL.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}
