import { describe, expect, it } from 'vitest'
import { extractAllOsc7Cwd, extractOsc7Cwd, extractSentinel, stripAnsi } from './ansi'

describe('stripAnsi', () => {
  it('removes SGR color sequences', () => {
    expect(stripAnsi('\u001B[31merror\u001B[0m')).toBe('error')
  })

  it('removes OSC sequences terminated by BEL', () => {
    expect(stripAnsi('\u001B]0;title\u0007hello')).toBe('hello')
  })

  it('leaves plain text untouched', () => {
    expect(stripAnsi('npm run build')).toBe('npm run build')
  })
})

describe('extractOsc7Cwd', () => {
  it('parses the reported working directory', () => {
    expect(extractOsc7Cwd('\u001B]7;file://host/Users/loic/project\u0007')).toBe('/Users/loic/project')
  })

  it('decodes percent-encoded paths', () => {
    expect(extractOsc7Cwd('\u001B]7;file://host/tmp/a%20b\u0007')).toBe('/tmp/a b')
  })

  it('returns null when absent', () => {
    expect(extractOsc7Cwd('just output')).toBeNull()
  })

  it('collects every occurrence', () => {
    const input = '\u001B]7;file://h/one\u0007mid\u001B]7;file://h/two\u0007'
    expect(extractAllOsc7Cwd(input)).toEqual(['/one', '/two'])
  })
})

describe('extractSentinel', () => {
  it('parses token, exit code and cwd', () => {
    const raw = '\u001B]1337;Covenant;tok-1;2;/tmp/work\u0007'
    expect(extractSentinel(raw)).toEqual({
      token: 'tok-1',
      exitCode: 2,
      cwd: '/tmp/work',
      raw
    })
  })

  it('accepts ST-terminated sequences', () => {
    const match = extractSentinel('\u001B]1337;Covenant;t;0;/home\u001B\\')
    expect(match?.exitCode).toBe(0)
    expect(match?.cwd).toBe('/home')
  })

  it('returns null for unrelated output', () => {
    expect(extractSentinel('no sentinel here')).toBeNull()
  })
})
