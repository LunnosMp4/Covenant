import { describe, expect, it } from 'vitest'
import { delay, mapWithConcurrency, mapWithConcurrencyResults } from './async'

describe('delay', () => {
  it('resolves after the requested time', async () => {
    const started = Date.now()
    await delay(20)
    expect(Date.now() - started).toBeGreaterThanOrEqual(15)
  })
})

describe('mapWithConcurrencyResults', () => {
  it('preserves input order and caps in-flight work', async () => {
    let inFlight = 0
    let peak = 0

    const results = await mapWithConcurrencyResults([5, 1, 3, 2, 4], 2, async (value) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await delay(value)
      inFlight -= 1
      return value * 2
    })

    expect(peak).toBeLessThanOrEqual(2)
    expect(results.map((entry) => (entry.ok ? entry.value : null))).toEqual([10, 2, 6, 4, 8])
  })

  it('captures failures per item without cancelling the rest', async () => {
    const results = await mapWithConcurrencyResults([1, 2, 3], 2, async (value) => {
      if (value === 2) throw new Error('boom')
      return value
    })

    expect(results[0]).toEqual({ ok: true, value: 1 })
    expect(results[1].ok).toBe(false)
    expect(results[2]).toEqual({ ok: true, value: 3 })
  })

  it('handles an empty list', async () => {
    await expect(mapWithConcurrencyResults([], 4, async () => 1)).resolves.toEqual([])
  })

  it('runs everything when the limit exceeds the item count', async () => {
    const seen: number[] = []
    await mapWithConcurrencyResults([1, 2], 10, async (value) => {
      seen.push(value)
      return value
    })
    expect(seen.sort()).toEqual([1, 2])
  })
})

describe('mapWithConcurrency', () => {
  it('visits every item and never exceeds the limit', async () => {
    let inFlight = 0
    let peak = 0
    const visited: number[] = []

    await mapWithConcurrency(Array.from({ length: 25 }, (_, index) => index), 4, async (value) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      visited.push(value)
      inFlight -= 1
    })

    expect(peak).toBeLessThanOrEqual(4)
    expect(visited).toHaveLength(25)
  })
})
