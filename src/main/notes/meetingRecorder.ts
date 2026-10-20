import { promises as fs } from 'fs'
import { join } from 'path'
import type { NotesSettings } from '../../shared/config'
import type { MeetingSegment, Note } from '../../shared/notes/note'
import { MAX_MEETING_SEGMENT_BYTES } from '../../shared/notes/note'
import { formatMeetingTitle, mergeSegmentTranscripts } from '../../shared/notes/meeting'
import { readConfig } from '../config/configStore'
import {
  createNote,
  deleteNote,
  getNote,
  getNoteAudioDir,
  updateNoteMeeting
} from '../features/notes'
import { sendToMain } from '../windows/broadcast'
import { transcribeAudio } from './transcription'

interface MeetingSession {
  noteId: string
  startedAt: number
  queue: Promise<void>
  pending: number
}

const sessions = new Map<string, MeetingSession>()

function emit(event: Record<string, unknown>): void {
  sendToMain('notes:meeting-event', event)
}

function notesSettings(): NotesSettings {
  return readConfig().notes
}

function normalizeSegmentData(data: unknown): Buffer | null {
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }
  return null
}

function getOrCreateSession(noteId: string, startedAt: number): MeetingSession {
  let session = sessions.get(noteId)
  if (!session) {
    session = { noteId, startedAt, queue: Promise.resolve(), pending: 0 }
    sessions.set(noteId, session)
  }
  return session
}

export async function startMeeting(input: { captureSystemAudio?: boolean } = {}): Promise<Note> {
  const settings = notesSettings()
  const captureSystemAudio = input.captureSystemAudio !== false && settings.captureSystemAudio
  const now = Date.now()

  const note = await createNote({
    kind: 'meeting',
    title: formatMeetingTitle(new Date(now)),
    content: '',
    meeting: {
      status: 'recording',
      startedAt: now,
      sources: { microphone: true, system: captureSystemAudio },
      segments: [],
      transcript: '',
      transcriptionModel: settings.transcriptionModel,
      summaryModel: settings.summaryModel || undefined,
      endedAt: undefined,
      durationMs: undefined,
      recap: undefined,
      error: undefined
    }
  })

  getOrCreateSession(note.id, now)
  return note
}

function enqueueTranscription(
  session: MeetingSession,
  buffer: Buffer,
  fileName: string,
  segmentIndex: number
): void {
  session.pending += 1
  session.queue = session.queue
    .then(async () => {
      try {
        const text = await transcribeAudio(buffer, fileName, notesSettings())
        const updated = await updateNoteMeeting(session.noteId, (meeting) => {
          const segments = meeting.segments.map((segment) =>
            segment.index === segmentIndex
              ? { ...segment, transcript: text, error: undefined }
              : segment
          )
          return {
            ...meeting,
            segments,
            transcript: mergeSegmentTranscripts(segments)
          }
        })
        if (updated) {
          emit({
            type: 'segment-transcribed',
            noteId: session.noteId,
            index: segmentIndex,
            transcript: text,
            note: updated
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Transcription failed.'
        const updated = await updateNoteMeeting(session.noteId, (meeting) => ({
          ...meeting,
          segments: meeting.segments.map((segment) =>
            segment.index === segmentIndex ? { ...segment, error: message } : segment
          )
        }))
        if (updated) {
          emit({
            type: 'segment-error',
            noteId: session.noteId,
            index: segmentIndex,
            error: message,
            note: updated
          })
        }
      } finally {
        session.pending = Math.max(0, session.pending - 1)
      }
    })
    .catch(() => {})
}

export async function appendMeetingSegment(payload: {
  noteId?: unknown
  index?: unknown
  durationMs?: unknown
  data?: unknown
}): Promise<{ success: boolean; error?: string }> {
  const noteId = typeof payload?.noteId === 'string' ? payload.noteId.trim() : ''
  const index = typeof payload?.index === 'number' ? Math.max(0, Math.round(payload.index)) : -1
  const durationMs =
    typeof payload?.durationMs === 'number' && Number.isFinite(payload.durationMs)
      ? Math.max(0, payload.durationMs)
      : 0
  const buffer = normalizeSegmentData(payload?.data)

  if (!noteId || index < 0 || !buffer || buffer.length === 0) {
    return { success: false, error: 'Invalid audio segment.' }
  }
  if (buffer.length > MAX_MEETING_SEGMENT_BYTES) {
    return { success: false, error: 'Audio segment is too large.' }
  }

  const note = await getNote(noteId)
  if (!note?.meeting) {
    return { success: false, error: 'Meeting note not found.' }
  }

  const fileName = `segment-${String(index).padStart(4, '0')}.webm`
  const filePath = join(getNoteAudioDir(noteId), fileName)
  await fs.mkdir(getNoteAudioDir(noteId), { recursive: true })
  await fs.writeFile(filePath, buffer)

  const updated = await updateNoteMeeting(noteId, (meeting) => {
    const existing = meeting.segments.filter((segment) => segment.index !== index)
    const segment: MeetingSegment = {
      index,
      file: fileName,
      durationMs,
      transcript: ''
    }
    return {
      ...meeting,
      segments: [...existing, segment].sort((a, b) => a.index - b.index)
    }
  })

  if (!updated) {
    return { success: false, error: 'Unable to update the meeting note.' }
  }

  const session = getOrCreateSession(noteId, note.meeting.startedAt)
  enqueueTranscription(session, buffer, fileName, index)
  emit({ type: 'segment-saved', noteId, index, note: updated })

  return { success: true }
}

export async function finishMeeting(
  noteId: string,
  durationMs?: number
): Promise<Note | null> {
  const id = typeof noteId === 'string' ? noteId.trim() : ''
  if (!id) return null

  const session = sessions.get(id)
  if (session) {
    const transcribing = await updateNoteMeeting(id, (meeting) => ({
      ...meeting,
      status: 'transcribing',
      error: undefined
    }))
    if (transcribing) {
      emit({ type: 'status', noteId: id, status: 'transcribing', note: transcribing })
    }
    await session.queue
  }

  const note = await getNote(id)
  if (!note?.meeting) {
    sessions.delete(id)
    return null
  }

  const transcript = mergeSegmentTranscripts(note.meeting.segments)
  const endedAt = Date.now()
  const totalDuration =
    typeof durationMs === 'number' && Number.isFinite(durationMs)
      ? Math.max(0, durationMs)
      : Math.max(0, endedAt - note.meeting.startedAt)
  const keepAudio = notesSettings().keepAudio
  const shouldDeleteAudio = !keepAudio && transcript.trim().length > 0
  if (shouldDeleteAudio) {
    await fs.rm(getNoteAudioDir(id), { recursive: true, force: true }).catch(() => {})
  }

  const transcriptionError = note.meeting.segments.find((segment) => segment.error)?.error

  const updated = await updateNoteMeeting(id, (meeting) => ({
    ...meeting,
    status: transcript.trim() ? 'completed' : 'error',
    endedAt,
    durationMs: totalDuration,
    transcript,
    segments: shouldDeleteAudio ? [] : meeting.segments,
    error: transcript.trim()
      ? undefined
      : transcriptionError
        ? `Transcription failed: ${transcriptionError}`
        : 'No speech was detected in the recording.'
  }))

  sessions.delete(id)
  if (updated) {
    emit({ type: 'finished', noteId: id, note: updated })
  }
  return updated
}

export async function cancelMeeting(noteId: string): Promise<void> {
  const id = typeof noteId === 'string' ? noteId.trim() : ''
  if (!id) return
  sessions.delete(id)
  await deleteNote(id)
}

/**
 * Re-runs transcription for a meeting whose segments were saved but whose
 * transcription failed (missing key, network error, etc.).
 */
export async function retranscribeMeeting(noteId: string): Promise<Note | null> {
  const id = typeof noteId === 'string' ? noteId.trim() : ''
  if (!id) return null
  const note = await getNote(id)
  if (!note?.meeting) return null
  if (note.meeting.segments.length === 0) return note

  const transcribing = await updateNoteMeeting(id, (meeting) => ({
    ...meeting,
    status: 'transcribing',
    error: undefined,
    segments: meeting.segments.map((segment) => ({ ...segment, error: undefined }))
  }))
  if (transcribing) {
    emit({ type: 'status', noteId: id, status: 'transcribing', note: transcribing })
  }

  for (const segment of note.meeting.segments) {
    try {
      const buffer = await fs.readFile(join(getNoteAudioDir(id), segment.file))
      const text = await transcribeAudio(buffer, segment.file, notesSettings())
      await updateNoteMeeting(id, (meeting) => {
        const segments = meeting.segments.map((entry) =>
          entry.index === segment.index
            ? { ...entry, transcript: text, error: undefined }
            : entry
        )
        return { ...meeting, segments, transcript: mergeSegmentTranscripts(segments) }
      })
      emit({ type: 'segment-transcribed', noteId: id, index: segment.index, transcript: text })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcription failed.'
      await updateNoteMeeting(id, (meeting) => ({
        ...meeting,
        segments: meeting.segments.map((entry) =>
          entry.index === segment.index ? { ...entry, error: message } : entry
        )
      }))
      emit({ type: 'segment-error', noteId: id, index: segment.index, error: message })
    }
  }

  return finishMeeting(id, note.meeting.durationMs)
}

export function isMeetingSessionActive(noteId: string): boolean {
  return sessions.has(noteId)
}
