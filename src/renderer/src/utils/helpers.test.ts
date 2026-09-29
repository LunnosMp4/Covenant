import { describe, expect, it } from 'vitest'
import { getAppBadgeText, createId } from './helpers'

describe('getAppBadgeText', () => {
  it('returns the first two letters uppercase', () => {
    expect(getAppBadgeText('Visual Studio')).toBe('VI')
    expect(getAppBadgeText('vscode')).toBe('VS')
  })

  it('trims surrounding whitespace', () => {
    expect(getAppBadgeText('  code  ')).toBe('CO')
  })

  it('falls back for empty titles', () => {
    expect(getAppBadgeText('')).toBe('AP')
    expect(getAppBadgeText('   ')).toBe('AP')
  })
})

describe('createId', () => {
  it('produces a non-empty unique id', () => {
    expect(createId()).toBeTruthy()
    expect(createId()).not.toBe(createId())
  })

  it('supports a prefix', () => {
    expect(createId('task_').startsWith('task_')).toBe(true)
  })
})