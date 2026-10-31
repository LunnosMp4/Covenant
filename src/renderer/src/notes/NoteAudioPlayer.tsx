import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { formatDuration } from '../../../shared/notes/meeting'

interface NoteAudioPlayerProps {
  src: string
  /** Fallback duration from the meeting metadata (the media may not know it). */
  durationMs?: number
  label?: string
}

/** Ensures only one segment plays at a time across the whole surface. */
let activeAudio: HTMLAudioElement | null = null

const SEEK_STEP_MS = 5_000

function PlayIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86Z" />
    </svg>
  )
}

function PauseIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

export default function NoteAudioPlayer({
  src,
  durationMs,
  label
}: NoteAudioPlayerProps): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const scrubbingRef = useRef(false)

  const [playing, setPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const [mediaDurationMs, setMediaDurationMs] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  const fallbackDuration = durationMs && durationMs > 0 ? durationMs : 0
  const totalMs = mediaDurationMs && mediaDurationMs > 0 ? mediaDurationMs : fallbackDuration
  const progress = totalMs > 0 ? Math.min(1, Math.max(0, currentMs / totalMs)) : 0

  useEffect(() => {
    setPlaying(false)
    setCurrentMs(0)
    setMediaDurationMs(null)
    setFailed(false)
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.load()
    }
  }, [src])

  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (!audio) return
      audio.pause()
      if (activeAudio === audio) activeAudio = null
    }
  }, [])

  const togglePlay = useCallback((): void => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      if (activeAudio && activeAudio !== audio) activeAudio.pause()
      activeAudio = audio
      void audio.play().catch(() => setPlaying(false))
    } else {
      audio.pause()
    }
  }, [])

  const seekTo = useCallback(
    (timeMs: number): void => {
      const audio = audioRef.current
      if (!audio || totalMs <= 0) return
      const clamped = Math.min(totalMs, Math.max(0, timeMs))
      // Update the UI immediately so the thumb doesn't snap back while the
      // media element processes the seek.
      setCurrentMs(clamped)
      audio.currentTime = clamped / 1000
    },
    [totalMs]
  )

  const seekToClientX = useCallback(
    (clientX: number): void => {
      const track = trackRef.current
      if (!track || totalMs <= 0) return
      const rect = track.getBoundingClientRect()
      if (rect.width <= 0) return
      seekTo(((clientX - rect.left) / rect.width) * totalMs)
    },
    [seekTo, totalMs]
  )

  const handleLoadedMetadata = (): void => {
    const audio = audioRef.current
    if (!audio) return

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setMediaDurationMs(audio.duration * 1000)
      return
    }

    // Older MediaRecorder files have no WebM duration. Force Chromium to scan
    // to the end so it can learn the real duration and enable seeking.
    const onSeeked = (): void => {
      audio.removeEventListener('seeked', onSeeked)
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setMediaDurationMs(audio.duration * 1000)
      }
      audio.currentTime = 0
      setCurrentMs(0)
    }
    audio.addEventListener('seeked', onSeeked)
    try {
      audio.currentTime = Number.MAX_SAFE_INTEGER
    } catch {
      audio.removeEventListener('seeked', onSeeked)
    }
  }

  const handleTrackKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (totalMs <= 0) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      seekTo(currentMs + (event.key === 'ArrowLeft' ? -SEEK_STEP_MS : SEEK_STEP_MS))
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      seekTo(event.key === 'Home' ? 0 : totalMs)
      return
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      togglePlay()
    }
  }

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setCurrentMs(0)
        }}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration
          if (Number.isFinite(value) && value > 0) setMediaDurationMs(value * 1000)
        }}
        onTimeUpdate={(event) => {
          if (!scrubbingRef.current) setCurrentMs(event.currentTarget.currentTime * 1000)
        }}
        onError={() => {
          setFailed(true)
          setPlaying(false)
        }}
      />

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          disabled={failed}
          aria-label={playing ? 'Pause audio' : 'Play audio'}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            playing
              ? 'border-[color:var(--chat-accent-strong)] bg-[color:var(--chat-accent-soft)] text-[color:var(--chat-accent)]'
              : 'border-white/10 bg-white/[0.04] text-neutral-300 hover:border-[color:var(--chat-accent-strong)] hover:bg-[color:var(--chat-accent-soft)] hover:text-[color:var(--chat-accent)]'
          }`}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-neutral-400">
            <span className="truncate">{label ?? 'Audio'}</span>
            <span className="shrink-0 tabular-nums text-neutral-500">
              {formatDuration(currentMs)} / {formatDuration(totalMs)}
            </span>
          </div>

          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label={label ? `${label} position` : 'Audio position'}
            aria-valuemin={0}
            aria-valuemax={Math.round(totalMs)}
            aria-valuenow={Math.round(currentMs)}
            aria-valuetext={`${formatDuration(currentMs)} of ${formatDuration(totalMs)}`}
            onPointerDown={(event) => {
              if (totalMs <= 0) return
              scrubbingRef.current = true
              event.currentTarget.setPointerCapture(event.pointerId)
              seekToClientX(event.clientX)
            }}
            onPointerMove={(event) => {
              if (!scrubbingRef.current) return
              seekToClientX(event.clientX)
            }}
            onPointerUp={(event) => {
              if (!scrubbingRef.current) return
              scrubbingRef.current = false
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            }}
            onPointerCancel={() => {
              scrubbingRef.current = false
            }}
            onKeyDown={handleTrackKeyDown}
            className="group relative flex h-4 w-full cursor-pointer touch-none items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--chat-accent-strong)]"
          >
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full w-full origin-left rounded-full bg-[color:var(--chat-accent)] opacity-80 group-hover:opacity-100"
                style={{ transform: `scaleX(${progress})` }}
              />
            </div>
            <span
              className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[color:var(--chat-accent)] shadow-[0_0_0_3px_var(--chat-accent-soft)]"
              style={{ left: `calc(${progress * 100}% - 5px)` }}
            />
          </div>

          {failed && <p className="mt-1 text-[10px] text-red-300">Audio unavailable.</p>}
        </div>
      </div>
    </div>
  )
}
