import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PASTE_SETTINGS,
  countWords,
  isPasteItemType,
  isProbablyUrl,
  normalizePasteItemType,
  normalizePasteManagerSettings,
  normalizeUrl,
  truncatePreview
} from './paste'

describe('normalizePasteManagerSettings', () => {
  it('returns defaults for missing input', () => {
    expect(normalizePasteManagerSettings(undefined)).toEqual(DEFAULT_PASTE_SETTINGS)
    expect(normalizePasteManagerSettings(null)).toEqual(DEFAULT_PASTE_SETTINGS)
  })

  it('keeps valid values and clamps ranges', () => {
    const normalized = normalizePasteManagerSettings({
      enabled: false,
      maxItems: 5,
      maxAgeDays: 99999,
      captureImages: false,
      ocrEnabled: true,
      pasteBehavior: 'paste'
    })

    expect(normalized.enabled).toBe(false)
    expect(normalized.maxItems).toBe(10)
    expect(normalized.maxAgeDays).toBe(3650)
    expect(normalized.captureImages).toBe(false)
    expect(normalized.ocrEnabled).toBe(true)
    expect(normalized.pasteBehavior).toBe('copy')
  })

  it('treats empty maxAgeDays as unlimited', () => {
    expect(normalizePasteManagerSettings({ maxAgeDays: '' }).maxAgeDays).toBeNull()
    expect(normalizePasteManagerSettings({ maxAgeDays: null }).maxAgeDays).toBeNull()
    expect(normalizePasteManagerSettings({ maxAgeDays: 7 }).maxAgeDays).toBe(7)
  })

  it('ignores wrong-typed fields', () => {
    const normalized = normalizePasteManagerSettings({ enabled: 'yes', maxItems: 'lots' })
    expect(normalized.enabled).toBe(DEFAULT_PASTE_SETTINGS.enabled)
    expect(normalized.maxItems).toBe(DEFAULT_PASTE_SETTINGS.maxItems)
  })
})

describe('paste item type helpers', () => {
  it('validates known types', () => {
    expect(isPasteItemType('image')).toBe(true)
    expect(isPasteItemType('bogus')).toBe(false)
    expect(normalizePasteItemType('rich')).toBe('rich')
    expect(normalizePasteItemType(42)).toBe('text')
  })
})

describe('truncatePreview', () => {
  it('collapses whitespace and keeps short strings intact', () => {
    expect(truncatePreview('  hello\n world ')).toBe('hello world')
  })

  it('truncates long strings with an ellipsis', () => {
    const result = truncatePreview('a'.repeat(200), 20)
    expect(result.length).toBeLessThanOrEqual(20)
    expect(result.endsWith('…')).toBe(true)
  })
})

describe('isProbablyUrl / normalizeUrl', () => {
  it('detects simple URLs', () => {
    expect(isProbablyUrl('https://example.com')).toBe(true)
    expect(isProbablyUrl('www.example.com/path')).toBe(true)
    expect(isProbablyUrl('not a url')).toBe(false)
    expect(isProbablyUrl('https://a.com https://b.com')).toBe(false)
  })

  it('normalizes bare hosts to https', () => {
    expect(normalizeUrl('www.example.com')).toBe('https://www.example.com/')
    expect(normalizeUrl('https://example.com/x')).toBe('https://example.com/x')
    expect(normalizeUrl('ftp://example.com')).toBeNull()
  })
})

describe('countWords', () => {
  it('counts whitespace separated words', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('  ')).toBe(0)
    expect(countWords('hello   world\nagain')).toBe(3)
  })
})
