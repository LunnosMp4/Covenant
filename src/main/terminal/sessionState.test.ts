import { describe, expect, it } from 'vitest'
import { ShellStateTracker } from './sessionState'

const MAX_OUTPUT_CHARS = 200_000

function createTracker(): ShellStateTracker {
  return new ShellStateTracker('session-1', '/bin/zsh', '/tmp')
}

describe('ShellStateTracker output buffer', () => {
  it('keeps appended output readable', () => {
    const tracker = createTracker()
    tracker.feed('one\n')
    tracker.feed('two\n')

    expect(tracker.getOutputLength()).toBe(8)
    expect(tracker.read()).toBe('one\ntwo')
  })

  it('bounds retained output to the AI-facing maximum', () => {
    const tracker = createTracker()
    tracker.feed('a'.repeat(MAX_OUTPUT_CHARS))
    tracker.feed('b'.repeat(1000))

    expect(tracker.getOutputLength()).toBe(MAX_OUTPUT_CHARS)
    expect(tracker.readSince(0, MAX_OUTPUT_CHARS)).toHaveLength(MAX_OUTPUT_CHARS)
    expect(tracker.readSince(0, MAX_OUTPUT_CHARS).endsWith('b'.repeat(1000))).toBe(true)
  })

  it('trims across many small chunks without losing the tail', () => {
    const tracker = createTracker()
    const chunk = 'x'.repeat(997) + '\n'
    const total = 400
    for (let index = 0; index < total; index += 1) {
      tracker.feed(`${String(index).padStart(3, '0')}${chunk}`)
    }

    const expectedLength = Math.min(total * 1001, MAX_OUTPUT_CHARS)
    expect(tracker.getOutputLength()).toBe(expectedLength)

    const output = tracker.readSince(0, MAX_OUTPUT_CHARS)
    // `readSince` trims, so a trailing newline may drop one character.
    expect(output.length).toBeGreaterThanOrEqual(expectedLength - 1)
    expect(output.length).toBeLessThanOrEqual(expectedLength)
    // The newest chunk must still be the tail of the retained output.
    expect(output.endsWith(`${String(total - 1).padStart(3, '0')}${chunk}`.trimEnd())).toBe(true)
  })

  it('reads only output produced after an offset', () => {
    const tracker = createTracker()
    tracker.feed('first\n')
    const offset = tracker.getOutputLength()
    tracker.feed('second\n')

    expect(tracker.readSince(offset)).toBe('second')
    expect(tracker.readSince(0)).toBe('first\nsecond')
  })

  it('caps readSince to the requested number of lines', () => {
    const tracker = createTracker()
    tracker.feed('a\nb\nc\nd')

    expect(tracker.readSince(0, 2)).toBe('c\nd')
  })

  it('strips ANSI escapes before storing output', () => {
    const tracker = createTracker()
    tracker.feed('\u001B[31mred\u001B[0m\n')

    expect(tracker.read()).toBe('red')
  })
})
