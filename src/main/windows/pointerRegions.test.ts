import { describe, expect, it } from 'vitest'
import {
  isPointInInteractiveRegions,
  normalizeInteractiveRegions,
  normalizeInteractiveViewport,
  screenPointToViewportPoint
} from './pointerRegions'

describe('normalizeInteractiveRegions', () => {
  it('keeps valid rectangles', () => {
    expect(
      normalizeInteractiveRegions([
        { x: 10, y: 20, width: 100, height: 40 },
        { x: 0, y: 0, width: 1, height: 1 }
      ])
    ).toEqual([
      { x: 10, y: 20, width: 100, height: 40 },
      { x: 0, y: 0, width: 1, height: 1 }
    ])
  })

  it('drops malformed and zero-sized rectangles', () => {
    expect(
      normalizeInteractiveRegions([
        null,
        {},
        { x: 1, y: 2, width: 0, height: 10 },
        { x: 1, y: 2, width: 10, height: -1 },
        { x: Number.NaN, y: 2, width: 10, height: 10 },
        { x: 1, y: 2, width: 10, height: 10 }
      ])
    ).toEqual([{ x: 1, y: 2, width: 10, height: 10 }])
  })

  it('returns an empty list for non-arrays', () => {
    expect(normalizeInteractiveRegions(undefined)).toEqual([])
    expect(normalizeInteractiveRegions('nope')).toEqual([])
  })
})

describe('normalizeInteractiveViewport', () => {
  it('accepts positive sizes', () => {
    expect(normalizeInteractiveViewport({ width: 800, height: 520 })).toEqual({
      width: 800,
      height: 520
    })
  })

  it('rejects invalid sizes', () => {
    expect(normalizeInteractiveViewport({ width: 0, height: 10 })).toBeNull()
    expect(normalizeInteractiveViewport({ width: 10, height: 10 })).not.toBeNull()
    expect(normalizeInteractiveViewport(null)).toBeNull()
  })
})

describe('isPointInInteractiveRegions', () => {
  const regions = [
    { x: 100, y: 100, width: 200, height: 50 },
    { x: 400, y: 300, width: 50, height: 50 }
  ]

  it('detects points inside a rectangle', () => {
    expect(isPointInInteractiveRegions(150, 120, regions)).toBe(true)
    expect(isPointInInteractiveRegions(400, 300, regions)).toBe(true)
  })

  it('detects points outside every rectangle', () => {
    expect(isPointInInteractiveRegions(0, 0, regions)).toBe(false)
    expect(isPointInInteractiveRegions(350, 120, regions)).toBe(false)
    expect(isPointInInteractiveRegions(100, 151, regions)).toBe(false)
  })

  it('treats edges as inside', () => {
    expect(isPointInInteractiveRegions(100, 100, regions)).toBe(true)
    expect(isPointInInteractiveRegions(300, 150, regions)).toBe(true)
    expect(isPointInInteractiveRegions(100, 149, regions)).toBe(true)
  })
})

describe('screenPointToViewportPoint', () => {
  it('maps screen coordinates through the content bounds', () => {
    expect(
      screenPointToViewportPoint(
        { x: 150, y: 250 },
        { x: 100, y: 200, width: 1000, height: 800 },
        { width: 1000, height: 800 }
      )
    ).toEqual({ x: 50, y: 50 })
  })

  it('scales when CSS pixels and DIPs diverge', () => {
    expect(
      screenPointToViewportPoint(
        { x: 250, y: 250 },
        { x: 100, y: 100, width: 1000, height: 1000 },
        { width: 500, height: 500 }
      )
    ).toEqual({ x: 75, y: 75 })
  })
})
