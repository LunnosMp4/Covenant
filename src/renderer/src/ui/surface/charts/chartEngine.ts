import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  AriaComponent,
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent
} from 'echarts/components'
import { init, use, type EChartsType } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

use([
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  DataZoomComponent,
  VisualMapComponent,
  AriaComponent,
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  HeatmapChart,
  CanvasRenderer
])

export interface ChartInstance {
  setOption(option: Record<string, unknown>): void
  resize(): void
  refresh(): void
  dispose(): void
}

interface ChartEntry {
  chart: EChartsType
  element: HTMLElement
  observer: ResizeObserver | null
  option: Record<string, unknown>
}

export const MAXIMUM_LIVE_CHARTS = 8
const MAXIMUM_CHART_WIDTH = 2_048
const MAXIMUM_CHART_HEIGHT = 640
const MINIMUM_CHART_WIDTH = 240
const MINIMUM_CHART_HEIGHT = 120

const entries = new Map<HTMLElement, ChartEntry>()

function disposeEntry(entry: ChartEntry): void {
  entry.observer?.disconnect()
  entry.observer = null
  entries.delete(entry.element)
  try {
    entry.chart.dispose()
  } catch {
    // Disposal races with a removed DOM node; nothing useful to report.
  }
}

function applyOption(entry: ChartEntry, option: Record<string, unknown>): void {
  // Preserve the legend selection (and any zoom) the user set across theme
  // refreshes; a repaint must never reset the interface.
  const previous = entry.chart.getOption() as Record<string, unknown>
  const next: Record<string, unknown> = { ...option, animation: false, aria: { enabled: true } }

  const previousLegend = Array.isArray(previous.legend) ? previous.legend[0] : undefined
  if (next.legend && previousLegend && typeof previousLegend === 'object') {
    const selected = (previousLegend as { selected?: unknown }).selected
    if (selected && typeof selected === 'object') {
      next.legend = { ...(next.legend as object), selected }
    }
  }

  entry.option = next
  try {
    entry.chart.setOption(next as never, { notMerge: false, lazyUpdate: true })
  } catch {
    // A malformed option should degrade to the data table, not crash the feed.
  }
}

function boundedSize(element: HTMLElement): { width: number; height: number } {
  const width = Math.round(element.clientWidth || 320)
  const height = Math.round(element.clientHeight || 220)
  return {
    width: Math.min(MAXIMUM_CHART_WIDTH, Math.max(MINIMUM_CHART_WIDTH, width)),
    height: Math.min(MAXIMUM_CHART_HEIGHT, Math.max(MINIMUM_CHART_HEIGHT, height))
  }
}

export const chartEngine = {
  create(element: HTMLElement, option: Record<string, unknown>): ChartInstance {
    const existing = entries.get(element)
    if (existing) disposeEntry(existing)

    while (entries.size >= MAXIMUM_LIVE_CHARTS) {
      const oldest = entries.values().next().value as ChartEntry | undefined
      if (!oldest) break
      disposeEntry(oldest)
    }

    const { width, height } = boundedSize(element)
    const chart = init(element, undefined, {
      renderer: 'canvas',
      width,
      height,
      devicePixelRatio: Math.min(2, window.devicePixelRatio || 1)
    })

    const entry: ChartEntry = { chart, element, observer: null, option }
    entries.set(element, entry)
    applyOption(entry, option)

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        if (element.clientWidth === 0 || element.clientHeight === 0) return
        try {
          chart.resize({ animation: { duration: 0 } })
        } catch {
          // Ignore resize races while the surface is being torn down.
        }
      })
      observer.observe(element)
      entry.observer = observer
    }

    return {
      setOption(next: Record<string, unknown>) {
        if (!entries.has(element)) return
        applyOption(entry, next)
      },
      resize() {
        try {
          chart.resize({ animation: { duration: 0 } })
        } catch {
          // no-op
        }
      },
      refresh() {
        if (!entries.has(element)) return
        applyOption(entry, entry.option)
      },
      dispose() {
        disposeEntry(entry)
      }
    }
  },

  disposeAll(): void {
    for (const entry of [...entries.values()]) disposeEntry(entry)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => chartEngine.disposeAll())
}

declare global {
  interface Window {
    covenantChartsRuntime?: {
      chartEngine: typeof chartEngine
    }
  }
}
