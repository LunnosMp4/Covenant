import { describe, expect, it } from 'vitest'
import { mergeChartOption } from './chartOption'

describe('mergeChartOption', () => {
  it('merges the first paint, when the instance has no option yet', () => {
    const option = { series: [{ type: 'bar', data: [1, 2] }] }

    // `getOption()` is undefined on a fresh instance: this is the exact case
    // that used to throw and leave every chart blank.
    expect(() => mergeChartOption(undefined, option)).not.toThrow()

    const merged = mergeChartOption(undefined, option)
    expect(merged.series).toEqual([{ type: 'bar', data: [1, 2] }])
    expect(merged.animation).toBe(false)
    expect(merged.aria).toEqual({ enabled: true })
  })

  it('also tolerates a null or legend-less previous option', () => {
    expect(() => mergeChartOption(null, {})).not.toThrow()
    expect(() => mergeChartOption({}, {})).not.toThrow()
    expect(() => mergeChartOption({ legend: 'nope' }, { legend: {} })).not.toThrow()
    expect(() => mergeChartOption({ legend: [] }, { legend: {} })).not.toThrow()
    expect(() => mergeChartOption({ legend: [{ selected: 'nope' }] }, { legend: {} })).not.toThrow()
    expect(mergeChartOption({ legend: [] }, { legend: {} }).legend).toEqual({})
  })

  it('carries the user legend selection across a repaint', () => {
    const previous = { legend: [{ selected: { Q2: false, Q3: true } }] }
    const option = { legend: { bottom: 0, textStyle: { color: '#fff' } }, series: [] }

    const merged = mergeChartOption(previous, option)

    expect(merged.legend).toEqual({
      bottom: 0,
      textStyle: { color: '#fff' },
      selected: { Q2: false, Q3: true }
    })
  })

  it('never forces animation back on and never mutates its inputs', () => {
    const previous = { legend: [{ selected: { A: false } }] }
    const option = { animation: true, legend: { selected: { A: true } } }
    const snapshot = JSON.parse(JSON.stringify(option))

    const merged = mergeChartOption(previous, option)

    expect(merged.animation).toBe(false)
    expect(option).toEqual(snapshot)
    expect(previous).toEqual({ legend: [{ selected: { A: false } }] })
  })

  it('keeps the zoom window the user panned to', () => {
    const previous = {
      dataZoom: [
        { type: 'inside', start: 20, end: 60 },
        { type: 'slider', startValue: 'Mar', endValue: 'Jul' }
      ]
    }
    const option = {
      dataZoom: [
        { type: 'inside', xAxisIndex: [0] },
        { type: 'slider', xAxisIndex: [0], height: 14 }
      ]
    }

    const merged = mergeChartOption(previous, option) as {
      dataZoom: Array<Record<string, unknown>>
    }

    expect(merged.dataZoom[0]).toMatchObject({ xAxisIndex: [0], start: 20, end: 60 })
    expect(merged.dataZoom[1]).toMatchObject({ height: 14, startValue: 'Mar', endValue: 'Jul' })
  })

  it('leaves dataZoom alone when either side has none', () => {
    const zoomed = { dataZoom: [{ type: 'inside', start: 10, end: 40 }] }
    expect(mergeChartOption(undefined, zoomed).dataZoom).toEqual([{ type: 'inside', start: 10, end: 40 }])
    expect(mergeChartOption(zoomed, { series: [] }).dataZoom).toBeUndefined()
  })
})
