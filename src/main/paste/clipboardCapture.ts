import { createHash } from 'crypto'
import {
  countWords,
  isProbablyUrl,
  normalizeUrl,
  truncatePreview,
  type PasteItemType
} from '../../shared/paste'

/**
 * Pure clipboard classification/hashing helpers.
 *
 * This module deliberately avoids importing Electron so the classification
 * logic can be unit tested. The Electron clipboard reads happen in
 * `clipboardWatcher.ts`, which feeds a `RawClipboardSnapshot` in here.
 */

export interface RawClipboardSnapshot {
  formats: string[]
  text: string
  html: string
  filePaths: string[]
  imageBuffer: Buffer | null
  imageWidth?: number
  imageHeight?: number
}

export interface CapturedClip {
  type: PasteItemType
  text?: string
  html?: string
  imageBuffer?: Buffer
  imageWidth?: number
  imageHeight?: number
  filePaths?: string[]
  linkUrl?: string
  linkTitle?: string
  preview: string
  size: number
  charCount?: number
  wordCount?: number
}

export interface ClassifyOptions {
  captureImages: boolean
  captureRichText: boolean
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

export function isImageFormat(format: string): boolean {
  const lower = format.toLowerCase()
  return lower.startsWith('image/') || /^(png|bmp|tiff|tif|dib|jpeg|jpg|gif)$/.test(lower)
}

export function isImageMime(format: string): boolean {
  return isImageFormat(format)
}

/**
 * Builds a full clipboard payload from a snapshot following capture priority:
 * files > image > rich text > link > plain text.
 */
export function classifyClipboard(
  snapshot: RawClipboardSnapshot,
  options: ClassifyOptions
): CapturedClip | null {
  const filePaths = snapshot.filePaths.filter((p) => typeof p === 'string' && p.trim().length > 0)

  if (filePaths.length > 0) {
    const text = filePaths.join('\n')
    const previewBase =
      filePaths.length === 1 ? basename(filePaths[0]) : `${basename(filePaths[0])} +${filePaths.length - 1}`
    return {
      type: 'file',
      text,
      filePaths,
      preview: truncatePreview(previewBase),
      size: Buffer.byteLength(text)
    }
  }

  if (options.captureImages && snapshot.imageBuffer && snapshot.imageBuffer.length > 0) {
    const dims =
      snapshot.imageWidth && snapshot.imageHeight
        ? `${snapshot.imageWidth}×${snapshot.imageHeight}`
        : 'Image'
    return {
      type: 'image',
      imageBuffer: snapshot.imageBuffer,
      imageWidth: snapshot.imageWidth,
      imageHeight: snapshot.imageHeight,
      preview: truncatePreview(dims),
      size: snapshot.imageBuffer.length
    }
  }

  const text = snapshot.text ?? ''
  const html = snapshot.html ?? ''

  if (options.captureRichText && html.trim().length > 0 && text.trim().length > 0) {
    return {
      type: 'rich',
      text,
      html,
      preview: truncatePreview(text),
      size: Buffer.byteLength(text) + Buffer.byteLength(html),
      charCount: text.length,
      wordCount: countWords(text)
    }
  }

  if (text.trim().length > 0) {
    if (isProbablyUrl(text)) {
      const url = normalizeUrl(text) ?? text.trim()
      return {
        type: 'link',
        text: url,
        linkUrl: url,
        preview: truncatePreview(url),
        size: Buffer.byteLength(url)
      }
    }

    return {
      type: 'text',
      text,
      preview: truncatePreview(text),
      size: Buffer.byteLength(text),
      charCount: text.length,
      wordCount: countWords(text)
    }
  }

  return null
}

/**
 * Stable hash of a captured clip. Must stay deterministic so a "copy again"
 * action can suppress the watcher from re-capturing our own clipboard write.
 */
export function hashClip(clip: CapturedClip): string {
  const hash = createHash('sha1')
  hash.update(clip.type)
  hash.update('\u0000')
  if (clip.text) hash.update(clip.text)
  hash.update('\u0000')
  if (clip.html) hash.update(clip.html)
  hash.update('\u0000')
  if (clip.filePaths) hash.update(clip.filePaths.join('\n'))
  hash.update('\u0000')
  if (clip.imageBuffer) hash.update(clip.imageBuffer)
  return hash.digest('hex')
}

/** Cheap fingerprint used to detect text changes without hashing large strings. */
export function fingerprintText(text: string): string {
  if (text.length <= 256) return text
  return `${text.length}:${text.slice(0, 128)}:${text.slice(-128)}`
}
