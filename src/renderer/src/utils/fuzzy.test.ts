import { describe, expect, it } from 'vitest'
import type { LauncherItem } from '../../../shared/launcher'
import { normalizeText, rankLauncherItems, scoreLauncherItem } from './fuzzy'

function app(id: string, title: string, path = `/Applications/${title}.app`): LauncherItem {
  return { id, kind: 'app', title, score: 0, app: { path } }
}

describe('normalizeText', () => {
  it('lowercases, trims and strips accents', () => {
    expect(normalizeText('  Éléphant  ')).toBe('elephant')
  })
})

describe('scoreLauncherItem', () => {
  it('scores an exact match highest', () => {
    const exact = scoreLauncherItem('chrome', app('1', 'Chrome'))
    const prefix = scoreLauncherItem('chro', app('2', 'Chrome'))
    const substring = scoreLauncherItem('rome', app('3', 'Chrome'))
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(substring)
  })

  it('ignores accent differences', () => {
    expect(scoreLauncherItem('telephone', app('1', 'Téléphone'))).toBeGreaterThan(0)
  })

  it('matches the executable name when the title differs', () => {
    const item: LauncherItem = {
      id: '1',
      kind: 'app',
      title: 'Visual Studio Code',
      score: 0,
      app: { path: 'C:\\Program Files\\Code\\Code.exe' }
    }
    expect(scoreLauncherItem('code', item)).toBeGreaterThan(0)
  })

  it('matches intent through aliases', () => {
    expect(scoreLauncherItem('browser', app('1', 'Google Chrome'))).toBeGreaterThan(0)
  })

  it('does not match a long sentence against a short app name', () => {
    expect(scoreLauncherItem('chrome is my favorite browser', app('1', 'Chrome'))).toBe(0)
  })
})

describe('rankLauncherItems', () => {
  const items = [
    app('chrome', 'Google Chrome'),
    app('chromium', 'Chromium'),
    app('code', 'Visual Studio Code'),
    app('firefox', 'Firefox')
  ]

  it('returns nothing for an empty query', () => {
    expect(rankLauncherItems('', items)).toEqual([])
  })

  it('ranks the most relevant app first', () => {
    const results = rankLauncherItems('chrome', items)
    expect(results[0].title).toBe('Google Chrome')
  })

  it('filters out items below the match threshold', () => {
    const results = rankLauncherItems('firefox', items)
    expect(results.map((item) => item.title)).not.toContain('Visual Studio Code')
  })

  it('honors the limit', () => {
    const results = rankLauncherItems('c', items, 1)
    expect(results).toHaveLength(1)
  })
})
