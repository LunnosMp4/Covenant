/**
 * Option merge for a live chart instance.
 *
 * Deliberately pure: the very first paint happens before ECharts holds any
 * option, so `getOption()` is `undefined` there — the merge must handle that,
 * and a legend-less option, without touching the chart or the DOM.
 *
 * Kept out of `chartEngine.ts` so it can be unit-tested without importing
 * ECharts (which also keeps the regression that shipped from ever coming back).
 */

function legendSelection(legend: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(legend)) return undefined
  const first: unknown = legend[0]
  if (!first || typeof first !== 'object') return undefined
  const selected = (first as { selected?: unknown }).selected
  return selected && typeof selected === 'object'
    ? (selected as Record<string, unknown>)
    : undefined
}

const ZOOM_WINDOW_KEYS = ['start', 'end', 'startValue', 'endValue'] as const

/** The visible window of each dataZoom entry, if the user panned or zoomed it. */
function zoomWindows(dataZoom: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(dataZoom)) return undefined
  return dataZoom.map((entry) => {
    if (!entry || typeof entry !== 'object') return {}
    const source = entry as Record<string, unknown>
    const window: Record<string, unknown> = {}
    for (const key of ZOOM_WINDOW_KEYS) {
      if (source[key] !== undefined) window[key] = source[key]
    }
    return window
  })
}

/**
 * Injects the renderer-owned defaults (`animation: false` on replay, ARIA on)
 * and carries the user's legend selection and zoom window across a repaint, so
 * a theme change never resets the interface.
 */
export function mergeChartOption(
  previous: Record<string, unknown> | undefined | null,
  option: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...option, animation: false, aria: { enabled: true } }

  const selected = legendSelection(previous?.legend)
  if (next.legend && selected) {
    next.legend = { ...(next.legend as Record<string, unknown>), selected }
  }

  const windows = zoomWindows(previous?.dataZoom)
  if (windows && Array.isArray(next.dataZoom)) {
    next.dataZoom = next.dataZoom.map((entry, index) => {
      const window = windows[index]
      if (!window || !entry || typeof entry !== 'object') return entry
      return { ...(entry as Record<string, unknown>), ...window }
    })
  }

  return next
}
