import { useSyncExternalStore } from 'react'
import { chartThemeFrom, type ChartTheme } from '../../../../../shared/ui/chart'

const EMPTY_STYLE = { getPropertyValue: (): string => '' }

function readChartTheme(): ChartTheme {
  if (typeof window === 'undefined') return chartThemeFrom(EMPTY_STYLE, 'dark')

  const mode = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  return chartThemeFrom(getComputedStyle(document.documentElement), mode)
}

function sameTheme(left: ChartTheme, right: ChartTheme): boolean {
  return (
    left.dark === right.dark &&
    left.text === right.text &&
    left.muted === right.muted &&
    left.grid === right.grid &&
    left.border === right.border &&
    left.surface === right.surface &&
    left.fontFamily === right.fontFamily &&
    left.fontSize === right.fontSize &&
    left.radius === right.radius &&
    left.palette.length === right.palette.length &&
    left.palette.every((color, index) => color === right.palette[index])
  )
}

/**
 * One observer for every chart, instead of one per canvas.
 *
 * Theme tokens are CSS custom properties on the document root. Reading them is
 * cheap individually but not when dozens of charts (a long transcript, plus the
 * expanded panel) each keep their own MutationObserver alive. Subscribers share
 * a single observer; reads are coalesced to one animation frame and skipped
 * entirely when nothing that charts use actually changed.
 */
let current: ChartTheme | null = null
const listeners = new Set<() => void>()
let observer: MutationObserver | null = null
let scheduled = false

function getSnapshot(): ChartTheme {
  if (!current) current = readChartTheme()
  return current
}

function flush(): void {
  scheduled = false
  const next = readChartTheme()
  if (current && sameTheme(next, current)) return
  current = next
  for (const listener of listeners) listener()
}

function schedule(): void {
  if (scheduled) return
  scheduled = true
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(flush)
  } else if (typeof setTimeout === 'function') {
    setTimeout(flush, 32)
  } else {
    flush()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  if (!observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-theme']
    })
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      observer?.disconnect()
      observer = null
    }
  }
}

export function useChartTheme(): ChartTheme {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
