import { clipboard } from 'electron'
import {
  classifyClipboard,
  fingerprintText,
  hashClip,
  isImageFormat,
  type CapturedClip,
  type RawClipboardSnapshot
} from './clipboardCapture'

const DEFAULT_POLL_MS = 800
/** Re-check the (expensive) image payload only every Nth tick while one is present. */
const IMAGE_PROBE_TICKS = 2
/** How long a self-write suppression hash stays valid. */
const SUPPRESS_TTL_MS = 5000
/** Back off after a poll that took long enough to indicate clipboard contention. */
const SLOW_POLL_THRESHOLD_MS = 200
const MAX_SLOW_POLL_MS = 3000

const TEXT_FORMAT_HINTS = ['text/', 'utf8_string', 'string', 'html format', 'rtf']

function isTextFormat(lowerFormat: string): boolean {
  return TEXT_FORMAT_HINTS.some((hint) => lowerFormat.includes(hint))
}

const IMAGE_BUFFER_FORMATS = [
  'image/png',
  'PNG',
  'image/bmp',
  'BMP',
  'image/tiff',
  'image/jpeg',
  'image/gif'
]

export interface WatcherOptions {
  captureImages: boolean
  captureRichText: boolean
}

export type CaptureHandler = (clip: CapturedClip, hash: string) => void

function decodeFileUri(uri: string): string {
  let value = uri.trim()
  if (/^file:\/\//i.test(value)) {
    value = value.replace(/^file:\/\//i, '')
    // Windows: file:///C:/path -> /C:/path
    if (/^\/[a-zA-Z]:/.test(value)) value = value.slice(1)
  }
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Poll-based clipboard monitor.
 *
 * Electron exposes no native clipboard-change event, so this compares a cheap
 * fingerprint each tick and only reads/hashes the payload when something
 * changed. Image payloads are probed on a slower cadence and never decoded
 * here (decoding to a bitmap happens once, at capture time).
 *
 * The class is the single seam for clipboard monitoring: a native
 * `AddClipboardFormatListener`/`GetClipboardSequenceNumber` driver can replace
 * it later without touching the paste manager.
 */
export class ClipboardWatcher {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private pollMs = DEFAULT_POLL_MS
  private tick = 0
  private lastSignature = ''
  private lastImageHash = ''
  private skipNextImage = false
  private suppressed = new Map<string, number>()
  private readonly onCapture: CaptureHandler
  private readonly getOptions: () => WatcherOptions

  constructor(onCapture: CaptureHandler, getOptions: () => WatcherOptions) {
    this.onCapture = onCapture
    this.getOptions = getOptions
  }

  start(pollMs = DEFAULT_POLL_MS): void {
    if (this.running) return
    this.running = true
    this.pollMs = pollMs
    this.lastSignature = ''
    this.lastImageHash = ''
    this.schedule(0)
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  isRunning(): boolean {
    return this.running
  }

  /**
   * Self-scheduling poll. A `setInterval` would keep firing while a slow
   * clipboard call is in flight, piling work onto the main thread; this also
   * lets us back off when the clipboard is contended.
   */
  private schedule(delay: number): void {
    if (!this.running) return
    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.running) return

      const startedAt = Date.now()
      try {
        this.poll()
      } catch {
        // A malformed clipboard payload should not stop future polls.
      } finally {
        const elapsed = Date.now() - startedAt
        const nextDelay =
          elapsed >= SLOW_POLL_THRESHOLD_MS
            ? Math.min(this.pollMs * 2, MAX_SLOW_POLL_MS)
            : this.pollMs
        this.schedule(nextDelay)
      }
    }, delay)
    this.timer.unref?.()
  }

  /**
   * Ignores the next clipboard change matching `hash`. Call before writing to
   * the clipboard ourselves (copy/paste actions) to avoid re-capturing.
   */
  suppress(hash: string): void {
    if (!hash) return
    this.suppressed.set(hash, Date.now() + SUPPRESS_TTL_MS)
    if (this.suppressed.size > 64) this.pruneSuppressed()
  }

  /**
   * Ignores the next image capture. Used after writing an image ourselves,
   * where the OS may re-encode the bytes so hash-based suppression can't match.
   */
  suppressNextImage(): void {
    this.skipNextImage = true
  }

  private pruneSuppressed(): void {
    const now = Date.now()
    for (const [hash, expiry] of this.suppressed) {
      if (expiry <= now) this.suppressed.delete(hash)
    }
  }

  private isSuppressed(hash: string): boolean {
    const expiry = this.suppressed.get(hash)
    if (expiry == null) return false
    this.suppressed.delete(hash)
    return expiry > Date.now()
  }

  private poll(): void {
    // Advance the tick even if reading fails so image probing still cycles.
    this.tick += 1

    let formats: string[] = []
    try {
      formats = clipboard.availableFormats() ?? []
    } catch {
      return
    }

    const lowerFormats = formats.map((format) => format.toLowerCase())
    const hasText = lowerFormats.some(isTextFormat)

    // Reading text is another synchronous clipboard call; skip it entirely when
    // the clipboard only holds files or an image.
    let text = ''
    if (hasText) {
      try {
        text = clipboard.readText() ?? ''
      } catch {
        return
      }
    }

    const options = this.getOptions()
    const filePaths = this.readFilePaths(lowerFormats)
    const hasFiles = filePaths.length > 0
    const hasImage = options.captureImages && !hasFiles && formats.some(isImageFormat)

    const signature = `${formats.join(',')}|${fingerprintText(text)}|${filePaths.join('\n')}`
    const signatureChanged = signature !== this.lastSignature
    const probeImage = hasImage && this.tick % IMAGE_PROBE_TICKS === 0

    if (!signatureChanged && !probeImage) return
    this.lastSignature = signature

    let imageBuffer: Buffer | null = null
    if (hasImage) {
      imageBuffer = this.readImageBuffer(formats)
    }

    const html =
      options.captureRichText && lowerFormats.includes('text/html') ? this.readHtml() : ''

    const snapshot: RawClipboardSnapshot = {
      formats,
      text,
      html,
      filePaths,
      imageBuffer
    }

    const clip = classifyClipboard(snapshot, options)
    if (!clip) return

    const hash = hashClip(clip)
    if (clip.type === 'image') {
      if (this.skipNextImage) {
        this.skipNextImage = false
        this.lastImageHash = hash
        return
      }
      if (hash === this.lastImageHash) return
      this.lastImageHash = hash
    }
    if (this.isSuppressed(hash)) return

    this.onCapture(clip, hash)
  }

  private readHtml(): string {
    try {
      return clipboard.readHTML() ?? ''
    } catch {
      return ''
    }
  }

  private readImageBuffer(formats: string[]): Buffer | null {
    const lowerFormats = formats.map((f) => f.toLowerCase())
    for (const candidate of IMAGE_BUFFER_FORMATS) {
      if (lowerFormats.includes(candidate.toLowerCase())) {
        try {
          const buffer = clipboard.readBuffer(candidate)
          if (buffer && buffer.length > 0) return buffer
        } catch {
          // try next candidate
        }
      }
    }

    // Fallback: some platforms only advertise a generic image format.
    if (formats.some(isImageFormat)) {
      try {
        const image = clipboard.readImage()
        if (!image.isEmpty()) return image.toPNG()
      } catch {
        return null
      }
    }

    return null
  }

  private readFilePaths(lowerFormats: string[]): string[] {
    if (lowerFormats.includes('text/uri-list')) {
      try {
        const uriList = clipboard.read('text/uri-list')
        if (uriList && uriList.trim()) {
          const paths = uriList
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith('#'))
            .map(decodeFileUri)
            .filter((value) => value.length > 0)
          if (paths.length > 0) return paths
        }
      } catch {
        // ignore and fall through to platform-specific formats
      }
    }

    try {
      if (lowerFormats.includes('filenamew')) {
        // Windows: UTF-16LE, NUL-separated list of file names.
        const buffer = clipboard.readBuffer('FileNameW')
        const decoded = buffer.toString('utf16le')
        return decoded.split('\u0000').filter((value) => value.trim().length > 0)
      }
      if (lowerFormats.includes('filename')) {
        const buffer = clipboard.readBuffer('FileName')
        return buffer.toString('utf8').split('\u0000').filter((value) => value.trim().length > 0)
      }
    } catch {
      return []
    }

    return []
  }
}
