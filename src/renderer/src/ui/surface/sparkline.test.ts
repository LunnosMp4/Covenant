import { describe, expect, it } from 'vitest'
import { buildSparklinePath, SPARKLINE_VIEWBOX } from './sparkline'

function yValues(path: string): number[] {
  return [...path.matchAll(/L?[\d.]+ ([\d.]+)/g)].map((match) => Number(match[1]))
}

describe('buildSparklinePath', () => {
  it('spans the full width and keeps points inside the box', () => {
    const { line } = buildSparklinePath([1, 2, 3, 4])
    expect(SPARKLINE_VIEWBOX).toBe('0 0 100 24')
    expect(line.startsWith('M0 ')).toBe(true)
    expect(line.endsWith('100 2')).toBe(true)
    expect(yValues(line).every((y) => y >= 2 && y <= 22)).toBe(true)
  })

  it('breaks the line at a null instead of drawing through zero', () => {
    const { line } = buildSparklinePath([1, null, 3])
    // Two segments: each begins with its own move command.
    expect(line.match(/M/g)).toHaveLength(2)
  })

  it('draws a flat middle line when the series has no variance', () => {
    const { line } = buildSparklinePath([5, 5, 5])
    expect(yValues(line).every((y) => y === 12)).toBe(true)
  })

  it('survives empty and single-point input', () => {
    expect(buildSparklinePath([])).toEqual({ line: '', area: '', last: null })
    const single = buildSparklinePath([7])
    expect(single.line).toBe('M0 12')
    expect(single.last).toEqual({ x: 0, y: 12 })
    expect(single.area).toBe('')
  })

  it('exposes the last point for the end dot', () => {
    const { last } = buildSparklinePath([10, 4, 8])
    expect(last).toEqual({ x: 100, y: 8.67 })
  })
})
