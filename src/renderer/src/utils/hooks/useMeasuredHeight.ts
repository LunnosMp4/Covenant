import { useCallback, useLayoutEffect, useState } from 'react'

interface MeasuredHeight<T extends HTMLElement> {
  ref: (node: T | null) => void
  height: number
}

/**
 * Measures an element's natural height and keeps it in sync via a
 * ResizeObserver. This lets us animate to an explicit pixel height instead of
 * `height: 'auto'`, which Framer Motion cannot interpolate without temporarily
 * rendering the final (expanded) state to measure it — the source of the
 * "flash of the end state before the animation" glitch.
 *
 * The callback ref means measurement starts as soon as the target mounts, even
 * when it is conditionally rendered (e.g. inside AnimatePresence).
 */
export function useMeasuredHeight<T extends HTMLElement = HTMLDivElement>(): MeasuredHeight<T> {
  const [element, setElement] = useState<T | null>(null)
  const [height, setHeight] = useState(0)

  const ref = useCallback((node: T | null) => {
    setElement(node)
  }, [])

  useLayoutEffect(() => {
    if (!element) return

    const measure = (): void => {
      setHeight(element.offsetHeight)
    }

    measure()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(measure)
    observer.observe(element)

    return () => observer.disconnect()
  }, [element])

  return { ref, height }
}
