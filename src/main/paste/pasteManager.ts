import { clipboard, nativeImage } from 'electron'
import { promises as fs } from 'fs'
import {
  normalizePasteManagerSettings,
  truncatePreview,
  type PasteItemDetail,
  type PasteItemMeta,
  type PasteManagerSettings
} from '../../shared/paste'
import { hashClip, type CapturedClip } from './clipboardCapture'
import { ClipboardWatcher } from './clipboardWatcher'
import { fetchLinkTitle } from './linkPreview'
import { OcrExtractor } from './ocr'
import { PasteStore, type PasteAddInput } from './pasteStore'

const CHANGE_NOTIFY_DEBOUNCE_MS = 200
const PURGE_INTERVAL_MS = 60 * 60 * 1000
const THUMBNAIL_MAX_WIDTH = 480

export interface PasteManagerDeps {
  baseDir: string
  getSettings: () => PasteManagerSettings
  saveSettings: (settings: PasteManagerSettings) => void
  getOpenAIConfig: () => { apiKey: string; proxyUrl?: string }
  /** Push a change notification to any open paste window. */
  onChanged: () => void
}

function detectImageExt(buffer: Buffer): 'png' | 'bmp' | 'jpg' {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) return 'bmp'
  return 'png'
}

export class PasteManager {
  private readonly store: PasteStore
  private readonly watcher: ClipboardWatcher
  private readonly ocr: OcrExtractor
  private readonly deps: PasteManagerDeps
  private purgeTimer: NodeJS.Timeout | null = null
  private notifyTimer: NodeJS.Timeout | null = null
  private initialized = false

  constructor(deps: PasteManagerDeps) {
    this.deps = deps
    this.store = new PasteStore(deps.baseDir)
    this.ocr = new OcrExtractor(() => deps.getOpenAIConfig())
    this.watcher = new ClipboardWatcher(
      (clip, hash) => {
        void this.handleCapture(clip, hash)
      },
      () => {
        const settings = this.deps.getSettings()
        return {
          captureImages: settings.captureImages,
          captureRichText: settings.captureRichText
        }
      }
    )
  }

  async init(): Promise<void> {
    if (this.initialized) return
    await this.store.init()
    this.initialized = true

    const settings = this.deps.getSettings()
    this.applySettings(settings, true)

    const removed = await this.store.purge(settings)
    if (removed > 0) this.notifySoon()
  }

  list(): PasteItemMeta[] {
    return this.store.list()
  }

  getMeta(id: string): PasteItemMeta | null {
    return this.store.getMeta(id)
  }

  getDetail(id: string): Promise<PasteItemDetail | null> {
    return this.store.getDetail(id)
  }

  setPinned(id: string, pinned: boolean): boolean {
    const result = this.store.setPinned(id, pinned)
    if (!result) return false
    this.notifySoon()
    return true
  }

  async delete(id: string): Promise<boolean> {
    const removed = await this.store.delete(id)
    if (removed) this.notifySoon()
    return removed
  }

  async clear(keepPinned: boolean): Promise<number> {
    const removed = await this.store.clear(keepPinned)
    this.notifySoon()
    return removed
  }

  async copy(id: string, asPlainText = false): Promise<boolean> {
    const meta = this.store.getMeta(id)
    if (!meta) return false
    const detail = await this.store.getDetail(id)

    if (meta.type === 'image' && !asPlainText) {
      const path = this.store.getImagePath(id, 'full')
      if (!path) return false
      this.watcher.suppressNextImage()
      clipboard.writeImage(nativeImage.createFromPath(path))
      return true
    }

    const text = detail?.text ?? ''
    const html = !asPlainText && meta.type === 'rich' ? detail?.html : undefined

    // Suppress the watcher from re-capturing our own clipboard write. We
    // suppress both the original hash and the plain-text hash to cover every
    // classification the watcher might produce.
    this.watcher.suppress(meta.hash)
    this.watcher.suppress(hashClip({ type: 'text', preview: '', size: 0, text }))

    if (html) {
      clipboard.write({ text, html })
    } else {
      clipboard.writeText(text)
    }
    return true
  }

  /** Resolves a stored image file for the custom protocol handler. */
  getImageFilePath(id: string, kind: 'full' | 'thumb'): string | null {
    return this.store.getImagePath(id, kind)
  }

  async saveImage(id: string, targetPath: string): Promise<boolean> {
    const source = this.store.getImagePath(id, 'full')
    if (!source || !targetPath) return false
    try {
      await fs.copyFile(source, targetPath)
      return true
    } catch {
      return false
    }
  }

  updateSettings(patch: Partial<PasteManagerSettings>): PasteManagerSettings {
    const next = normalizePasteManagerSettings({ ...this.deps.getSettings(), ...patch })
    this.deps.saveSettings(next)
    this.applySettings(next, false)
    void this.store.purge(next).then((removed) => {
      if (removed > 0) this.notifySoon()
    })
    return next
  }

  async dispose(): Promise<void> {
    this.watcher.stop()
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer)
      this.purgeTimer = null
    }
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer)
      this.notifyTimer = null
    }
    await this.store.dispose()
  }

  private applySettings(settings: PasteManagerSettings, initial: boolean): void {
    if (settings.enabled) {
      if (!this.watcher.isRunning()) this.watcher.start()
      if (!this.purgeTimer) {
        this.purgeTimer = setInterval(() => {
          void this.runPurge()
        }, PURGE_INTERVAL_MS)
        this.purgeTimer.unref?.()
      }
    } else {
      this.watcher.stop()
      if (this.purgeTimer) {
        clearInterval(this.purgeTimer)
        this.purgeTimer = null
      }
    }

    if (initial) this.notifySoon()
  }

  private async runPurge(): Promise<void> {
    const removed = await this.store.purge(this.deps.getSettings())
    if (removed > 0) this.notifySoon()
  }

  private async handleCapture(clip: CapturedClip, hash: string): Promise<void> {
    const settings = this.deps.getSettings()
    if (!settings.enabled) return
    if (hash === this.store.mostRecentHash()) return

    const input = this.buildAddInput(clip, hash, settings)
    let meta: PasteItemMeta
    try {
      meta = await this.store.add(input)
    } catch {
      return
    }

    this.notifySoon()
    this.postProcess(meta, clip, settings)
  }

  private buildAddInput(clip: CapturedClip, hash: string, settings: PasteManagerSettings): PasteAddInput {
    const input: PasteAddInput = {
      type: clip.type,
      preview: clip.preview,
      size: clip.size,
      hash,
      searchText: (clip.text ?? clip.linkUrl ?? '').slice(0, 600),
      text: clip.text,
      html: clip.html,
      charCount: clip.charCount,
      wordCount: clip.wordCount,
      filePaths: clip.filePaths,
      linkUrl: clip.linkUrl,
      linkTitle: clip.linkTitle
    }

    if (clip.type === 'image' && clip.imageBuffer && clip.imageBuffer.length > 0) {
      const prepared = this.prepareImage(clip.imageBuffer)
      input.imageBuffer = prepared.imageBuffer
      input.thumbnailBuffer = prepared.thumbnailBuffer
      input.imageExt = prepared.imageExt
      input.imageWidth = prepared.imageWidth
      input.imageHeight = prepared.imageHeight
      input.size = prepared.size
    }

    // `settings` is intentionally unused for now but kept for future options
    // (e.g. max text size), avoiding a signature change later.
    void settings
    return input
  }

  private prepareImage(buffer: Buffer): {
    imageBuffer: Buffer
    thumbnailBuffer?: Buffer
    imageExt: string
    imageWidth?: number
    imageHeight?: number
    size: number
  } {
    try {
      const image = nativeImage.createFromBuffer(buffer)
      if (image.isEmpty()) {
        return { imageBuffer: buffer, imageExt: detectImageExt(buffer), size: buffer.length }
      }

      const { width, height } = image.getSize()
      const png = image.toPNG()
      let thumbnailBuffer: Buffer | undefined
      if (width > 0) {
        const thumb = width > THUMBNAIL_MAX_WIDTH
          ? image.resize({ width: THUMBNAIL_MAX_WIDTH, quality: 'good' })
          : image
        thumbnailBuffer = thumb.toPNG()
      }

      return {
        imageBuffer: png,
        thumbnailBuffer,
        imageExt: 'png',
        imageWidth: width,
        imageHeight: height,
        size: png.length
      }
    } catch {
      return { imageBuffer: buffer, imageExt: detectImageExt(buffer), size: buffer.length }
    }
  }

  private postProcess(meta: PasteItemMeta, clip: CapturedClip, settings: PasteManagerSettings): void {
    if (clip.type === 'link' && settings.fetchLinkPreviews && clip.linkUrl) {
      void this.enrichLinkTitle(meta.id, clip.linkUrl)
    }

    if (clip.type === 'image' && settings.ocrEnabled && clip.imageBuffer) {
      void this.enrichOcr(meta.id, clip.imageBuffer)
    }
  }

  private async enrichLinkTitle(id: string, url: string): Promise<void> {
    const title = await fetchLinkTitle(url)
    if (!title) return
    const updated = this.store.updateMeta(id, { linkTitle: title, preview: truncatePreview(title) })
    if (updated) this.notifySoon()
  }

  private async enrichOcr(id: string, imageBuffer: Buffer): Promise<void> {
    const text = await this.ocr.extractText(imageBuffer, 'image/png')
    if (!text) return
    const updated = this.store.updateMeta(id, { ocrText: text })
    if (updated) this.notifySoon()
  }

  private notifySoon(): void {
    if (this.notifyTimer) return
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null
      this.deps.onChanged()
    }, CHANGE_NOTIFY_DEBOUNCE_MS)
    this.notifyTimer.unref?.()
  }
}
