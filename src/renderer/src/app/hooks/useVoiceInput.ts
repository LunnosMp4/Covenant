import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export type VoiceState = 'idle' | 'recording' | 'transcribing' | 'error'

export function useVoiceInput(
  inputRef: RefObject<HTMLDivElement>,
  setQuery: (value: string) => void
): {
  voiceState: VoiceState
  micStream: MediaStream | null
  toggleRecording: () => Promise<void>
} {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  // The stream is state (not just a ref) so the visualiser can mount with
  // `null` and switch to the real analyser the moment the device opens.
  const [micStream, setMicStream] = useState<MediaStream | null>(null)
  const voiceStateRef = useRef<VoiceState>('idle')
  voiceStateRef.current = voiceState
  const micStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingActiveRef = useRef(false)
  const unmountedRef = useRef(false)
  // Bumped whenever a recording starts or stops, so a slow `getUserMedia`
  // from a cancelled session can never take over a newer one.
  const sessionRef = useRef(0)

  // Mirror the dictation state into the tray mic badge (same badge as meetings).
  const setTrayRecording = useCallback((active: boolean) => {
    if (recordingActiveRef.current === active) return
    recordingActiveRef.current = active
    window.api?.voice.setRecordingActive(active)
  }, [])

  const releaseStream = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((track) => track.stop())
    micStreamRef.current = null
    setMicStream(null)
  }, [])

  const stopRecording = useCallback(() => {
    // Invalidate any microphone request that is still opening.
    sessionRef.current += 1
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      // `onstop` finishes the recording and starts transcription.
      recorder.stop()
    } else if (!recorder && voiceStateRef.current === 'recording') {
      // The microphone was still opening: nothing to transcribe.
      setTrayRecording(false)
      setVoiceState('idle')
    }
    releaseStream()
  }, [releaseStream, setTrayRecording])

  const toggleRecording = useCallback(async () => {
    if (voiceStateRef.current === 'transcribing') return

    if (voiceStateRef.current === 'recording') {
      stopRecording()
      return
    }

    // Swap the bar to the visualiser *before* awaiting the device so there is
    // no dead frame while the microphone opens.
    const session = ++sessionRef.current
    audioChunksRef.current = []
    setVoiceState('recording')
    setTrayRecording(true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      micStreamRef.current = stream
      setMicStream(stream)

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        setTrayRecording(false)
        micStreamRef.current?.getTracks().forEach((track) => track.stop())
        micStreamRef.current = null
        mediaRecorderRef.current = null

        if (unmountedRef.current) return

        setMicStream(null)
        setVoiceState('transcribing')

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        blob.arrayBuffer().then(async (buffer) => {
          try {
            const text = await window.api!.voice.transcribe(buffer)
            if (text.trim()) {
              const div = inputRef.current
              if (div) {
                const separator = div.textContent ? ' ' : ''
                div.appendChild(document.createTextNode(separator + text.trim()))
                setQuery(div.textContent ?? '')
              }
              setTimeout(() => inputRef.current?.focus(), 50)
            }
            setVoiceState('idle')
          } catch {
            setVoiceState('error')
            setTimeout(() => setVoiceState('idle'), 400)
          }
        })
      }

      recorder.start(250)
    } catch {
      if (session !== sessionRef.current) return
      releaseStream()
      mediaRecorderRef.current = null
      setTrayRecording(false)
      setVoiceState('error')
      setTimeout(() => setVoiceState('idle'), 400)
    }
  }, [inputRef, releaseStream, setQuery, setTrayRecording, stopRecording])

  // Stop the dictation from the tray menu without focusing the window.
  useEffect(() => {
    return window.api?.voice.onStopRequest(() => {
      if (voiceStateRef.current === 'recording') {
        stopRecording()
      }
    })
  }, [stopRecording])

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      stopRecording()
      setTrayRecording(false)
    }
  }, [stopRecording, setTrayRecording])

  return { voiceState, micStream, toggleRecording }
}
