import { describe, expect, it } from 'vitest'
import {
  BASE_LEVEL,
  INTRO_SWEEP_MS,
  INTRO_TOTAL_MS,
  approach,
  clamp01,
  dotLevel,
  introProgress,
  panelEdge,
  panelLayout,
  smoothstep,
  waveAmplitude,
  waveCurve,
  waveY
} from './dotMatrix'

describe('clamp01', () => {
  it('clamps and tolerates non-finite input', () => {
    expect(clamp01(-2)).toBe(0)
    expect(clamp01(0.4)).toBe(0.4)
    expect(clamp01(7)).toBe(1)
    expect(clamp01(Number.NaN)).toBe(0)
  })
})

describe('smoothstep', () => {
  it('hits both ends and the midpoint', () => {
    expect(smoothstep(0, 0.14, 0)).toBe(0)
    expect(smoothstep(0, 0.14, 0.14)).toBe(1)
    expect(smoothstep(0, 0.14, 0.07)).toBeCloseTo(0.5)
  })

  it('supports a descending range', () => {
    expect(smoothstep(1, 0.86, 1)).toBe(0)
    expect(smoothstep(1, 0.86, 0.86)).toBe(1)
  })
})

describe('panelEdge', () => {
  it('keeps the left control cluster dark', () => {
    expect(panelEdge(0, 748)).toBe(0)
    expect(panelEdge(20 / 748, 748)).toBe(0)
    expect(panelEdge(40 / 748, 748)).toBe(0)
  })

  it('keeps the right control cluster dark', () => {
    expect(panelEdge(680 / 748, 748)).toBe(0)
    expect(panelEdge(1, 748)).toBe(0)
  })

  it('is solid across the middle of the bar', () => {
    expect(panelEdge(374 / 748, 748)).toBe(1)
  })

  it('ramps up after the left margin', () => {
    const ramp = panelEdge(78 / 748, 748)
    expect(ramp).toBeGreaterThan(0)
    expect(ramp).toBeLessThan(1)
  })
})

describe('waveCurve', () => {
  it('stays inside its designed range', () => {
    for (let t = 0; t < 6; t += 0.13) {
      for (let x = 0; x <= 1; x += 0.01) {
        expect(Math.abs(waveCurve(x, t))).toBeLessThan(1.1)
      }
    }
  })

  it('moves over time', () => {
    expect(waveCurve(0.4, 1)).not.toBeCloseTo(waveCurve(0.4, 2), 3)
  })
})

describe('waveAmplitude', () => {
  it('is a flat thread at silence and full height when loud', () => {
    expect(waveAmplitude(0)).toBeCloseTo(0.07)
    expect(waveAmplitude(1)).toBeCloseTo(1.02)
  })
})

describe('waveY', () => {
  it('is pinned to the centre at both ends', () => {
    for (let t = 0; t < 5; t += 0.37) {
      expect(waveY(0, t, 1)).toBeCloseTo(0)
      expect(waveY(1, t, 1)).toBeCloseTo(0)
    }
  })

  it('barely moves when silent and swings widely when loud', () => {
    let quiet = 0
    let loud = 0
    for (let t = 0; t < 6; t += 0.11) {
      quiet = Math.max(quiet, Math.abs(waveY(0.5, t, 0)))
      loud = Math.max(loud, Math.abs(waveY(0.5, t, 1)))
    }
    expect(quiet).toBeLessThan(0.07)
    expect(loud).toBeGreaterThan(0.5)
    expect(loud).toBeLessThan(1)
  })
})

describe('dotLevel', () => {
  it('burns white on the curve', () => {
    expect(dotLevel(0, 0)).toBe(1)
  })

  it('dims with distance from the curve', () => {
    expect(dotLevel(0.222, 0)).toBeLessThan(dotLevel(0, 0))
    expect(dotLevel(0.444, 0)).toBeLessThan(dotLevel(0.222, 0))
  })

  it('keeps a halo two rows out, then falls back to the grid floor', () => {
    expect(dotLevel(0.444, 0)).toBeGreaterThan(BASE_LEVEL)
    expect(dotLevel(0.444, 0)).toBeLessThan(0.12)
    expect(dotLevel(1, 0)).toBe(BASE_LEVEL)
  })
})

describe('panelLayout', () => {
  it('keeps square cells and centres the grid vertically', () => {
    const layout = panelLayout(748, 68)
    expect(layout.cols).toBe(187)
    expect(layout.rows).toBe(10)
    expect(layout.cell).toBe(4)
    expect(layout.gridHeight).toBe(40)
    expect(layout.offsetY).toBe(14)
    expect(layout.radius).toBeCloseTo(1.2)
  })

  it('shrinks the cells when the bar is too short for the pitch', () => {
    const layout = panelLayout(400, 30)
    expect(layout.cell).toBe(3)
    expect(layout.gridHeight).toBe(30)
    expect(layout.offsetY).toBe(0)
  })

  it('never collapses on an unmeasured surface', () => {
    const layout = panelLayout(0, 0)
    expect(layout.cols).toBeGreaterThan(0)
    expect(layout.rows).toBeGreaterThan(0)
    expect(Number.isFinite(layout.radius)).toBe(true)
    expect(Number.isFinite(layout.offsetX)).toBe(true)
  })
})

describe('introProgress', () => {
  it('starts at zero and settles at one', () => {
    expect(introProgress(0, 0, 100)).toBe(0)
    expect(introProgress(INTRO_TOTAL_MS, 0, 100)).toBe(1)
    expect(introProgress(INTRO_TOTAL_MS + 500, 99, 100)).toBe(1)
  })

  it('stagger columns from left to right', () => {
    const elapsed = INTRO_SWEEP_MS / 2
    expect(introProgress(elapsed, 0, 101)).toBeGreaterThan(introProgress(elapsed, 100, 101))
  })

  it('rises monotonically for a column', () => {
    let previous = 0
    for (let elapsed = 0; elapsed <= INTRO_TOTAL_MS; elapsed += 16) {
      const value = introProgress(elapsed, 12, 100)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })
})

describe('approach', () => {
  it('converges on the target', () => {
    let value = 0
    for (let frame = 0; frame < 60; frame++) {
      value = approach(value, 1, 1 / 60, 0.06, 0.27)
    }
    expect(value).toBeGreaterThan(0.95)
  })

  it('rises faster than it falls', () => {
    const rise = approach(0, 1, 1 / 60, 0.06, 0.27)
    const fall = 1 - approach(1, 0, 1 / 60, 0.06, 0.27)
    expect(rise).toBeGreaterThan(fall * 3)
  })

  it('ignores an empty frame', () => {
    expect(approach(0.3, 1, 0, 0.06, 0.27)).toBe(0.3)
  })
})
