import { describe, expect, it } from 'vitest'
import {
  classifyClipboard,
  fingerprintText,
  hashClip,
  isImageFormat,
  type RawClipboardSnapshot
} from './clipboardCapture'

const FULL: { captureImages: boolean; captureRichText: boolean } = {
  captureImages: true,
  captureRichText: true
}

function snapshot(partial: Partial<RawClipboardSnapshot>): RawClipboardSnapshot {
  return {
    formats: [],
    text: '',
    html: '',
    filePaths: [],
    imageBuffer: null,
    ...partial
  }
}

describe('isImageFormat', () => {
  it('recognizes image formats', () => {
    expect(isImageFormat('image/png')).toBe(true)
    expect(isImageFormat('PNG')).toBe(true)
    expect(isImageFormat('text/plain')).toBe(false)
  })
})

describe('classifyClipboard', () => {
  it('returns null for empty content', () => {
    expect(classifyClipboard(snapshot({}), FULL)).toBeNull()
  })

  it('prioritizes files', () => {
    const clip = classifyClipboard(
      snapshot({
        filePaths: ['C:/a/report.pdf'],
        text: 'ignored',
        imageBuffer: Buffer.from([1, 2, 3]),
        imageWidth: 4,
        imageHeight: 4
      }),
      FULL
    )
    expect(clip?.type).toBe('file')
    expect(clip?.filePaths).toEqual(['C:/a/report.pdf'])
    expect(clip?.preview).toBe('report.pdf')
  })

  it('captures images when enabled', () => {
    const buffer = Buffer.from([1, 2, 3, 4])
    const clip = classifyClipboard(
      snapshot({ imageBuffer: buffer, imageWidth: 100, imageHeight: 50 }),
      FULL
    )
    expect(clip?.type).toBe('image')
    expect(clip?.size).toBe(4)
    expect(clip?.preview).toBe('100×50')
  })

  it('ignores images when capture is disabled', () => {
    const clip = classifyClipboard(
      snapshot({ imageBuffer: Buffer.from([1, 2, 3]) }),
      { captureImages: false, captureRichText: true }
    )
    expect(clip).toBeNull()
  })

  it('detects rich text when enabled', () => {
    const clip = classifyClipboard(
      snapshot({ text: 'Hello world', html: '<b>Hello</b> world' }),
      FULL
    )
    expect(clip?.type).toBe('rich')
    expect(clip?.html).toBe('<b>Hello</b> world')
    expect(clip?.wordCount).toBe(2)
  })

  it('detects links', () => {
    const clip = classifyClipboard(snapshot({ text: 'https://example.com/a' }), FULL)
    expect(clip?.type).toBe('link')
    expect(clip?.linkUrl).toBe('https://example.com/a')
  })

  it('falls back to plain text', () => {
    const clip = classifyClipboard(snapshot({ text: 'just some notes' }), FULL)
    expect(clip?.type).toBe('text')
    expect(clip?.charCount).toBe(15)
  })
})

describe('hashClip', () => {
  it('is deterministic', () => {
    const clip = { type: 'text' as const, preview: 'a', size: 1, text: 'hello' }
    expect(hashClip(clip)).toBe(hashClip({ ...clip }))
  })

  it('changes with content', () => {
    const a = hashClip({ type: 'text', preview: 'a', size: 1, text: 'hello' })
    const b = hashClip({ type: 'text', preview: 'b', size: 1, text: 'world' })
    expect(a).not.toBe(b)
  })

  it('hashes the image bytes', () => {
    const a = hashClip({ type: 'image', preview: 'i', size: 2, imageBuffer: Buffer.from([1, 2]) })
    const b = hashClip({ type: 'image', preview: 'i', size: 2, imageBuffer: Buffer.from([2, 1]) })
    expect(a).not.toBe(b)
  })
})

describe('fingerprintText', () => {
  it('returns short strings verbatim', () => {
    expect(fingerprintText('hi')).toBe('hi')
  })

  it('fingerprints long strings with length', () => {
    const long = 'a'.repeat(1000)
    expect(fingerprintText(long)).toContain('1000:')
  })
})
