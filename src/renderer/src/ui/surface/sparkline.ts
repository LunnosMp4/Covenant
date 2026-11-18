/**
 * Sparkline geometry for a KPI cell.
 *
 * Kept pure and separate from the component so the gap and flat-series rules
 * are unit-tested: a null is a real gap (never zero), and a series with no
 * variance draws a flat line through the middle rather than dividing by zero.
 */

export interface SparklinePath {
  /** One `M…L…` segment per run of consecutive numbers. */
  line: string
  /** Closed area under the first segment, for the soft fill. */
  area: string
  /** Points themselves, for the end dot. */
  last: { x: number; y: number } | null
}

const WIDTH = 100
const HEIGHT = 24
const PADDING = 2

export function buildSparklinePath(values: ReadonlyArray<number | null>): SparklinePath {
  const numbers = values.filter((value): value is number => typeof value === 'number')
  if (numbers.length === 0) return { line: '', area: '', last: null }

  const min = Math.min(...numbers)
  const max = Math.max(...numbers)
  const span = max - min
  const usableHeight = HEIGHT - PADDING * 2
  const step = values.length > 1 ? WIDTH / (values.length - 1) : WIDTH

  const pointAt = (value: number, index: number): { x: number; y: number } => ({
    x: Number((index * step).toFixed(2)),
    y: Number(
      (PADDING + (span === 0 ? usableHeight / 2 : ((max - value) / span) * usableHeight)).toFixed(2)
    )
  })

  const segments: Array<Array<{ x: number; y: number }>> = []
  let current: Array<{ x: number; y: number }> = []

  values.forEach((value, index) => {
    if (typeof value !== 'number') {
      if (current.length > 0) segments.push(current)
      current = []
      return
    }
    current.push(pointAt(value, index))
  })
  if (current.length > 0) segments.push(current)

  const line = segments
    .map((segment) =>
      segment
        .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
        .join(' ')
    )
    .join(' ')

  const first = segments[0] ?? []
  const area =
    first.length > 1
      ? `${first.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ')} L${
          first[first.length - 1].x
        } ${HEIGHT} L${first[0].x} ${HEIGHT} Z`
      : ''

  const lastSegment = segments[segments.length - 1] ?? []
  const last = lastSegment.length > 0 ? lastSegment[lastSegment.length - 1] : null

  return { line, area, last }
}

export const SPARKLINE_VIEWBOX = `0 0 ${WIDTH} ${HEIGHT}`
