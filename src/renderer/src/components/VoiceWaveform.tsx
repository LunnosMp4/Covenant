import { useEffect, useRef, useCallback } from 'react'

interface VoiceWaveformProps {
  stream: MediaStream
  barCount?: number
}

export default function VoiceWaveform({ stream, barCount = 64 }: VoiceWaveformProps): JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null)
  const animFrameRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const heightsRef = useRef<Float32Array | null>(null)

  const initAudio = useCallback(() => {
    const audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.75
    source.connect(analyser)

    audioCtxRef.current = audioCtx
    analyserRef.current = analyser
    sourceRef.current = source
    heightsRef.current = new Float32Array(barCount)
  }, [stream, barCount])

  useEffect(() => {
    initAudio()

    const analyser = analyserRef.current!
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const bars = canvasRef.current!.children as HTMLCollectionOf<HTMLDivElement>

    // We only compute values for half the bars, then mirror them.
    const halfCount = Math.ceil(barCount / 2)
    const binStep = bufferLength / halfCount

    const update = () => {
      analyser.getByteFrequencyData(dataArray)

      for (let i = 0; i < halfCount; i++) {
        const binStart = Math.floor(i * binStep)
        const binEnd = Math.floor((i + 1) * binStep)
        let sum = 0
        let count = 0
        for (let j = binStart; j < binEnd; j++) {
          sum += dataArray[j]
          count++
        }
        const avg = count > 0 ? sum / count : 0
        const normalized = avg / 255

        // Center of the waveform corresponds to i = 0 (strongest bin).
        // Index goes outward from the middle in both directions.
        const centerIndex = Math.floor(barCount / 2)
        const rightIndex = centerIndex + i
        const leftIndex = centerIndex - i

        // Smooth + apply for the right side
        const prevR = heightsRef.current![rightIndex]
        const smoothedR = prevR * 0.6 + normalized * 0.4
        heightsRef.current![rightIndex] = smoothedR
        const heightPxR = Math.max(3, smoothedR * 28)
        if (bars[rightIndex]) {
          bars[rightIndex].style.height = `${heightPxR}px`
        }

        // Smooth + apply for the left side (mirror)
        if (leftIndex !== rightIndex && bars[leftIndex]) {
          const prevL = heightsRef.current![leftIndex]
          const smoothedL = prevL * 0.6 + normalized * 0.4
          heightsRef.current![leftIndex] = smoothedL
          const heightPxL = Math.max(3, smoothedL * 28)
          bars[leftIndex].style.height = `${heightPxL}px`
        }
      }

      animFrameRef.current = requestAnimationFrame(update)
    }

    animFrameRef.current = requestAnimationFrame(update)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      sourceRef.current?.disconnect()
      analyserRef.current?.disconnect()
      audioCtxRef.current?.close()
      sourceRef.current = null
      analyserRef.current = null
      audioCtxRef.current = null
    }
  }, [initAudio, barCount])

  return (
    <div
      ref={canvasRef}
      className="flex-1 flex items-center justify-center gap-[3px] px-4 py-3"
    >
      {Array.from({ length: barCount }, (_, i) => (
        <div
          key={i}
          className="rounded-full bg-white/70"
          style={{
            width: '3px',
            height: '3px',
            minHeight: '3px',
            transition: 'height 50ms ease-out'
          }}
        />
      ))}
    </div>
  )
}