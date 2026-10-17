import { nativeImage, type NativeImage } from 'electron'
import { existsSync } from 'fs'

/**
 * Builds the tray icon at runtime so the activity badge dot needs no extra
 * asset files. The Covenant tray icon is composited with a small colored dot in
 * the bottom-right corner (idle returns the plain icon).
 *
 * The source PNG can be any size, so every state is normalized to a 16pt
 * (32px @2x) image. macOS draws a status-item image at its intrinsic size and
 * does not auto-scale like Windows, so returning the raw asset here would show
 * an enormous icon in the menu bar.
 */

type Rgb = { r: number; g: number; b: number }

const SIZE = 16
const SCALE = 2
const PX = SIZE * SCALE
const DOT_RADIUS = 4
const DOT_RADIUS_PX = DOT_RADIUS * SCALE
const SUPERSAMPLE = 4

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

function normalizedBase(base: NativeImage): NativeImage {
  const resized = base.resize({ width: PX, height: PX, quality: 'best' })
  return nativeImage.createFromBitmap(resized.toBitmap(), {
    width: PX,
    height: PX,
    scaleFactor: SCALE
  })
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value)
}

/**
 * Draws the status dot with supersampled, anti-aliased edges (a hard-edged
 * circle reads as pixelated at menu-bar size). The dot is rendered on a 4x grid
 * then box-downsampled and composited over the icon with a thin white outline.
 */
function compositeDot(base: NativeImage, color: Rgb): NativeImage {
  const dest = base.resize({ width: PX, height: PX, quality: 'best' }).toBitmap() // premultiplied BGRA

  const big = PX * SUPERSAMPLE
  const cx = (PX - DOT_RADIUS_PX - 1 + 0.5) * SUPERSAMPLE - 0.5
  const cy = cx
  const outerR = DOT_RADIUS_PX * SUPERSAMPLE
  const ringW = Math.max(1, SCALE) * SUPERSAMPLE
  const innerR = Math.max(0, outerR - ringW)

  const overlay = Buffer.alloc(big * big * 4)
  for (let y = 0; y < big; y += 1) {
    for (let x = 0; x < big; x += 1) {
      const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy))
      const aOuter = clamp01(outerR - dist + 0.5)
      if (aOuter <= 0) continue
      const aInner = clamp01(innerR - dist + 0.5)
      const aRing = aOuter - aInner
      const i = (y * big + x) * 4
      // Premultiplied: ring is white, inner disc is the state color. The two
      // layers are disjoint, so channels just add.
      overlay[i] = clampByte(255 * aRing + color.b * aInner)
      overlay[i + 1] = clampByte(255 * aRing + color.g * aInner)
      overlay[i + 2] = clampByte(255 * aRing + color.r * aInner)
      overlay[i + 3] = clampByte((aRing + aInner) * 255)
    }
  }

  for (let y = 0; y < PX; y += 1) {
    for (let x = 0; x < PX; x += 1) {
      let sb = 0
      let sg = 0
      let sr = 0
      let sa = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const oi = ((y * SUPERSAMPLE + sy) * big + (x * SUPERSAMPLE + sx)) * 4
          sb += overlay[oi]
          sg += overlay[oi + 1]
          sr += overlay[oi + 2]
          sa += overlay[oi + 3]
        }
      }
      const count = SUPERSAMPLE * SUPERSAMPLE
      const alpha = sa / count / 255
      if (alpha <= 0) continue
      const inv = 1 - alpha
      const di = (y * PX + x) * 4
      dest[di] = clampByte(sb / count + dest[di] * inv)
      dest[di + 1] = clampByte(sg / count + dest[di + 1] * inv)
      dest[di + 2] = clampByte(sr / count + dest[di + 2] * inv)
      dest[di + 3] = clampByte(alpha * 255 + dest[di + 3] * inv)
    }
  }

  return nativeImage.createFromBitmap(dest, { width: PX, height: PX, scaleFactor: SCALE })
}

export function buildTrayIcon(state: string): NativeImage | null {
  const cached = cache.get(state)
  if (cached) return cached
  const base = baseIcon()
  if (!base) return null
  const color = STATE_COLORS[state]
  const image = color ? compositeDot(base, color) : normalizedBase(base)
  cache.set(state, image)
  return image
}
