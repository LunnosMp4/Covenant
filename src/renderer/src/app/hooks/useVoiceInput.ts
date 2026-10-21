import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export type VoiceState = 'idle' | 'recording' | 'transcribing' | 'error'

export function useVoiceInput(
  inputRef: RefObject<HTMLDivElement>,
  setQuery: (value: string) => void
): {
  voiceState: VoiceState
  micStreamRef: RefObject<MediaStream | null>
  toggleRecording: () => Promise<void>
} {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const micStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingActiveRef = useRef(false)
  const unmountedRef = useRef(false)

  // Mirror the dictation state into the tray mic badge (same badge as meetings).
  const setTrayRecording = useCallback((active: boolean) => {
    if (recordingActiveRef.current === active) return
    recordingActiveRef.current = active
    window.api?.voice.setRecordingActive(active)
  }, [])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
  }, [])

  const toggleRecording = useCallback(async () => {
    if (voiceState === 'transcribing') return

    if (voiceState === 'recording') {
      stopRecording()
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      audioChunksRef.current = []

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        setTrayRecording(false)
        setVoiceState('transcribing')
        micStreamRef.current?.getTracks().forEach((t) => t.stop())
        micStreamRef.current = null

        if (unmountedRef.current) return

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
      setVoiceState('recording')
      setTrayRecording(true)
    } catch {
      setTrayRecording(false)
      setVoiceState('error')
      setTimeout(() => setVoiceState('idle'), 400)
    }
  }, [voiceState, inputRef, setQuery, stopRecording, setTrayRecording])

  // Stop the dictation from the tray menu without focusing the window.
  useEffect(() => {
    return window.api?.voice.onStopRequest(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
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

  return { voiceState, micStreamRef, toggleRecording }
}
