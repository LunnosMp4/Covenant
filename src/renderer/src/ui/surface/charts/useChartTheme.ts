import { useCallback, useEffect, useState } from 'react'
import type { ChartTheme } from '../../../../../shared/ui/chart'

function readVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim()
  return value || fallback
}

function readChartTheme(): ChartTheme {
  if (typeof window === 'undefined') {
    return {
      palette: ['#8FA3B8', '#B39A82', '#8FAF9A', '#A99BBB', '#B7A87F', '#93AFB5'],
      text: '#EDEDEB',
      muted: '#9A9A98',
      grid: 'rgba(255,255,255,0.08)',
      border: 'rgba(255,255,255,0.1)',
      surface: '#1B1C1F',
      fontFamily: 'system-ui, sans-serif',
      fontSize: 10,
      radius: 6,
      dark: true
    }
  }

  const styles = getComputedStyle(document.documentElement)
  const dark = document.documentElement.getAttribute('data-theme') !== 'light'

  return {
    palette: [1, 2, 3, 4, 5, 6].map((index) =>
      readVar(styles, `--ui-series-${index}`, dark ? '#8FA3B8' : '#5F7288')
    ),
    text: readVar(styles, '--chat-assistant-text', dark ? '#F1F1EF' : '#262624'),
    muted: readVar(styles, '--chat-meta-text', dark ? '#9A9A98' : '#6B6B68'),
    grid: readVar(styles, '--ui-grid', dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
    border: readVar(
      styles,
      '--chat-assistant-border',
      dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
    ),
    surface: readVar(styles, '--ui-surface', dark ? '#1B1C1F' : '#FFFFFF'),
    fontFamily: readVar(styles, '--ui-font', 'system-ui, sans-serif'),
    fontSize: 10,
    radius: 6,
    dark
  }
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
