import { describe, expect, it } from 'vitest'
import { parseBinaryVersion } from './version'

describe('parseBinaryVersion', () => {
  it('parses the CLI version banner', () => {
    expect(parseBinaryVersion('opencode v2.0.24')).toBe('2.0.24')
    expect(parseBinaryVersion('2.0.24')).toBe('2.0.24')
    expect(parseBinaryVersion('  v1.2.3\n')).toBe('1.2.3')
  })

  it('keeps prerelease suffixes', () => {
    expect(parseBinaryVersion('opencode v2.0.24-beta.1')).toBe('2.0.24-beta.1')
  })

  it('returns undefined for junk', () => {
    expect(parseBinaryVersion(undefined)).toBeUndefined()
    expect(parseBinaryVersion('')).toBeUndefined()
    expect(parseBinaryVersion('not a version')).toBeUndefined()
  })
})
