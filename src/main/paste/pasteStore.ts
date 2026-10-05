import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  PASTE_INLINE_TEXT_LIMIT,
  normalizePasteItemType,
  type PasteItemDetail,
  type PasteItemMeta,
  type PasteItemType,
  type PasteManagerSettings
} from '../../shared/paste/paste'

const INDEX_VERSION = 1
const INDEX_FLUSH_DELAY_MS = 1000
const INDEX_FILE = 'index.json'
const ITEMS_DIR = 'items'
const BLOBS_DIR = 'blobs'

interface PersistedContent {
  text?: string
  html?: string
}

interface PersistedIndex {
  version: number
  entries: PasteItemMeta[]
}

export interface PasteAddInput {
  type: PasteItemType
  preview: string
  size: number
  hash: string
  searchText?: string
  createdAt?: number
  sourceApp?: string | null
  linkTitle?: string
  linkUrl?: string
  ocrText?: string
  charCount?: number
  wordCount?: number
  imageWidth?: number
  imageHeight?: number
  filePaths?: string[]
  text?: string
  html?: string
  imageBuffer?: Buffer
  thumbnailBuffer?: Buffer
  imageExt?: string
}

function normalizeStoredMeta(raw: unknown): PasteItemMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.id !== 'string' || !obj.id) return null
  if (typeof obj.createdAt !== 'number' || !Number.isFinite(obj.createdAt)) return null

  const meta: PasteItemMeta = {
    id: obj.id,
    type: normalizePasteItemType(obj.type),
    createdAt: obj.createdAt,
    preview: typeof obj.preview === 'string' ? obj.preview : '',
    pinned: obj.pinned === true,
    size: typeof obj.size === 'number' && Number.isFinite(obj.size) ? obj.size : 0,
    hash: typeof obj.hash === 'string' ? obj.hash : ''
  }

  if (typeof obj.searchText === 'string') meta.searchText = obj.searchText
  if (typeof obj.sourceApp === 'string' || obj.sourceApp === null) meta.sourceApp = obj.sourceApp
  if (typeof obj.linkTitle === 'string') meta.linkTitle = obj.linkTitle
  if (typeof obj.linkUrl === 'string') meta.linkUrl = obj.linkUrl
  if (typeof obj.ocrText === 'string') meta.ocrText = obj.ocrText
  if (typeof obj.charCount === 'number') meta.charCount = obj.charCount
  if (typeof obj.wordCount === 'number') meta.wordCount = obj.wordCount
  if (typeof obj.imageWidth === 'number') meta.imageWidth = obj.imageWidth
  if (typeof obj.imageHeight === 'number') meta.imageHeight = obj.imageHeight
  if (typeof obj.blobFile === 'string') meta.blobFile = obj.blobFile
  if (typeof obj.thumbFile === 'string') meta.thumbFile = obj.thumbFile
  if (typeof obj.contentFile === 'string') meta.contentFile = obj.contentFile
  if (typeof obj.inlineText === 'string') meta.inlineText = obj.inlineText
  if (Array.isArray(obj.filePaths)) meta.filePaths = obj.filePaths.filter((p): p is string => typeof p === 'string')

  return meta
}

function pinnedFirst(a: PasteItemMeta, b: PasteItemMeta): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  return b.createdAt - a.createdAt
}

/**
 * JSON-file backed clipboard history store.
 *
 * Layout (under `baseDir`):
 *   index.json            lightweight metadata for every item (loaded in memory)
 *   items/{id}.json       full text/html for large text items (lazy loaded)
 *   blobs/{id}.png        image bytes (never base64 in JSON)
 *   blobs/{id}.thumb.png  downscaled preview thumbnails
 */
export class PasteStore {
  private readonly baseDir: string
  private readonly indexPath: string
  private readonly itemsDir: string
  private readonly blobsDir: string
  private entries: PasteItemMeta[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private writeChain: Promise<void> = Promise.resolve()
  private initialized = false

  constructor(baseDir: string) {
    this.baseDir = baseDir
    this.indexPath = join(baseDir, INDEX_FILE)
    this.itemsDir = join(baseDir, ITEMS_DIR)
    this.blobsDir = join(baseDir, BLOBS_DIR)
  }

  async init(): Promise<void> {
    if (this.initialized) return
    await fs.mkdir(this.itemsDir, { recursive: true })
    await fs.mkdir(this.blobsDir, { recursive: true })

    try {
      const raw = await fs.readFile(this.indexPath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<PersistedIndex> | PasteItemMeta[]
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as PersistedIndex).entries)
          ? (parsed as PersistedIndex).entries
          : []
      this.entries = list
        .map(normalizeStoredMeta)
        .filter((entry): entry is PasteItemMeta => entry != null)
        .sort(pinnedFirst)
    } catch {
      this.entries = []
    }

    this.initialized = true
  }

  /** Metadata only, pinned first then newest first. */
  list(): PasteItemMeta[] {
    return [...this.entries].sort(pinnedFirst)
  }

  getMeta(id: string): PasteItemMeta | null {
    return this.entries.find((entry) => entry.id === id) ?? null
  }

  /** Hash of the most recently stored entry (for consecutive-duplicate checks). */
  mostRecentHash(): string | null {
    let newest: PasteItemMeta | null = null
    for (const entry of this.entries) {
      if (newest == null || entry.createdAt >= newest.createdAt) newest = entry
    }
    return newest ? newest.hash : null
  }

  async getDetail(id: string): Promise<PasteItemDetail | null> {
    const meta = this.getMeta(id)
    if (!meta) return null

    if (typeof meta.inlineText === 'string') {
      return { meta, text: meta.inlineText }
    }

    if (meta.contentFile) {
      try {
        const raw = await fs.readFile(this.itemPath(meta.contentFile), 'utf-8')
        const parsed = JSON.parse(raw) as PersistedContent
        return { meta, text: parsed.text, html: parsed.html }
      } catch {
        return { meta }
      }
    }

    return { meta }
  }

  async add(input: PasteAddInput): Promise<PasteItemMeta> {
    const id = randomUUID()
    const createdAt = typeof input.createdAt === 'number' ? input.createdAt : Date.now()

    const meta: PasteItemMeta = {
      id,
      type: input.type,
      createdAt,
      preview: input.preview,
      pinned: false,
      size: input.size,
      hash: input.hash
    }

    if (input.searchText) meta.searchText = input.searchText
    if (input.sourceApp !== undefined) meta.sourceApp = input.sourceApp
    if (input.linkTitle) meta.linkTitle = input.linkTitle
    if (input.linkUrl) meta.linkUrl = input.linkUrl
    if (input.ocrText) meta.ocrText = input.ocrText
    if (typeof input.charCount === 'number') meta.charCount = input.charCount
    if (typeof input.wordCount === 'number') meta.wordCount = input.wordCount
    if (typeof input.imageWidth === 'number') meta.imageWidth = input.imageWidth
    if (typeof input.imageHeight === 'number') meta.imageHeight = input.imageHeight
    if (input.filePaths && input.filePaths.length > 0) meta.filePaths = [...input.filePaths]

    if (input.imageBuffer && input.imageBuffer.length > 0) {
      const ext = (input.imageExt || 'png').replace(/[^a-z0-9]/gi, '') || 'png'
      const blobFile = `${id}.${ext}`
      await fs.writeFile(this.blobPath(blobFile), input.imageBuffer)
      meta.blobFile = blobFile

      if (input.thumbnailBuffer && input.thumbnailBuffer.length > 0) {
        const thumbFile = `${id}.thumb.png`
        await fs.writeFile(this.blobPath(thumbFile), input.thumbnailBuffer)
        meta.thumbFile = thumbFile
      }
    } else {
      const needsFile =
        Boolean(input.html && input.html.length > 0) ||
        Boolean(input.text && input.text.length > PASTE_INLINE_TEXT_LIMIT)

      if (needsFile) {
        const contentFile = `${id}.json`
        const payload: PersistedContent = {}
        if (input.text) payload.text = input.text
        if (input.html) payload.html = input.html
        await fs.writeFile(this.itemPath(contentFile), JSON.stringify(payload), 'utf-8')
        meta.contentFile = contentFile
      } else if (input.text) {
        meta.inlineText = input.text
      }
    }

    this.entries.push(meta)
    this.entries.sort(pinnedFirst)
    this.scheduleFlush()
    return meta
  }

  /** Applies a partial metadata patch to an in-memory entry and schedules a flush. */
  updateMeta(id: string, patch: Partial<PasteItemMeta>): PasteItemMeta | null {
    const meta = this.getMeta(id)
    if (!meta) return null
    Object.assign(meta, patch)
    if (patch.pinned !== undefined) this.entries.sort(pinnedFirst)
    this.scheduleFlush()
    return meta
  }

  setPinned(id: string, pinned: boolean): PasteItemMeta | null {
    const meta = this.getMeta(id)
    if (!meta) return null
    if (meta.pinned === pinned) return meta
    meta.pinned = pinned
    this.entries.sort(pinnedFirst)
    this.scheduleFlush()
    return meta
  }

  async delete(id: string): Promise<boolean> {
    const index = this.entries.findIndex((entry) => entry.id === id)
    if (index < 0) return false
    const [meta] = this.entries.splice(index, 1)
    await this.removeFiles(meta)
    this.scheduleFlush()
    return true
  }

  /** Removes all items, optionally preserving pinned ones. Returns removed count. */
  async clear(keepPinned: boolean): Promise<number> {
    const keep: PasteItemMeta[] = []
    const removed: PasteItemMeta[] = []
    for (const entry of this.entries) {
      if (keepPinned && entry.pinned) keep.push(entry)
      else removed.push(entry)
    }
    this.entries = keep
    await Promise.all(removed.map((entry) => this.removeFiles(entry)))
    this.scheduleFlush()
    return removed.length
  }

  /** Enforces retention policy. Pinned items are never removed. */
  async purge(settings: Pick<PasteManagerSettings, 'maxItems' | 'maxAgeDays'>): Promise<number> {
    const now = Date.now()
    const maxAgeMs =
      settings.maxAgeDays != null ? settings.maxAgeDays * 24 * 60 * 60 * 1000 : null

    const removeIds = new Set<string>()
    const unpinnedNewestFirst = this.entries
      .filter((entry) => !entry.pinned)
      .sort((a, b) => b.createdAt - a.createdAt)

    if (maxAgeMs != null) {
      for (const entry of unpinnedNewestFirst) {
        if (now - entry.createdAt > maxAgeMs) removeIds.add(entry.id)
      }
    }

    const survivors = unpinnedNewestFirst.filter((entry) => !removeIds.has(entry.id))
    if (survivors.length > settings.maxItems) {
      for (const entry of survivors.slice(settings.maxItems)) removeIds.add(entry.id)
    }

    if (removeIds.size === 0) return 0

    const removed = this.entries.filter((entry) => removeIds.has(entry.id))
    this.entries = this.entries.filter((entry) => !removeIds.has(entry.id))
    await Promise.all(removed.map((entry) => this.removeFiles(entry)))
    this.scheduleFlush()
    return removed.length
  }

  /** Resolves a readable file path for a stored image, or null when missing. */
  getImagePath(id: string, kind: 'full' | 'thumb'): string | null {
    const meta = this.getMeta(id)
    if (!meta) return null
    const file = kind === 'thumb' ? meta.thumbFile ?? meta.blobFile : meta.blobFile
    if (!file) return null
    const path = this.blobPath(file)
    return existsSync(path) ? path : null
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    const snapshot = JSON.stringify({ version: INDEX_VERSION, entries: this.entries })
    this.writeChain = this.writeChain.then(() => this.atomicWrite(this.indexPath, snapshot))
    await this.writeChain
  }

  async dispose(): Promise<void> {
    await this.flush()
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, INDEX_FLUSH_DELAY_MS)
    this.flushTimer.unref?.()
  }

  private async atomicWrite(file: string, data: string): Promise<void> {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(tmp, data, 'utf-8')
    await fs.rename(tmp, file)
  }

  private async removeFiles(meta: PasteItemMeta): Promise<void> {
    const targets: string[] = []
    if (meta.blobFile) targets.push(this.blobPath(meta.blobFile))
    if (meta.thumbFile) targets.push(this.blobPath(meta.thumbFile))
    if (meta.contentFile) targets.push(this.itemPath(meta.contentFile))
    await Promise.all(
      targets.map((target) => fs.rm(target, { force: true }).catch(() => undefined))
    )
  }

  private blobPath(file: string): string {
    return join(this.blobsDir, file)
  }

  private itemPath(file: string): string {
    return join(this.itemsDir, file)
  }
}
