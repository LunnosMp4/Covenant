import { describe, expect, it } from 'vitest'
import { formatTargetsSummary, normalizeLaunchTargets } from './launcherTargets'

describe('normalizeLaunchTargets', () => {
  it('returns existing targets when present', () => {
    const targets = [{ path: 'a.exe', arguments: '--x' }]
    expect(normalizeLaunchTargets(targets, 'legacy.exe', '')).toBe(targets)
  })

  it('falls back to the legacy path (trimmed) and raw arguments', () => {
    expect(normalizeLaunchTargets([], ' app.exe ', ' --flag ')).toEqual([
      { path: 'app.exe', arguments: ' --flag ' }
    ])
  })

  it('returns empty when nothing is provided', () => {
    expect(normalizeLaunchTargets(undefined, '', '')).toEqual([])
    expect(normalizeLaunchTargets([], undefined, undefined)).toEqual([])
  })
})

describe('formatTargetsSummary', () => {
  it('handles zero targets', () => {
    expect(formatTargetsSummary([])).toBe('No apps')
  })

  it('pluralizes correctly', () => {
    expect(formatTargetsSummary([{ path: 'a', arguments: '' }])).toBe('1 app')
    expect(
      formatTargetsSummary([
        { path: 'a', arguments: '' },
        { path: 'b', arguments: '' }
      ])
    ).toBe('2 apps')
  })
})