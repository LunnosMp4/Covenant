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
 *
 * A chart owns a canvas and an ECharts instance, so it is mounted only while it
 * is near the viewport: scrolling a long transcript away releases the instance
 * and scrolling back recreates it from the current data. This keeps memory and
 * CPU proportional to what is on screen rather than to the transcript length.
 */
export default function ChartWidget({ data }: ChartWidgetProps): JSX.Element {
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

  // The latest option, so a chart that mounts later (scrolled back into view, or
  // after a theme change while offscreen) draws the current data.
  const optionRef = useRef(option)
  optionRef.current = option

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    let cancelled = false
    let disposed = false
    let active = false

    const mount = (): void => {
      if (active || cancelled) return
      const initial = optionRef.current
      if (!initial) {
        console.warn('[Covenant] chart has no option to draw', data.title)
        setFailed(true)
        return
      }
      active = true

      void import('./chartEngine')
        .then(async ({ chartEngine }) => {
          if (cancelled || !active || !elementRef.current) return
          instanceRef.current = chartEngine.create(elementRef.current, optionRef.current ?? initial)
          if (typeof document !== 'undefined' && document.fonts?.ready) {
            await document.fonts.ready.catch(() => undefined)
          }
          if (cancelled || !active) return
          setFailed(false)
          setReady(true)
        })
        .catch((error) => {
          console.warn('[Covenant] chart failed', error)
          if (cancelled) return
          active = false
          setFailed(true)
        })
    }

    const unmount = (): void => {
      active = false
      instanceRef.current?.dispose()
      instanceRef.current = null
      if (!disposed) setReady(false)
    }

    // No IntersectionObserver (tests, very old host): keep the old behaviour.
    if (typeof IntersectionObserver === 'undefined') {
      mount()
      return () => {
        cancelled = true
        disposed = true
        unmount()
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (entry?.isIntersecting) mount()
        else unmount()
      },
      // A margin so the chart is ready before it is read, not while it moves.
      { rootMargin: '400px 0px' }
    )
    observer.observe(element)

    return () => {
      cancelled = true
      disposed = true
      observer.disconnect()
      unmount()
    }
    // Mounting once per visibility window is deliberate: option updates go
    // through setOption below, and only the latest option matters on remount.
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
