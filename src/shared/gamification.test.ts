import { describe, expect, it } from 'vitest'
import {
  applyStreakBonus,
  calculateLevelFromTotalXp,
  getRankTitle,
  getXpForLevel
} from './gamification'

describe('getXpForLevel', () => {
  it('returns 0 for non-positive levels', () => {
    expect(getXpForLevel(0)).toBe(0)
    expect(getXpForLevel(-3)).toBe(0)
  })

  it('returns the expected cumulative XP thresholds', () => {
    expect(getXpForLevel(1)).toBe(100)
    expect(getXpForLevel(2)).toBe(273)
    expect(getXpForLevel(3)).toBe(491)
  })

  it('grows super-linearly', () => {
    const growth = getXpForLevel(10) / getXpForLevel(5)
    expect(growth).toBeGreaterThan(2)
  })
})

describe('calculateLevelFromTotalXp', () => {
  it('returns level 1 with zero progress for 0 XP', () => {
    const progress = calculateLevelFromTotalXp(0)
    expect(progress.level).toBe(1)
    expect(progress.currentXP).toBe(0)
    expect(progress.xpToNext).toBe(173)
    expect(progress.xpForCurrentLevel).toBe(100)
  })

  it('clamps negative input to 0', () => {
    expect(calculateLevelFromTotalXp(-50).level).toBe(1)
    expect(calculateLevelFromTotalXp(-50).currentXP).toBe(0)
  })

  it('reports level 2 exactly at its threshold', () => {
    const progress = calculateLevelFromTotalXp(273)
    expect(progress.level).toBe(2)
    expect(progress.currentXP).toBe(0)
    expect(progress.xpToNext).toBe(218)
  })

  it('computes partial progress within a level', () => {
    const progress = calculateLevelFromTotalXp(500)
    expect(progress.level).toBe(3)
    expect(progress.currentXP).toBe(9)
    expect(progress.xpToNext).toBe(255)
  })
})

describe('applyStreakBonus', () => {
  it('returns the base XP for no streak', () => {
    expect(applyStreakBonus(100, 0)).toBe(100)
  })

  it('scales with the streak up to the 20% cap', () => {
    expect(applyStreakBonus(100, 1)).toBe(102)
    expect(applyStreakBonus(100, 5)).toBe(110)
    expect(applyStreakBonus(100, 10)).toBe(120)
    expect(applyStreakBonus(100, 20)).toBe(120)
  })

  it('clamps negative inputs', () => {
    expect(applyStreakBonus(-10, 5)).toBe(0)
    expect(applyStreakBonus(100, -1)).toBe(100)
  })
})

describe('getRankTitle', () => {
  it('maps level thresholds to titles', () => {
    expect(getRankTitle(1)).toBe('Novice')
    expect(getRankTitle(3)).toBe('Initiate')
    expect(getRankTitle(7)).toBe('Apprentice')
    expect(getRankTitle(11)).toBe('Journeyman')
    expect(getRankTitle(16)).toBe('Adept')
    expect(getRankTitle(22)).toBe('Veteran')
    expect(getRankTitle(30)).toBe('Master')
    expect(getRankTitle(40)).toBe('Grandmaster')
  })

  it('clamps below level 1 to Novice', () => {
    expect(getRankTitle(0)).toBe('Novice')
    expect(getRankTitle(-5)).toBe('Novice')
  })
})