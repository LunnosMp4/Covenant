import { nativeImage, type NativeImage } from 'electron'
import { existsSync } from 'fs'

/**
 * Builds the tray icon at runtime so activity badges need no extra asset files.
 * Code activity is a colored dot in the bottom-right; an active meeting
 * recording adds a red mic badge in the top-right.
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

const RECORDING_COLOR: Rgb = { r: 239, g: 68, b: 68 }

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

function downsampleOverlay(dest: Buffer, overlay: Buffer, big: number): void {
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
}

function compositeDot(base: NativeImage, color: Rgb): NativeImage {
  const dest = base.resize({ width: PX, height: PX, quality: 'best' }).toBitmap() // premultiplied BGRA
  const big = PX * SUPERSAMPLE
  const s = SUPERSAMPLE
  const cx = (PX - DOT_RADIUS_PX - 1 + 0.5) * s - 0.5
  const cy = cx
  const outerR = DOT_RADIUS_PX * s
  const ringW = Math.max(1, SCALE) * s
  const innerR = Math.max(0, outerR - ringW)

  const overlay = Buffer.alloc(big * big * 4)
  for (let y = 0; y < big; y += 1) {
    for (let x = 0; x < big; x += 1) {
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
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

  downsampleOverlay(dest, overlay, big)
  return nativeImage.createFromBitmap(dest, { width: PX, height: PX, scaleFactor: SCALE })
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq > 0 ? clamp01(((px - ax) * dx + (py - ay) * dy) / lengthSq) : 0
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy))
}

function compositeMicBadge(base: NativeImage): NativeImage {
  const dest = base.resize({ width: PX, height: PX, quality: 'best' }).toBitmap()
  const big = PX * SUPERSAMPLE
  const s = SUPERSAMPLE
  const badgeCx = (25.2 + 0.5) * s - 0.5
  const badgeCy = (6.8 + 0.5) * s - 0.5
  const badgeR = 6.4 * s
  const stroke = 1.05 * s
  const micBodyRadius = 1.45 * s
  const micCx = 25.2 * s
  const micBodyTop = 3.6 * s
  const micBodyBottom = 8.2 * s
  const micArcCy = 8.1 * s
  const micArcR = 3.05 * s
  const micStemTop = 11.2 * s
  const micStemBottom = 12.7 * s
  const micBaseY = 12.8 * s

  const overlay = Buffer.alloc(big * big * 4)
  for (let y = 0; y < big; y += 1) {
    for (let x = 0; x < big; x += 1) {
      const dx = x - badgeCx
      const dy = y - badgeCy
      const badgeDist = Math.sqrt(dx * dx + dy * dy)
      const badgeAlpha = clamp01(badgeR - badgeDist + 0.5)
      if (badgeAlpha <= 0) continue

      // White microphone glyph inside the red badge.
      const bodyDist = distanceToSegment(x, y, micCx, micBodyTop, micCx, micBodyBottom)
      const body = clamp01(micBodyRadius - bodyDist + 0.5)

      const arcDist = Math.abs(Math.sqrt((x - micCx) * (x - micCx) + (y - micArcCy) * (y - micArcCy)) - micArcR)
      const arc =
        y >= micArcCy ? clamp01(stroke - arcDist + 0.5) : 0

      const stemDist = distanceToSegment(
        x,
        y,
        micCx,
        micStemTop,
        micCx,
        micStemBottom
      )
      const stem = clamp01(0.6 * s - stemDist + 0.5)
      const baseDist = distanceToSegment(
        x,
        y,
        micCx - 1.9 * s,
        micBaseY,
        micCx + 1.9 * s,
        micBaseY
      )
      const baseLine = clamp01(0.6 * s - baseDist + 0.5)

      const whiteAlpha = Math.max(body, arc, stem, baseLine)
      const i = (y * big + x) * 4
      const redR = RECORDING_COLOR.r
      const redG = RECORDING_COLOR.g
      const redB = RECORDING_COLOR.b

      // Badge red first, then the white glyph composited over it.
      const aBadge = badgeAlpha
      const aWhite = whiteAlpha * badgeAlpha
      const aRed = aBadge - aWhite
      overlay[i] = clampByte(255 * aWhite + redB * aRed)
      overlay[i + 1] = clampByte(255 * aWhite + redG * aRed)
      overlay[i + 2] = clampByte(255 * aWhite + redR * aRed)
      overlay[i + 3] = clampByte(aBadge * 255)
    }
  }

  downsampleOverlay(dest, overlay, big)
  return nativeImage.createFromBitmap(dest, { width: PX, height: PX, scaleFactor: SCALE })
}

export function buildTrayIcon(state: string, recording = false): NativeImage | null {
  const cacheKey = `${state}:${recording ? 'recording' : 'idle'}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const base = baseIcon()
  if (!base) return null
  const color = STATE_COLORS[state]
  let image = color ? compositeDot(base, color) : normalizedBase(base)
  if (recording) image = compositeMicBadge(image)
  cache.set(cacheKey, image)
  return image
}
