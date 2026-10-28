import { useEffect } from 'react'
import type { InteractiveRect, InteractiveViewport } from '../../types/renderer'

/** How often the reported surface rectangles are refreshed while visible. */
const REGION_REFRESH_MS = 100

const INTERACTIVE_SURFACE_SELECTOR = '[data-interactive-surface]'
const MAX_REGIONS = 128

function collectInteractiveRegions(): InteractiveRect[] {
  if (typeof document === 'undefined') return []

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const regions: InteractiveRect[] = []
  const seen = new Set<string>()

  for (const node of document.querySelectorAll<HTMLElement>(INTERACTIVE_SURFACE_SELECTOR)) {
    const rect = node.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue

    const style = window.getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    if (Number.parseFloat(style.opacity || '1') <= 0) continue

    const left = Math.max(0, Math.min(rect.left, viewportWidth))
    const top = Math.max(0, Math.min(rect.top, viewportHeight))
    const right = Math.max(0, Math.min(rect.right, viewportWidth))
    const bottom = Math.max(0, Math.min(rect.bottom, viewportHeight))
    if (right <= left || bottom <= top) continue

    const region: InteractiveRect = {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top)
    }
    const key = `${region.x}:${region.y}:${region.width}:${region.height}`
    if (seen.has(key)) continue
    seen.add(key)
    regions.push(region)
    if (regions.length >= MAX_REGIONS) break
  }

  return regions
}

function currentViewport(): InteractiveViewport {
  return { width: window.innerWidth, height: window.innerHeight }
}

/**
 * Windows click-through bridge.
 *
 * Electron's `setIgnoreMouseEvents(..., { forward: true })` installs a global
 * low-level mouse hook on the main thread, which makes every mouse movement in
 * the OS wait on the app. Instead we report the interactive surface rectangles
 * and let the main process toggle click-through from a cheap cursor poll.
 */
export function useWindowsClickThrough(visible: boolean): void {
  useEffect(() => {
    const windowApi = window.api?.window
    if (window.api?.platform !== 'win32' || !windowApi?.setInteractiveRegions) return

    if (!visible) {
      windowApi.setInteractiveRegions([], currentViewport())
      return
    }

    let lastSignature = ''
    const publish = (): void => {
      const regions = collectInteractiveRegions()
      const viewport = currentViewport()
      const signature = JSON.stringify({ regions, viewport })
      if (signature === lastSignature) return
      lastSignature = signature
      windowApi.setInteractiveRegions?.(regions, viewport)
    }

    publish()
    const timer = window.setInterval(publish, REGION_REFRESH_MS)
    window.addEventListener('resize', publish)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', publish)
      lastSignature = ''
      windowApi.setInteractiveRegions?.([], currentViewport())
    }
  }, [visible])

  useEffect(() => {
    const windowApi = window.api?.window
    if (window.api?.platform !== 'win32' || !windowApi?.setPointerDown) return

    if (!visible) {
      windowApi.setPointerDown(false)
      return
    }

    const onDown = (): void => windowApi.setPointerDown?.(true)
    const onUp = (): void => windowApi.setPointerDown?.(false)

    // Pause click-through toggling while dragging/selecting so the window can't
    // become transparent under an in-flight gesture.
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    window.addEventListener('blur', onUp)

    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      window.removeEventListener('blur', onUp)
      windowApi.setPointerDown?.(false)
    }
  }, [visible])
}
