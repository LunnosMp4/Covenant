import { useEffect, useRef } from 'react'

interface AudioWaveformProps {
  /** Live analyser feeding the bars. When null the bars rest at their minimum. */
  analyser: AnalyserNode | null
  barCount?: number
  barHeight?: number
  barWidth?: number
  gap?: number
  className?: string
  barClassName?: string
}

const MIN_SCALE = 0.08
const STATIC_SCALE = 0.28

/**
 * Mirrored frequency-bar waveform used by the voice input bar and meeting
 * recordings. The centre is the strongest (lowest) bin and each half mirrors
 * outward, so the display reads as a single waveform rather than a level meter.
 */
export default function AudioWaveform({
  analyser,
  barCount = 64,
  barHeight = 28,
  barWidth = 3,
  gap = 3,
  className = '',
  barClassName = 'bg-white/70'
}: AudioWaveformProps): JSX.Element {
  const barsRef = useRef<HTMLDivElement>(null)
  const animFrameRef = useRef(0)
  const heightsRef = useRef<Float32Array | null>(null)

  useEffect(() => {
    const container = barsRef.current
    if (!container) return
    const bars = container.children as HTMLCollectionOf<HTMLDivElement>

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reducedMotion || !analyser) {
      const resting = reducedMotion ? STATIC_SCALE : MIN_SCALE
      for (let i = 0; i < bars.length; i++) {
        bars[i].style.transform = `scaleY(${resting})`
      }
      return
    }

    if (!heightsRef.current || heightsRef.current.length !== barCount) {
      heightsRef.current = new Float32Array(barCount).fill(MIN_SCALE)
    }
    const heights = heightsRef.current

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    const halfCount = Math.ceil(barCount / 2)
    const binStep = bufferLength / halfCount
    // Even counts have two centre bars; odd counts share one.
    const centerRight = Math.floor(barCount / 2)
    const centerLeft = Math.ceil(barCount / 2) - 1

    const update = (): void => {
      analyser.getByteFrequencyData(dataArray)

      for (let i = 0; i < halfCount; i++) {
        const binStart = Math.floor(i * binStep)
        const binEnd = Math.max(binStart + 1, Math.floor((i + 1) * binStep))
        let sum = 0
        let count = 0
        for (let j = binStart; j < binEnd && j < bufferLength; j++) {
          sum += dataArray[j]
          count++
        }
        const normalized = count > 0 ? sum / count / 255 : 0

        const rightIndex = centerRight + i
        const leftIndex = centerLeft - i

        const prevRight = heights[rightIndex] ?? MIN_SCALE
        const smoothedRight = prevRight * 0.6 + normalized * 0.4
        heights[rightIndex] = smoothedRight
        if (bars[rightIndex]) {
          bars[rightIndex].style.transform = `scaleY(${Math.max(MIN_SCALE, Math.min(1, smoothedRight))})`
        }

        if (leftIndex !== rightIndex) {
          const prevLeft = heights[leftIndex] ?? MIN_SCALE
          const smoothedLeft = prevLeft * 0.6 + normalized * 0.4
          heights[leftIndex] = smoothedLeft
          if (bars[leftIndex]) {
            bars[leftIndex].style.transform = `scaleY(${Math.max(MIN_SCALE, Math.min(1, smoothedLeft))})`
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(update)
    }

    animFrameRef.current = requestAnimationFrame(update)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [analyser, barCount])

  return (
    <div
      ref={barsRef}
      aria-hidden
      className={`flex items-center justify-center ${className}`}
      style={{ gap: `${gap}px` }}
    >
      {Array.from({ length: barCount }, (_, i) => (
        <div
          key={i}
          className={`rounded-full ${barClassName}`}
          style={{
            width: `${barWidth}px`,
            height: `${barHeight}px`,
            transform: `scaleY(${MIN_SCALE})`,
            transformOrigin: 'center'
          }}
        />
      ))}
    </div>
  )
}
