import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components'
import { init, use, type EChartsType } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { mergeChartOption } from './chartOption'

// Only the chart types the semantic contract can produce are registered.
// Scatter/heatmap/dataset/visual-map are never emitted by `buildChartOption`,
// so shipping them would only grow the sandbox bundle (injected per generated
// surface) and its memory footprint.
use([
  GridComponent,
  LegendComponent,
  TooltipComponent,
  DataZoomComponent,
  AriaComponent,
  BarChart,
  LineChart,
  PieChart,
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
  /** Last size applied to the instance, so redundant resizes are skipped. */
  width: number
  height: number
}

/**
 * Safety ceiling for live canvases. Charts are normally released by the widget
 * when they scroll out of view; this only matters if that observer is missing.
 * It never evicts a chart that is still on screen, because the component would
 * keep a dead instance ref and the visual would stay blank.
 */
const MAXIMUM_LIVE_CHARTS = 16

const entries = new Map<HTMLElement, ChartEntry>()

function isOffscreen(element: HTMLElement): boolean {
  if (!element.isConnected) return true
  const box = element.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return true
  return box.bottom < -400 || box.top > window.innerHeight + 400
}

function pruneEntries(): void {
  if (entries.size < MAXIMUM_LIVE_CHARTS) {
    for (const entry of [...entries.values()]) {
      if (!entry.element.isConnected) disposeEntry(entry)
    }
    return
  }

  for (const entry of [...entries.values()]) {
    if (entries.size < MAXIMUM_LIVE_CHARTS) break
    if (isOffscreen(entry.element)) disposeEntry(entry)
  }
}

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
  // A fresh instance has no option at all, so `getOption()` is `undefined`;
  // `mergeChartOption` treats that as "nothing to preserve" (the first paint).
  const previous = entry.chart.getOption() as Record<string, unknown> | undefined
  const next = mergeChartOption(previous, option)
  entry.option = next

  try {
    // `lazyUpdate` defers the paint to the next animation frame, which Chromium
    // throttles in cross-origin frames that are scrolled out of view: the canvas
    // would not exist until the user scrolled back. These updates are small and
    // infrequent, so paint synchronously instead.
    entry.chart.setOption(next as never, { notMerge: false, lazyUpdate: false })
  } catch (error) {
    // A malformed option should degrade to the data table, not crash the feed.
    console.warn('[Covenant] chart option rejected', error)
  }
}

export const chartEngine = {
  create(element: HTMLElement, option: Record<string, unknown>): ChartInstance {
    const existing = entries.get(element)
    if (existing) disposeEntry(existing)

    pruneEntries()

    // Never pass `width`/`height` here: zrender keeps them as sticky painter
    // opts, and every later `resize()` then reuses them instead of measuring the
    // element — which leaves the chart frozen at its mount size when the
    // transcript is narrowed again. Without them, the DOM is the source of truth.
    const chart = init(element, undefined, {
      renderer: 'canvas',
      devicePixelRatio: Math.min(2, window.devicePixelRatio || 1)
    })

    const entry: ChartEntry = { chart, element, observer: null, option, width: 0, height: 0 }
    entries.set(element, entry)
    try {
      applyOption(entry, option)
    } catch (error) {
      // Never keep a half-initialised instance around: it would hold the element
      // (and its canvas) for the lifetime of the page.
      disposeEntry(entry)
      throw error
    }

    const resizeToElement = (): void => {
      const width = Math.round(element.clientWidth)
      const height = Math.round(element.clientHeight)
      // A collapsed or hidden surface measures 0; the observer calls us again as
      // soon as it has a real box.
      if (width === 0 || height === 0) return
      if (width === entry.width && height === entry.height) return
      entry.width = width
      entry.height = height
      try {
        chart.resize()
      } catch {
        // Ignore resize races while the surface is being torn down.
      }
    }

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(resizeToElement)
      observer.observe(element)
      entry.observer = observer
      resizeToElement()
    }

    return {
      setOption(next: Record<string, unknown>) {
        if (!entries.has(element)) return
        applyOption(entry, next)
      },
      resize() {
        entry.width = 0
        entry.height = 0
        resizeToElement()
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
