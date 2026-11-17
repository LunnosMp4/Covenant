import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildChartOption,
  clampChartHeight,
  formatChartValueWithUnit,
  type ChartData
} from '../../../../../shared/ui/chart'
import DataTable from '../DataTable'
import type { ChartInstance } from './chartEngine'
import { useChartTheme } from './useChartTheme'

interface ChartWidgetProps {
  data: ChartData
  onSettled?: () => void
}

function chartTable(data: ChartData): { columns: string[]; rows: string[][] } {
  const format = data.valueFormat ?? 'number'
  return {
    columns: ['Category', ...data.series.map((series) => series.label)],
    rows: data.categories.map((category, index) => [
      category,
      ...data.series.map((series) => {
        const value = series.values[index]
        return value === null || value === undefined
          ? 'No data'
          : formatChartValueWithUnit(value, format, data.unit)
      })
    ])
  }
}

/**
 * Presentational chart. The engine is injected lazily so ECharts stays out of
 * the startup bundle and only loads when a visual actually appears.
 */
export default function ChartWidget({ data, onSettled }: ChartWidgetProps): JSX.Element {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<ChartInstance | null>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const theme = useChartTheme()

  const height = clampChartHeight(data.height)
  const option = useMemo(() => {
    try {
      return buildChartOption(data, theme)
    } catch (error) {
      console.warn('[Covenant] chart option could not be built', error)
      return null
    }
  }, [data, theme])

  // The chart is created once per mount; later data/theme changes repaint in
  // place. The first option is captured so the mount effect stays dependency-free.
  const initialOptionRef = useRef(option)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    let cancelled = false

    const initial = initialOptionRef.current
    if (!initial) {
      console.warn('[Covenant] chart has no option to draw', data.title)
      setFailed(true)
      return
    }

    void import('./chartEngine')
      .then(async ({ chartEngine }) => {
        if (cancelled || !elementRef.current) return
        instanceRef.current = chartEngine.create(elementRef.current, initial)
        if (typeof document !== 'undefined' && document.fonts?.ready) {
          await document.fonts.ready.catch(() => undefined)
        }
        if (cancelled) return
        setReady(true)
        onSettled?.()
      })
      .catch((error) => {
        console.warn('[Covenant] chart failed', error)
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      instanceRef.current?.dispose()
      instanceRef.current = null
    }
    // Creating once is deliberate: option updates go through setOption below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Data or theme changes repaint in place, preserving the user's legend state.
  useEffect(() => {
    if (!option) return
    instanceRef.current?.setOption(option)
  }, [option])

  const table = chartTable(data)

  return (
    <div className={`surface-chart-block${ready ? ' surface-chart-block--ready' : ''}`}>
      <div className="surface-chart" style={{ height }}>
        <div
          ref={elementRef}
          className="surface-chart-canvas"
          role="img"
          aria-label={`${data.title}. The values are available in the data table below.`}
        />
      </div>

      {failed ? (
        <p role="status" className="surface-note">
          I couldn’t draw the chart. The values are listed below.
        </p>
      ) : null}

      <details className="surface-disclosure">
        <summary>View data</summary>
        <DataTable
          columns={table.columns}
          rows={table.rows}
          align={['left', ...data.series.map(() => 'right' as const)]}
          title={`${data.title} data`}
        />
      </details>
    </div>
  )
}
