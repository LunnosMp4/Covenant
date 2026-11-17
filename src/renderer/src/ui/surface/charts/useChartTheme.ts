import { useCallback, useEffect, useState } from 'react'
import { chartThemeFrom, type ChartTheme } from '../../../../../shared/ui/chart'

const EMPTY_STYLE = { getPropertyValue: (): string => '' }

function readChartTheme(): ChartTheme {
  if (typeof window === 'undefined') return chartThemeFrom(EMPTY_STYLE, 'dark')

  const mode = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  return chartThemeFrom(getComputedStyle(document.documentElement), mode)
}

/**
 * Theme values are CSS custom properties on the document root, so charts follow
 * every theme (including custom gradients) without duplicating colour constants
 * in JavaScript. The observer keeps a re-render limited to theme changes.
 */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => readChartTheme())

  const refresh = useCallback(() => {
    setTheme(readChartTheme())
  }, [])

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-theme']
    })
    return () => observer.disconnect()
  }, [refresh])

  return theme
}
