import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  INTRO_TOTAL_MS,
  approach,
  clamp01,
  dotLevel,
  introProgress,
  panelFrame,
  waveY,
  type PanelFrame
} from './dotMatrix'

interface VoiceDotMatrixProps {
  /**
   * Live microphone stream. `null` (or not ready yet) renders the synthetic
   * demo wave, so the panel can appear the instant recording starts.
   */
  stream: MediaStream | null
  /** Light themes get a near-black inset so the LEDs stay legible. */
  isLight?: boolean
}

interface RenderFrame extends PanelFrame {
  dpr: number
}

/** Dots grouped by quantised alpha, so a frame costs ~32 fills instead of ~1900. */
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

const EMPTY_FRAME: RenderFrame = { ...panelFrame(0, 0), dpr: 1 }

/** Fake speech envelope used until the microphone is ready. */
function demoLevel(t: number): number {
  const phrase = Math.max(0, Math.sin(t * 0.7))
  const syllable = Math.abs(Math.sin(t * 6.3)) ** 1.5
  const jitter = 0.5 + 0.5 * Math.sin(t * 17.1) * Math.sin(t * 3.7)
  return clamp01(phrase * (0.35 + 0.65 * syllable) * (0.6 + 0.4 * jitter))
}

/** One frame: evaluate the curve per column, then draw the dots bucket by bucket. */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  frame: RenderFrame,
  batch: DotBatch,
  level: number,
  time: number,
  elapsedMs: number
): void {
  const { width, height, dpr, cols, rows, radius, xs, centres, edges, rowYs, rowPixels } = frame

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const assembling = elapsedMs < INTRO_TOTAL_MS
  batch.count = 0

  for (let column = 0; column < cols; column++) {
    const progress = assembling ? introProgress(elapsedMs, column, cols) : 1
    const gain = edges[column] * progress
    if (gain <= MIN_ALPHA) continue

    const curve = waveY(xs[column], time, level)
    const centreX = centres[column]
    // Dots rise from below and grow as they settle into the grid.
    const rise = (1 - progress) * INTRO_RISE
    const dotRadius = radius * (INTRO_SCALE + (1 - INTRO_SCALE) * progress)

    for (let row = 0; row < rows; row++) {
      const alpha = dotLevel(rowYs[row], curve) * gain
      if (alpha < MIN_ALPHA) continue
      const index = batch.count++
      batch.x[index] = centreX
      batch.y[index] = rowPixels[row] + rise
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
}

export default function VoiceDotMatrix({
  stream,
  isLight = false
}: VoiceDotMatrixProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<RenderFrame>(EMPTY_FRAME)
  const batchRef = useRef<DotBatch | null>(null)
  const audioRef = useRef<{ analyser: AnalyserNode; data: Float32Array<ArrayBuffer> } | null>(null)
  const staticRepaintRef = useRef<() => void>(() => {})

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    if (!canvas || !host) return

    const measure = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      const previous = frameRef.current
      if (width === previous.width && height === previous.height && dpr === previous.dpr) return

      const frame = panelFrame(width, height)
      frameRef.current = { ...frame, dpr }

      const deviceWidth = Math.max(1, Math.round(width * dpr))
      const deviceHeight = Math.max(1, Math.round(height * dpr))
      if (canvas.width !== deviceWidth) canvas.width = deviceWidth
      if (canvas.height !== deviceHeight) canvas.height = deviceHeight

      if (frame.cols !== previous.cols || frame.rows !== previous.rows) {
        const total = frame.cols * frame.rows
        batchRef.current = {
          x: new Float32Array(total),
          y: new Float32Array(total),
          radius: new Float32Array(total),
          bucket: new Uint8Array(total),
          count: 0
        }
      }

      staticRepaintRef.current()
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
    audioRef.current = null
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
      audioRef.current = { analyser, data: new Float32Array(analyser.fftSize) }
      void audioCtx.resume()
    } catch {
      source?.disconnect()
      analyser?.disconnect()
      if (audioCtx) void audioCtx.close().catch(() => {})
      audioRef.current = null
      return
    }

    return () => {
      audioRef.current = null
      source?.disconnect()
      analyser?.disconnect()
      if (audioCtx) void audioCtx.close().catch(() => {})
    }
  }, [stream])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.fillStyle = '#ffffff'
    const start = performance.now()

    const paint = (now: number, level: number): void => {
      const batch = batchRef.current
      if (!batch) return
      drawFrame(ctx, frameRef.current, batch, level, now / 1000, now - start)
    }

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reducedMotion) {
      const drawStatic = (): void => paint(start + INTRO_TOTAL_MS, 0.25)
      staticRepaintRef.current = drawStatic
      drawStatic()
      return () => {
        staticRepaintRef.current = () => {}
      }
    }

    let level = 0
    let last = start
    let raf = 0

    const readTarget = (now: number): number => {
      const audio = audioRef.current
      if (!audio) return demoLevel(now / 1000)
      const { analyser, data } = audio
      analyser.getFloatTimeDomainData(data)
      let sum = 0
      for (let index = 0; index < data.length; index++) {
        sum += data[index] * data[index]
      }
      return clamp01(Math.sqrt(sum / data.length) * LEVEL_GAIN)
    }

    const frame = (now: number): void => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      level = approach(level, readTarget(now), dt, ATTACK_TAU, RELEASE_TAU)
      paint(now, level)
      raf = requestAnimationFrame(frame)
    }

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
    }
  }, [])

  return (
    <div className="relative h-full w-full">
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
