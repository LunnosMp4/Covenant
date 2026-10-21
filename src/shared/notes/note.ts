/**
 * Shared types for the Notes surface.
 *
 * Notes are user documents (Markdown) plus optional meeting recordings. The
 * full note lives on disk; only compact metadata is kept in the app store so
 * meeting transcripts never bloat the store or the notes list payload.
 */

export type NoteKind = 'note' | 'meeting'

export type MeetingStatus =
  | 'recording'
  | 'transcribing'
  | 'summarizing'
  | 'completed'
  | 'error'

export interface MeetingSources {
  microphone: boolean
  system: boolean
}

export interface MeetingSegment {
  index: number
  /** Basename inside the note's audio/ folder. */
  file: string
  durationMs: number
  transcript: string
  error?: string
}

export interface MeetingMeta {
  status: MeetingStatus
  startedAt: number
  endedAt?: number
  durationMs?: number
  sources: MeetingSources
  segments: MeetingSegment[]
  transcript: string
  recap?: string
  transcriptionModel: string
  summaryModel?: string
  error?: string
}

export interface Note {
  id: string
  title: string
  /** Editable Markdown body. For meetings this is the recap once generated. */
  content: string
  createdAt: number
  updatedAt: number
  pinned: boolean
  tags: string[]
  kind: NoteKind
  meeting?: MeetingMeta
}

export interface NoteMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  pinned: boolean
  tags: string[]
  kind: NoteKind
  preview: string
  meetingStatus?: MeetingStatus
  meetingDurationMs?: number
  meetingSegmentCount?: number
}

export interface NoteCreateInput {
  title?: string
  content?: string
  kind?: NoteKind
  tags?: string[]
  meeting?: Partial<MeetingMeta>
}

export interface NoteSaveInput {
  id: string
  title?: string
  content?: string
  pinned?: boolean
  tags?: string[]
}

export type NoteMeetingEventType =
  | 'segment-saved'
  | 'segment-transcribed'
  | 'segment-error'
  | 'status'
  | 'recap-done'
  | 'finished'
  | 'error'

export interface NoteMeetingEvent {
  type: NoteMeetingEventType
  noteId: string
  index?: number
  transcript?: string
  error?: string
  status?: MeetingStatus
  note?: Note
}

export interface NoteAiEvent {
  id: string
  type: 'content' | 'done' | 'error'
  delta?: string
  error?: string
}

export const MAX_NOTE_TITLE_LENGTH = 200
export const MAX_NOTE_CONTENT_LENGTH = 2_000_000
export const MAX_NOTE_TAGS = 20
export const MAX_NOTE_TAG_LENGTH = 40
export const MAX_MEETING_SEGMENT_BYTES = 24 * 1024 * 1024
export const NOTE_PREVIEW_LENGTH = 150
/** Note ids become folder names on disk and are part of a custom protocol URL. */
export const NOTE_ID_PATTERN = /^[a-zA-Z0-9-]{1,80}$/

export function isValidNoteId(value: unknown): value is string {
  return typeof value === 'string' && NOTE_ID_PATTERN.test(value)
}

export const NOTE_KINDS: readonly NoteKind[] = ['note', 'meeting']
export const MEETING_STATUSES: readonly MeetingStatus[] = [
  'recording',
  'transcribing',
  'summarizing',
  'completed',
  'error'
]

export function normalizeNoteKind(value: unknown): NoteKind {
  return value === 'meeting' ? 'meeting' : 'note'
}

export function normalizeMeetingStatus(value: unknown): MeetingStatus {
  return typeof value === 'string' && (MEETING_STATUSES as readonly string[]).includes(value)
    ? (value as MeetingStatus)
    : 'error'
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const tags: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const tag = entry.trim().slice(0, MAX_NOTE_TAG_LENGTH)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length >= MAX_NOTE_TAGS) break
  }
  return tags
}

function normalizeMeetingSegment(raw: unknown, index: number): MeetingSegment | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const file = normalizeString(obj.file).trim()
  if (!file) return null
  return {
    index: Number.isFinite(obj.index) ? Math.max(0, Math.round(Number(obj.index))) : index,
    file,
    durationMs: Math.max(0, normalizeTimestamp(obj.durationMs, 0)),
    transcript: normalizeString(obj.transcript),
    ...(typeof obj.error === 'string' && obj.error.trim() ? { error: obj.error.trim() } : {})
  }
}

export function normalizeMeetingMeta(raw: unknown): MeetingMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const obj = raw as Record<string, unknown>
  const startedAt = normalizeTimestamp(obj.startedAt, Date.now())
  const segments = Array.isArray(obj.segments)
    ? obj.segments
        .map((segment, index) => normalizeMeetingSegment(segment, index))
        .filter((segment): segment is MeetingSegment => segment != null)
        .sort((a, b) => a.index - b.index)
    : []
  const sourcesRaw = obj.sources && typeof obj.sources === 'object'
    ? (obj.sources as Record<string, unknown>)
    : {}
  const transcript =
    normalizeString(obj.transcript).trim() ||
    segments
      .map((segment) => segment.transcript.trim())
      .filter(Boolean)
      .join('\n\n')

  return {
    status: normalizeMeetingStatus(obj.status),
    startedAt,
    endedAt:
      typeof obj.endedAt === 'number' && Number.isFinite(obj.endedAt) ? obj.endedAt : undefined,
    durationMs:
      typeof obj.durationMs === 'number' && Number.isFinite(obj.durationMs)
        ? Math.max(0, obj.durationMs)
        : undefined,
    sources: {
      microphone: sourcesRaw.microphone !== false,
      system: sourcesRaw.system === true
    },
    segments,
    transcript,
    recap: normalizeString(obj.recap).trim() || undefined,
    transcriptionModel: normalizeString(obj.transcriptionModel, 'gpt-4o-transcribe-diarize'),
    summaryModel: normalizeString(obj.summaryModel).trim() || undefined,
    error: normalizeString(obj.error).trim() || undefined
  }
}

export function normalizeNote(raw: unknown, fallbackId: string, now = Date.now()): Note {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const createdAt = normalizeTimestamp(obj.createdAt, now)
  const updatedAt = Math.max(createdAt, normalizeTimestamp(obj.updatedAt, createdAt))
  const kind = normalizeNoteKind(obj.kind ?? (obj.meeting ? 'meeting' : 'note'))
  const title = normalizeString(obj.title).trim().slice(0, MAX_NOTE_TITLE_LENGTH)
  const content = normalizeString(obj.content).slice(0, MAX_NOTE_CONTENT_LENGTH)

  return {
    id: normalizeString(obj.id, fallbackId).trim() || fallbackId,
    title: title || (kind === 'meeting' ? 'Untitled meeting' : 'Untitled note'),
    content,
    createdAt,
    updatedAt,
    pinned: obj.pinned === true,
    tags: normalizeTags(obj.tags),
    kind,
    ...(kind === 'meeting' ? { meeting: normalizeMeetingMeta(obj.meeting) } : {})
  }
}

/** Strips the most common Markdown noise for a compact list preview. */
export function notePreview(text: string, maxLength = NOTE_PREVIEW_LENGTH): string {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export function toNoteMeta(note: Note): NoteMeta {
  const meeting = note.meeting
  return {
    id: note.id,
    title: note.title,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    pinned: note.pinned,
    tags: note.tags,
    kind: note.kind,
    preview: notePreview(note.content || meeting?.transcript || ''),
    ...(meeting
      ? {
          meetingStatus: meeting.status,
          meetingDurationMs: meeting.durationMs,
          meetingSegmentCount: meeting.segments.length
        }
      : {})
  }
}

export function sortNoteMetas(metas: NoteMeta[]): NoteMeta[] {
  return [...metas].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
}
