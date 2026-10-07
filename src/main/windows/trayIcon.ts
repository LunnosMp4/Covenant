import { nativeImage, type NativeImage } from 'electron'
import { existsSync } from 'fs'

/**
 * Builds the tray icon at runtime so the activity badge dot needs no extra
 * asset files. The Covenant tray icon is composited with a small colored dot in
 * the bottom-right corner (idle returns the plain icon).
 */

type Rgb = { r: number; g: number; b: number }

const SIZE = 16
const DOT_RADIUS = 4

const STATE_COLORS: Record<string, Rgb> = {
  running: { r: 59, g: 130, b: 246 },
  awaiting: { r: 245, g: 158, b: 11 },
  finished: { r: 34, g: 197, b: 94 },
  error: { r: 239, g: 68, b: 68 }
}

let baseIconPath: string | null = null
const cache = new Map<string, NativeImage>()

export function setTrayIconPath(path: string): void {
  baseIconPath = existsSync(path) ? path : null
  cache.clear()
}

export function getTrayIconPath(): string | null {
  return baseIconPath
}

function baseIcon(): NativeImage | null {
  if (!baseIconPath || !existsSync(baseIconPath)) return null
  const image = nativeImage.createFromPath(baseIconPath)
  return image.isEmpty() ? null : image
}

function compositeDot(base: NativeImage, color: Rgb): NativeImage {
  const resized = base.resize({ width: SIZE, height: SIZE, quality: 'best' })
  const bitmap = resized.toBitmap() // BGRA order
  const cx = SIZE - DOT_RADIUS - 1
  const cy = SIZE - DOT_RADIUS - 1
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > DOT_RADIUS) continue
      const i = (y * SIZE + x) * 4
      if (dist > DOT_RADIUS - 1.25) {
        // White ring keeps the dot legible on dark icons.
        bitmap[i] = 255
        bitmap[i + 1] = 255
        bitmap[i + 2] = 255
        bitmap[i + 3] = 255
      } else {
        bitmap[i] = color.b
        bitmap[i + 1] = color.g
        bitmap[i + 2] = color.r
        bitmap[i + 3] = 255
      }
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: SIZE, height: SIZE })
}

export function buildTrayIcon(state: string): NativeImage | null {
  const cached = cache.get(state)
  if (cached) return cached
  const base = baseIcon()
  if (!base) return null
  const color = STATE_COLORS[state]
  const image = color ? compositeDot(base, color) : base
  cache.set(state, image)
  return image
}
