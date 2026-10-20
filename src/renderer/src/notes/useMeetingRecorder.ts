import { useCallback, useEffect, useRef, useState } from 'react'
import type { Note, NoteMeetingEvent } from '../../../shared/notes/note'
import { MEETING_SEGMENT_MS } from '../../../shared/notes/meeting'

export type MeetingRecorderStatus =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'finalizing'
  | 'transcribing'
  | 'summarizing'
  | 'completed'
  | 'error'

export interface MeetingRecorderState {
  noteId: string | null
  note: Note | null
  status: MeetingRecorderStatus
  startedAt: number | null
  elapsedMs: number
  level: number
  transcript: string
  error: string | null
  systemAudioWarning: string | null
}

export interface MeetingRecorderApi {
  state: MeetingRecorderState
  isRecording: boolean
  isBusy: boolean
  startMeeting: (options?: { captureSystemAudio?: boolean }) => Promise<Note | null>
  stopMeeting: () => Promise<void>
  cancelMeeting: () => Promise<void>
  summarizeMeeting: (noteId?: string) => Promise<void>
  clearError: () => void
}

const INITIAL_STATE: MeetingRecorderState = {
  noteId: null,
  note: null,
  status: 'idle',
  startedAt: null,
  elapsedMs: 0,
  level: 0,
  transcript: '',
  error: null,
  systemAudioWarning: null
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm'
  return MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm'
}

export function useMeetingRecorder(): MeetingRecorderApi {
  const [state, setState] = useState<MeetingRecorderState>(INITIAL_STATE)

  const noteIdRef = useRef<string | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const recordingRef = useRef(false)
  const startingRef = useRef(false)
  const discardRef = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sourceTracksRef = useRef<MediaStreamTrack[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const segmentIndexRef = useRef(0)
  const segmentStartRef = useRef(0)
  const chunksRef = useRef<Blob[]>([])
  const segmentResolverRef = useRef<(() => void) | null>(null)
  const audioChunksRef = useRef<Uint8Array<ArrayBuffer> | null>(null)

  const clearTimers = useCallback((): void => {
    if (segmentTimerRef.current) {
      clearTimeout(segmentTimerRef.current)
      segmentTimerRef.current = null
    }
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current)
      tickTimerRef.current = null
    }
  }, [])

  const stopTracks = useCallback((): void => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    sourceTracksRef.current.forEach((track) => track.stop())
    sourceTracksRef.current = []
    void audioContextRef.current?.close().catch(() => {})
    audioContextRef.current = null
    analyserRef.current = null
    audioChunksRef.current = null
  }, [])

  const reset = useCallback((): void => {
    recordingRef.current = false
    startingRef.current = false
    noteIdRef.current = null
    startedAtRef.current = null
    segmentResolverRef.current = null
    setState(INITIAL_STATE)
  }, [])

  const tick = useCallback((): void => {
    const startedAt = startedAtRef.current
    if (!startedAt) return
    let level = 0
    const analyser = analyserRef.current
    if (analyser) {
      if (!audioChunksRef.current || audioChunksRef.current.length !== analyser.fftSize) {
        audioChunksRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize))
      }
      analyser.getByteTimeDomainData(audioChunksRef.current)
      let sum = 0
      for (const sample of audioChunksRef.current) {
        const normalized = (sample - 128) / 128
        sum += normalized * normalized
      }
      level = Math.min(1, Math.sqrt(sum / audioChunksRef.current.length) * 3.2)
    }
    setState((previous) => ({
      ...previous,
      elapsedMs: Date.now() - startedAt,
      level
    }))
  }, [])

  const appendSegment = useCallback(async (blob: Blob, index: number, durationMs: number): Promise<void> => {
    const noteId = noteIdRef.current
    if (!noteId || blob.size === 0) return
    try {
      const data = await blob.arrayBuffer()
      const result = await window.api?.notes?.meeting?.appendSegment({
        noteId,
        index,
        durationMs,
        data
      })
      if (result && !result.success && result.error) {
        setState((previous) => ({ ...previous, error: result.error ?? null }))
      }
    } catch (error) {
      setState((previous) => ({
        ...previous,
        error: error instanceof Error ? error.message : 'Unable to save the audio segment.'
      }))
    }
  }, [])

  const startSegment = useCallback(
    (index: number): void => {
      const stream = streamRef.current
      if (!stream || !recordingRef.current) return

      segmentIndexRef.current = index
      segmentStartRef.current = Date.now()
      chunksRef.current = []

      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream, {
          mimeType: pickMimeType(),
          audioBitsPerSecond: 64_000
        })
      } catch (error) {
        setState((previous) => ({
          ...previous,
          error: error instanceof Error ? error.message : 'Unable to start the recorder.'
        }))
        return
      }

      recorderRef.current = recorder
      const stopPromise = new Promise<void>((resolve) => {
        segmentResolverRef.current = resolve
      })

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        chunksRef.current = []
        const durationMs = Math.max(0, Date.now() - segmentStartRef.current)
        const shouldDiscard = discardRef.current
        const shouldContinue = recordingRef.current

        void (shouldDiscard ? Promise.resolve() : appendSegment(blob, index, durationMs))
          .catch(() => {})
          .finally(() => {
            segmentResolverRef.current?.()
            segmentResolverRef.current = null
            if (shouldContinue && recordingRef.current) {
              startSegment(index + 1)
            }
          })
      }

      recorder.start()

      if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current)
      segmentTimerRef.current = setTimeout(() => {
        segmentTimerRef.current = null
        if (recorder.state === 'recording') {
          recorder.stop()
        }
      }, MEETING_SEGMENT_MS)

      // Keep the promise reachable for stopMeeting().
      void stopPromise
    },
    [appendSegment]
  )

  const waitForSegmentStop = useCallback(async (): Promise<void> => {
    const recorder = recorderRef.current
    const resolver = segmentResolverRef.current
    if (!resolver) return

    const pending = new Promise<void>((resolve) => {
      segmentResolverRef.current = () => {
        resolver()
        resolve()
      }
    })
    if (recorder && recorder.state === 'recording') {
      recorder.stop()
    }
    await pending
  }, [])

  const captureStreams = useCallback(
    async (captureSystemAudio: boolean): Promise<{ warning: string | null }> => {
      const micPromise = navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      // Start the screen/system-audio request immediately, before awaiting the
      // microphone, so the click's user activation is still valid.
      let pendingSystemStream: MediaStream | null = null
      const systemPromise: Promise<MediaStream | null> = captureSystemAudio
        ? navigator.mediaDevices
            .getDisplayMedia({ audio: true, video: true })
            .then((stream) => {
              pendingSystemStream = stream
              return stream
            })
            .catch(() => null)
        : Promise.resolve(null)

      let mic: MediaStream
      try {
        mic = await micPromise
      } catch (error) {
        const leaked = pendingSystemStream as MediaStream | null
        leaked?.getTracks().forEach((track: MediaStreamTrack) => track.stop())
        throw error
      }

      const system = await systemPromise
      let warning: string | null = null
      let usableSystem: MediaStream | null = system
      if (usableSystem) {
        usableSystem.getVideoTracks().forEach((track) => track.stop())
        const audio = usableSystem.getAudioTracks()[0]
        if (!audio || audio.readyState === 'ended') {
          warning =
            'System audio is unavailable. Check the screen/audio recording permission in System Settings.'
          usableSystem.getTracks().forEach((track) => track.stop())
          usableSystem = null
        }
      } else if (captureSystemAudio) {
        warning = 'System audio permission was denied or the stream could not be created. Recording the microphone only.'
      }

      const context = new AudioContext()
      const destination = context.createMediaStreamDestination()
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.75
      const master = context.createGain()
      master.gain.value = 0.8
      master.connect(destination)
      master.connect(analyser)

      const micSource = context.createMediaStreamSource(mic)
      micSource.connect(master)

      if (usableSystem) {
        const systemSource = context.createMediaStreamSource(usableSystem)
        systemSource.connect(master)
      }

      await context.resume().catch(() => {})

      streamRef.current = destination.stream
      audioContextRef.current = context
      analyserRef.current = analyser
      sourceTracksRef.current = [
        ...mic.getAudioTracks(),
        ...(usableSystem?.getAudioTracks() ?? [])
      ]

      sourceTracksRef.current.forEach((track) => {
        track.addEventListener('ended', () => {
          if (recordingRef.current) {
            setState((previous) => ({
              ...previous,
              systemAudioWarning: 'An audio source stopped. Recording will continue with the remaining sources.'
            }))
          }
        })
      })

      return { warning }
    },
    []
  )

  const startMeeting = useCallback(
    async (options?: { captureSystemAudio?: boolean }): Promise<Note | null> => {
      if (startingRef.current || recordingRef.current || state.status === 'starting') return null
      startingRef.current = true
      noteIdRef.current = null
      startedAtRef.current = null

      setState({
        ...INITIAL_STATE,
        status: 'starting'
      })

      const captureSystemAudio = options?.captureSystemAudio ?? true

      // Capture first so the user gesture is still valid for getDisplayMedia.
      let capture: { warning: string | null }
      try {
        capture = await captureStreams(captureSystemAudio)
      } catch (error) {
        startingRef.current = false
        stopTracks()
        setState({
          ...INITIAL_STATE,
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'Unable to access the microphone. Check the app permissions.'
        })
        return null
      }

      let note: Note | null = null
      try {
        note = (await window.api?.notes?.meeting?.start({ captureSystemAudio })) ?? null
      } catch (error) {
        startingRef.current = false
        stopTracks()
        setState({
          ...INITIAL_STATE,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unable to start the meeting.'
        })
        return null
      }
      if (!note) {
        startingRef.current = false
        stopTracks()
        setState({
          ...INITIAL_STATE,
          status: 'error',
          error: 'Unable to create the meeting note.'
        })
        return null
      }

      noteIdRef.current = note.id
      startedAtRef.current = note.meeting?.startedAt ?? Date.now()
      setState({
        noteId: note.id,
        note,
        status: 'recording',
        startedAt: startedAtRef.current,
        elapsedMs: 0,
        level: 0,
        transcript: '',
        error: null,
        systemAudioWarning: capture.warning
      })

      recordingRef.current = true
      startingRef.current = false
      segmentIndexRef.current = 0
      startSegment(0)
      window.api?.notes?.meeting?.setActive?.(true)
      tickTimerRef.current = setInterval(tick, 250)
      return note
    },
    [captureStreams, startSegment, state.status, stopTracks, tick]
  )

  const stopMeeting = useCallback(async (): Promise<void> => {
    const noteId = noteIdRef.current
    if (!noteId || (!recordingRef.current && state.status !== 'starting')) return

    recordingRef.current = false
    startingRef.current = false
    discardRef.current = false
    setState((previous) => ({ ...previous, status: 'finalizing', level: 0 }))
    clearTimers()

    await waitForSegmentStop()
    stopTracks()
    window.api?.notes?.meeting?.setActive?.(false)

    const durationMs = startedAtRef.current ? Math.max(0, Date.now() - startedAtRef.current) : 0

    setState((previous) => ({ ...previous, status: 'transcribing' }))
    let note: Note | null = null
    try {
      note = (await window.api?.notes?.meeting?.finish({ noteId, durationMs })) ?? null
    } catch (error) {
      setState((previous) => ({
        ...previous,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unable to finish the meeting.'
      }))
      return
    }

    if (!note) {
      setState((previous) => ({
        ...previous,
        status: 'error',
        error: 'The meeting could not be finalized.'
      }))
      return
    }

    setState((previous) => ({
      ...previous,
      note,
      status: note.meeting?.status === 'completed' ? 'completed' : 'error',
      transcript: note.meeting?.transcript ?? previous.transcript,
      error: note.meeting?.error ?? null
    }))

    if (note.meeting?.status === 'completed' && note.meeting.transcript.trim()) {
      await summarizeMeeting(note.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTimers, state.status, stopTracks, waitForSegmentStop])

  const cancelMeeting = useCallback(async (): Promise<void> => {
    const noteId = noteIdRef.current
    recordingRef.current = false
    startingRef.current = false
    discardRef.current = true
    clearTimers()
    await waitForSegmentStop()
    stopTracks()
    window.api?.notes?.meeting?.setActive?.(false)
    if (noteId) {
      await window.api?.notes?.meeting?.cancel?.(noteId).catch(() => {})
    }
    reset()
  }, [clearTimers, reset, stopTracks, waitForSegmentStop])

  const summarizeMeeting = useCallback(async (noteId?: string): Promise<void> => {
    const id = noteId ?? noteIdRef.current
    if (!id) return
    if (id === noteIdRef.current) {
      setState((previous) => ({ ...previous, status: 'summarizing', error: null }))
    }
    try {
      const note = await window.api?.notes?.meeting?.summarize?.(id)
      if (note) {
        setState((previous) => {
          if (note.id !== noteIdRef.current) {
            return previous
          }
          return {
            ...previous,
            note,
            status: note.meeting?.status === 'completed' ? 'completed' : 'error',
            transcript: note.meeting?.transcript ?? previous.transcript,
            error: note.meeting?.error ?? null
          }
        })
      }
    } catch (error) {
      setState((previous) => ({
        ...previous,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unable to generate the recap.'
      }))
    }
  }, [])

  // The tray's "Stop meeting recording" action is delivered to the renderer so
  // the MediaRecorder can flush its final segment before the note is finalized.
  useEffect(() => {
    return window.api?.notes?.meeting?.onStopRequest?.(() => {
      void stopMeeting()
    })
  }, [stopMeeting])

  useEffect(() => {
    return window.api?.notes?.meeting?.onEvent?.((event: NoteMeetingEvent) => {
      if (!event.noteId || event.noteId !== noteIdRef.current) return
      setState((previous) => ({
        ...previous,
        note: event.note ?? previous.note,
        transcript: event.note?.meeting?.transcript ?? event.transcript ?? previous.transcript,
        status:
          event.note?.meeting?.status === 'summarizing'
            ? 'summarizing'
            : event.note?.meeting?.status === 'completed'
              ? 'completed'
              : event.note?.meeting?.status === 'error'
                ? 'error'
                : previous.status,
        error: event.error ?? event.note?.meeting?.error ?? previous.error
      }))
    })
  }, [])

  useEffect(() => {
    return () => {
      recordingRef.current = false
      startingRef.current = false
      clearTimers()
      stopTracks()
      window.api?.notes?.meeting?.setActive?.(false)
    }
  }, [clearTimers, stopTracks])

  return {
    state,
    isRecording: state.status === 'recording',
    isBusy:
      state.status === 'starting' ||
      state.status === 'finalizing' ||
      state.status === 'transcribing' ||
      state.status === 'summarizing',
    startMeeting,
    stopMeeting,
    cancelMeeting,
    summarizeMeeting,
    clearError: () => setState((previous) => ({ ...previous, error: null }))
  }
}
