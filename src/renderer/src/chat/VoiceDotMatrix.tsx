import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  INTRO_TOTAL_MS,
  approach,
  clamp01,
  dotLevel,
  introProgress,
  panelEdge,
  panelLayout,
  waveY,
  type PanelLayout
} from './dotMatrix'

interface VoiceDotMatrixProps {
  /**
   * Live microphone stream. `null` (or not ready yet) renders the synthetic
   * demo wave, so the panel can appear the instant recording starts.
   */
  stream: MediaStream | null
  /** Light themes get a near-black inset so the LEDs stay legible. */
  isLight?: boolean
  className?: string
}

interface RenderLayout extends PanelLayout {
  dpr: number
}

/** Dots grouped by quantised alpha, so the frame costs ~32 fills instead of ~1900. */
interface DotBatch {
  x: Float32Array
  y: Float32Array
  radius: Float32Array
  bucket: Uint8Array
  count: number
}

const ALPHA_LEVELS = 32
const MIN_ALPHA = 0.004
const ATTACK_TAU = 0.06
const RELEASE_TAU = 0.27
const LEVEL_GAIN = 9
/** How far below its row a dot starts during the intro. */
const INTRO_RISE = 10
/** Starting size of a dot during the intro. */
const INTRO_SCALE = 0.55

/** Fake speech envelope used until the microphone is ready. */
function demoLevel(t: number): number {
  const phrase = Math.max(0, Math.sin(t * 0.7))
  const syllable = Math.abs(Math.sin(t * 6.3)) ** 1.5
  const jitter = 0.5 + 0.5 * Math.sin(t * 17.1) * Math.sin(t * 3.7)
  return clamp01(phrase * (0.35 + 0.65 * syllable) * (0.6 + 0.4 * jitter))
}

/**
 * One frame: the curve is evaluated per column, every dot is assigned an alpha
 * by its distance to it, and the dots are drawn bucket by bucket.
 */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  layout: RenderLayout,
  batch: DotBatch,
  level: number,
  time: number,
  elapsedMs: number
): void {
  const { width, height, dpr, cols, rows, pitch, cell, radius, offsetX, offsetY } = layout
  if (cols <= 0 || rows <= 0) return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#ffffff'
  ctx.globalCompositeOperation = 'source-over'

  const assembling = elapsedMs < INTRO_TOTAL_MS
  batch.count = 0

  for (let column = 0; column < cols; column++) {
    const x = cols > 1 ? column / (cols - 1) : 0
    const edge = panelEdge(x, width)
    if (edge <= 0) continue

    const progress = assembling ? introProgress(elapsedMs, column, cols) : 1
    if (progress <= 0) continue

    const curve = waveY(x, time, level)
    const centreX = offsetX + column * pitch + pitch / 2
    // Dots rise from below and grow as they settle into the grid.
    const rise = (1 - progress) * INTRO_RISE
    const dotRadius = radius * (INTRO_SCALE + (1 - INTRO_SCALE) * progress)
    const gain = edge * progress

    for (let row = 0; row < rows; row++) {
      const rowY = rows > 1 ? (row / (rows - 1)) * 2 - 1 : 0
      const alpha = dotLevel(rowY, curve) * gain
      if (alpha < MIN_ALPHA) continue
      const index = batch.count++
      batch.x[index] = centreX
      batch.y[index] = offsetY + row * cell + cell / 2 + rise
      batch.radius[index] = dotRadius
      batch.bucket[index] = Math.min(ALPHA_LEVELS - 1, (alpha * ALPHA_LEVELS) | 0)
    }
  }

  for (let bucket = 0; bucket < ALPHA_LEVELS; bucket++) {
    ctx.globalAlpha = Math.min(1, (bucket + 0.7) / ALPHA_LEVELS)
    ctx.beginPath()
    let drawn = false
    for (let index = 0; index < batch.count; index++) {
      if (batch.bucket[index] !== bucket) continue
      const dotRadius = batch.radius[index]
      ctx.moveTo(batch.x[index] + dotRadius, batch.y[index])
      ctx.arc(batch.x[index], batch.y[index], dotRadius, 0, Math.PI * 2)
      drawn = true
    }
    if (drawn) ctx.fill()
  }

  ctx.globalAlpha = 1
}

export default function VoiceDotMatrix({
  stream,
  isLight = false,
  className = ''
}: VoiceDotMatrixProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef<RenderLayout>({ ...panelLayout(0, 0), dpr: 1 })
  const batchRef = useRef<DotBatch | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const timeDataRef = useRef<Float32Array<ArrayBuffer> | null>(null)
  const repaintRef = useRef<() => void>(() => {})
  const startRef = useRef(0)

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    if (!canvas || !host) return

    const measure = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      const layout = panelLayout(width, height)
      const previous = layoutRef.current
      layoutRef.current = { ...layout, dpr }

      const deviceWidth = Math.max(1, Math.round(width * dpr))
      const deviceHeight = Math.max(1, Math.round(height * dpr))
      if (canvas.width !== deviceWidth) canvas.width = deviceWidth
      if (canvas.height !== deviceHeight) canvas.height = deviceHeight

      if (layout.cols !== previous.cols || layout.rows !== previous.rows) {
        const total = layout.cols * layout.rows
        batchRef.current = {
          x: new Float32Array(total),
          y: new Float32Array(total),
          radius: new Float32Array(total),
          bucket: new Uint8Array(total),
          count: 0
        }
      }

      repaintRef.current()
    }

    const observer = new ResizeObserver(measure)
    observer.observe(host)
    window.addEventListener('resize', measure)
    measure()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // Audio graph only. Swapping the stream must not restart the animation loop.
  useEffect(() => {
    analyserRef.current = null
    timeDataRef.current = null
    if (!stream) return

    let audioCtx: AudioContext | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let analyser: AnalyserNode | null = null

    try {
      audioCtx = new AudioContext()
      source = audioCtx.createMediaStreamSource(stream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0
      source.connect(analyser)
      analyserRef.current = analyser
      timeDataRef.current = new Float32Array(analyser.fftSize)
      void audioCtx.resume()
    } catch {
      source?.disconnect()
      analyser?.disconnect()
      if (audioCtx) void audioCtx.close().catch(() => {})
      analyserRef.current = null
      timeDataRef.current = null
      return
    }

    return () => {
      analyserRef.current = null
      timeDataRef.current = null
      source?.disconnect()
      analyser?.disconnect()
      if (audioCtx) void audioCtx.close().catch(() => {})
    }
  }, [stream])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    startRef.current = performance.now()

    const paint = (now: number, level: number): void => {
      const batch = batchRef.current
      if (!batch) return
      drawFrame(ctx, layoutRef.current, batch, level, now / 1000, now - startRef.current)
    }

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reducedMotion) {
      const drawStatic = (): void => {
        paint(startRef.current + INTRO_TOTAL_MS, 0.25)
      }
      repaintRef.current = drawStatic
      drawStatic()
      return () => {
        repaintRef.current = () => {}
      }
    }

    let level = 0
    let last = performance.now()
    let raf = 0

    const readTarget = (now: number): number => {
      const analyser = analyserRef.current
      const timeData = timeDataRef.current
      if (analyser && timeData) {
        analyser.getFloatTimeDomainData(timeData)
        let sum = 0
        for (let index = 0; index < timeData.length; index++) {
          sum += timeData[index] * timeData[index]
        }
        return clamp01(Math.sqrt(sum / timeData.length) * LEVEL_GAIN)
      }
      return demoLevel(now / 1000)
    }

    const frame = (now: number): void => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      level = approach(level, readTarget(now), dt, ATTACK_TAU, RELEASE_TAU)
      paint(now, level)
      raf = requestAnimationFrame(frame)
    }

    repaintRef.current = () => paint(performance.now(), level)
    raf = requestAnimationFrame(frame)

    const onVisibilityChange = (): void => {
      cancelAnimationFrame(raf)
      if (!document.hidden) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      repaintRef.current = () => {}
    }
  }, [])

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: isLight ? 'rgba(7, 8, 10, 0.94)' : 'rgba(0, 0, 0, 0.22)',
          boxShadow: isLight
            ? 'inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 0 0 1px rgba(255, 255, 255, 0.05)'
            : 'inset 0 1px 0 rgba(255, 255, 255, 0.04)'
        }}
      />
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
    </div>
  )
}
