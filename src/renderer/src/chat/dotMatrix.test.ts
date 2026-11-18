import { describe, expect, it } from 'vitest'
import {
  BASE_LEVEL,
  EDGE_FADE_PX,
  EDGE_LEFT_PX,
  EDGE_RIGHT_PX,
  INTRO_SWEEP_MS,
  INTRO_TOTAL_MS,
  approach,
  clamp01,
  dotLevel,
  introProgress,
  panelEdge,
  panelFrame,
  smoothstep,
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
  const width = 748

  it('keeps the left control cluster dark', () => {
    expect(panelEdge(0, width)).toBe(0)
    expect(panelEdge((EDGE_LEFT_PX - 1) / width, width)).toBe(0)
  })

  it('keeps the right control cluster dark', () => {
    expect(panelEdge(1, width)).toBe(0)
    expect(panelEdge((width - EDGE_RIGHT_PX + 1) / width, width)).toBe(0)
  })

  it('is solid across the middle of the bar', () => {
    expect(panelEdge(0.5, width)).toBe(1)
  })

  it('ramps up after the left margin', () => {
    const ramp = panelEdge((EDGE_LEFT_PX + EDGE_FADE_PX / 2) / width, width)
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

describe('panelFrame', () => {
  it('keeps square cells and centres the grid vertically', () => {
    const frame = panelFrame(748, 68)
    expect(frame.cols).toBe(187)
    expect(frame.rows).toBe(10)
    expect(frame.radius).toBeCloseTo(1.2)
    expect(frame.rowPixels[0]).toBeCloseTo(16)
    expect(frame.rowPixels[1] - frame.rowPixels[0]).toBeCloseTo(4)
  })

  it('precomputes the per-row and per-column values', () => {
    const frame = panelFrame(748, 68)
    expect(frame.xs).toHaveLength(187)
    expect(frame.edges).toHaveLength(187)
    expect(frame.rowYs).toHaveLength(10)
    expect(frame.rowPixels).toHaveLength(10)
    expect(frame.xs[0]).toBe(0)
    expect(frame.xs[186]).toBe(1)
    expect(frame.edges[0]).toBe(0)
    expect(frame.edges[93]).toBe(1)
    expect(frame.rowYs[0]).toBe(-1)
    expect(frame.rowYs[9]).toBe(1)
    expect(frame.rowPixels[0]).toBeCloseTo(16)
    expect(frame.rowPixels[9]).toBeCloseTo(52)
  })

  it('shrinks the cells when the bar is too short for the pitch', () => {
    const frame = panelFrame(400, 30)
    expect(frame.rowPixels[0]).toBeCloseTo(1.5)
    expect(frame.rowPixels[1] - frame.rowPixels[0]).toBeCloseTo(3)
  })

  it('never collapses on an unmeasured surface', () => {
    const frame = panelFrame(0, 0)
    expect(frame.cols).toBeGreaterThan(0)
    expect(frame.rows).toBeGreaterThan(0)
    expect(Number.isFinite(frame.radius)).toBe(true)
    expect(Number.isFinite(frame.centres[0])).toBe(true)
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
