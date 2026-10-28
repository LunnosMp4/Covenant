import type {
  InteractiveRect,
  InteractiveViewport
} from '../../shared/windows/interactive'

/** Upper bound on renderer-reported rectangles (defensive against bad IPC). */
const MAX_INTERACTIVE_REGIONS = 128

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

/**
 * Sanitizes rectangles coming from the renderer. Anything malformed or
 * zero-sized is dropped; the list is capped so a compromised renderer cannot
 * make the main-process hit test arbitrarily expensive.
 */
export function normalizeInteractiveRegions(value: unknown): InteractiveRect[] {
  if (!Array.isArray(value)) return []

  const regions: InteractiveRect[] = []
  for (const raw of value.slice(0, MAX_INTERACTIVE_REGIONS)) {
    if (!raw || typeof raw !== 'object') continue
    const record = raw as Record<string, unknown>
    const x = toFiniteNumber(record.x)
    const y = toFiniteNumber(record.y)
    const width = toFiniteNumber(record.width)
    const height = toFiniteNumber(record.height)
    if (x === null || y === null || width === null || height === null) continue
    if (width <= 0 || height <= 0) continue
    regions.push({ x, y, width, height })
  }

  return regions
}

export function normalizeInteractiveViewport(value: unknown): InteractiveViewport | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const width = toFiniteNumber(record.width)
  const height = toFiniteNumber(record.height)
  if (width === null || height === null || width <= 0 || height <= 0) return null
  return { width, height }
}

export function isPointInInteractiveRegions(
  x: number,
  y: number,
  regions: InteractiveRect[]
): boolean {
  for (const region of regions) {
    if (
      x >= region.x &&
      x <= region.x + region.width &&
      y >= region.y &&
      y <= region.y + region.height
    ) {
      return true
    }
  }
  return false
}

/**
 * Converts a screen-space cursor point into the renderer's CSS-pixel space.
 * `bounds` is the window's content area in DIPs; `viewport` is the renderer's
 * inner size in CSS pixels. They normally match 1:1, but the scale keeps the
 * hit test correct if zoom or DPI handling ever diverges.
 */
export function screenPointToViewportPoint(
  point: { x: number; y: number },
  bounds: { x: number; y: number; width: number; height: number },
  viewport: InteractiveViewport
): { x: number; y: number } {
  const scaleX = bounds.width > 0 ? bounds.width / viewport.width : 1
  const scaleY = bounds.height > 0 ? bounds.height / viewport.height : 1
  return {
    x: (point.x - bounds.x) / scaleX,
    y: (point.y - bounds.y) / scaleY
  }
}
