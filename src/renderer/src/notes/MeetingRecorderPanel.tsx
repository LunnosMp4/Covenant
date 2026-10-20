import type { Note } from '../../../shared/notes/note'
import { formatDuration } from '../../../shared/notes/meeting'
import { MeetingIcon } from '../ui/icons'
import type { MeetingRecorderApi } from './useMeetingRecorder'

interface MeetingRecorderPanelProps {
  note: Note
  meeting: MeetingRecorderApi
  onSummarize: () => void
  onRetranscribe: () => void
}

function StatusPill({ label, tone }: { label: string; tone: 'red' | 'amber' | 'emerald' | 'neutral' }): JSX.Element {
  const classes =
    tone === 'red'
      ? 'border-red-400/30 bg-red-500/15 text-red-300'
      : tone === 'amber'
        ? 'border-amber-400/30 bg-amber-500/15 text-amber-200'
        : tone === 'emerald'
          ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
          : 'border-white/10 bg-white/5 text-neutral-400'
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${classes}`}>
      {label}
    </span>
  )
}

export default function MeetingRecorderPanel({
  note,
  meeting,
  onSummarize,
  onRetranscribe
}: MeetingRecorderPanelProps): JSX.Element | null {
  const isActiveNote = meeting.state.noteId === note.id
  const activeMeeting = isActiveNote ? meeting.state : null
  const meetingMeta = note.meeting
  if (!activeMeeting && !meetingMeta) return null

  const status = (() => {
    const raw = activeMeeting?.status ?? meetingMeta?.status ?? 'error'
    // A stale "recording" status without an active recorder means the app was
    // closed/crashed mid-meeting. Don't offer a Stop button that can't work.
    return raw === 'recording' && !activeMeeting ? 'error' : raw
  })()
  const transcript = activeMeeting?.transcript ?? meetingMeta?.transcript ?? ''
  const error = activeMeeting?.error ?? meetingMeta?.error ?? (status === 'error' && meetingMeta?.status === 'recording' ? 'Recording is no longer active.' : null)
  const warning = activeMeeting?.systemAudioWarning ?? null
  const isRecording = status === 'recording'
  const isBusy = status === 'starting' || status === 'finalizing' || status === 'transcribing' || status === 'summarizing'

  const bars = Array.from({ length: 18 }, (_, index) => {
    const threshold = (index + 1) / 18
    return isRecording && (activeMeeting?.level ?? 0) > threshold * 0.85
  })

  return (
    <section
      className={`rounded-xl border p-3 ${
        isRecording
          ? 'border-red-400/25 bg-red-500/[0.07]'
          : status === 'error'
            ? 'border-amber-400/20 bg-amber-500/[0.06]'
            : 'border-white/5 bg-white/[0.03]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              isRecording ? 'bg-red-500/20 text-red-300' : 'bg-white/5 text-neutral-400'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
              <path d="M19 11a7 7 0 0 1-14 0" />
              <path d="M12 18v3" />
              <path d="M8 21h8" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-neutral-100">
                {isRecording
                  ? 'Recording meeting'
                  : status === 'summarizing'
                    ? 'Generating recap'
                    : status === 'transcribing'
                      ? 'Transcribing audio'
                      : status === 'finalizing'
                        ? 'Finalizing recording'
                        : status === 'starting'
                          ? 'Starting recorder'
                          : status === 'completed'
                            ? 'Meeting recap'
                            : 'Meeting needs attention'}
              </p>
              {isRecording && (
                <span className="flex items-center gap-1.5 text-xs tabular-nums text-red-300">
                  <MeetingIcon className="animate-pulse" />
                  {formatDuration(activeMeeting?.elapsedMs ?? 0)}
                </span>
              )}
              <StatusPill
                label={
                  meetingMeta?.sources.system
                    ? meetingMeta.sources.microphone
                      ? 'Mic + system'
                      : 'System'
                    : 'Mic'
                }
                tone="neutral"
              />
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              {isRecording
                ? 'Audio is saved locally and transcribed in short segments. You can hide Covenant and keep recording.'
                : status === 'transcribing'
                  ? 'Waiting for the remaining segments to finish transcribing…'
                  : status === 'summarizing'
                    ? 'The transcript is being turned into a structured recap…'
                    : transcript
                      ? `${transcript.split(/\s+/).filter(Boolean).length} words · ${meetingMeta?.segments.length ?? 0} audio segment(s)`
                      : 'No transcript yet.'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isRecording && (
            <>
              <div className="flex h-8 items-end gap-[2px]" aria-hidden>
                {bars.map((on, index) => (
                  <span
                    key={index}
                    className={`w-[3px] rounded-full transition-all duration-100 ${
                      on ? 'bg-red-400' : 'bg-white/10'
                    }`}
                    style={{ height: `${5 + ((index * 7) % 18)}px` }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => void meeting.cancelMeeting()}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/10"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => void meeting.stopMeeting()}
                className="rounded-lg border border-red-400/30 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-100 transition-colors hover:bg-red-500/30"
              >
                Stop & recap
              </button>
            </>
          )}
          {!isRecording && isBusy && (
            <span className="flex items-center gap-1.5 text-xs text-neutral-400">
              <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-transparent" />
              Working…
            </span>
          )}
          {!isRecording && !isBusy && status === 'error' && (meetingMeta?.segments.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={onRetranscribe}
              className="rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/25"
            >
              Retry transcription
            </button>
          )}
          {!isRecording && !isBusy && transcript.trim() && (
            <button
              type="button"
              onClick={onSummarize}
              className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25"
            >
              {meetingMeta?.recap ? 'Regenerate recap' : 'Generate recap'}
            </button>
          )}
        </div>
      </div>

      {warning && (
        <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
          {warning}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-200">
          {error}
        </p>
      )}
    </section>
  )
}
