import { app } from 'electron'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import type {
  MeetingMeta,
  Note,
  NoteCreateInput,
  NoteMeta,
  NoteSaveInput
} from '../../shared/notes/note'
import {
  normalizeNote,
  sortNoteMetas,
  toNoteMeta
} from '../../shared/notes/note'
import { appStore } from '../store/appStore'
import { sendToMain } from '../windows/broadcast'

const notesDir = (): string => join(app.getPath('userData'), 'notes')

export function getNotesRoot(): string {
  return notesDir()
}

export function getNoteDir(noteId: string): string {
  return join(notesDir(), noteId)
}

export function getNoteFilePath(noteId: string): string {
  return join(getNoteDir(noteId), 'note.json')
}

export function getNoteAudioDir(noteId: string): string {
  return join(getNoteDir(noteId), 'audio')
}

const writeQueues = new Map<string, Promise<unknown>>()

/** Serializes writes per note so autosave and meeting transcription can't race. */
function withNoteLock<T>(noteId: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(noteId) ?? Promise.resolve()
  const next = previous.then(task, task)
  writeQueues.set(
    noteId,
    next.catch(() => {
      // Keep the chain alive after a failed write.
    })
  )
  return next
}

async function ensureBaseDirs(noteId: string): Promise<void> {
  await fs.mkdir(getNoteAudioDir(noteId), { recursive: true })
}

async function readNoteFile(noteId: string): Promise<Note | null> {
  try {
    const raw = await fs.readFile(getNoteFilePath(noteId), 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    return normalizeNote(parsed, noteId)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    throw error
  }
}

function upsertMeta(note: Note): NoteMeta[] {
  const current = appStore.get('notes', [])
  const next = sortNoteMetas([toNoteMeta(note), ...current.filter((meta) => meta.id !== note.id)])
  appStore.set('notes', next)
  return next
}

function emitChanged(metas: NoteMeta[]): void {
  sendToMain('notes:changed', metas)
}

async function writeNoteFile(note: Note): Promise<void> {
  await ensureBaseDirs(note.id)
  await fs.mkdir(dirname(getNoteFilePath(note.id)), { recursive: true })
  await fs.writeFile(getNoteFilePath(note.id), JSON.stringify(note, null, 2), 'utf-8')
}

async function persistNote(note: Note): Promise<Note> {
  await writeNoteFile(note)
  const metas = upsertMeta(note)
  emitChanged(metas)
  return note
}

export function getNoteMetas(): NoteMeta[] {
  return sortNoteMetas(appStore.get('notes', []))
}

export async function getNote(noteId: string): Promise<Note | null> {
  const id = typeof noteId === 'string' ? noteId.trim() : ''
  if (!id) return null
  return readNoteFile(id)
}

export async function createNote(input: NoteCreateInput = {}): Promise<Note> {
  const id = randomUUID()
  const now = Date.now()
  const note = normalizeNote(
    {
      id,
      title: input.title,
      content: input.content ?? '',
      kind: input.kind ?? 'note',
      tags: input.tags ?? [],
      pinned: false,
      createdAt: now,
      updatedAt: now,
      meeting: input.meeting
    },
    id,
    now
  )

  return withNoteLock(id, async () => persistNote(note))
}

/**
 * Applies user-editable fields. For meeting notes the meeting metadata is owned
 * by the meeting service and is intentionally preserved here.
 */
export async function saveNote(input: NoteSaveInput): Promise<Note | null> {
  const id = typeof input?.id === 'string' ? input.id.trim() : ''
  if (!id) return null

  return withNoteLock(id, async () => {
    const existing = await readNoteFile(id)
    if (!existing) return null
    const now = Date.now()
    const next = normalizeNote(
      {
        ...existing,
        title: typeof input.title === 'string' ? input.title : existing.title,
        content: typeof input.content === 'string' ? input.content : existing.content,
        pinned: typeof input.pinned === 'boolean' ? input.pinned : existing.pinned,
        tags: Array.isArray(input.tags) ? input.tags : existing.tags,
        updatedAt: now
      },
      id,
      now
    )
    return persistNote(next)
  })
}

export async function deleteNote(noteId: string): Promise<NoteMeta[]> {
  const id = typeof noteId === 'string' ? noteId.trim() : ''
  if (!id) return getNoteMetas()

  await withNoteLock(id, async () => {
    await fs.rm(getNoteDir(id), { recursive: true, force: true })
  })

  const next = getNoteMetas().filter((meta) => meta.id !== id)
  appStore.set('notes', next)
  emitChanged(next)
  return next
}

/** Main-process-owned mutation for meeting transcript/recap state. */
export async function updateNoteMeeting(
  noteId: string,
  updater: (meeting: MeetingMeta, note: Note) => MeetingMeta
): Promise<Note | null> {
  const id = typeof noteId === 'string' ? noteId.trim() : ''
  if (!id) return null

  return withNoteLock(id, async () => {
    const existing = await readNoteFile(id)
    if (!existing || !existing.meeting) return null
    const meeting = updater(existing.meeting, existing)
    const next = normalizeNote(
      {
        ...existing,
        updatedAt: Date.now(),
        meeting
      },
      id
    )
    return persistNote(next)
  })
}

/** Rewrites the note body + title after a recap is generated. */
export async function applyMeetingRecap(
  noteId: string,
  recap: string,
  title?: string
): Promise<Note | null> {
  return withNoteLock(noteId, async () => {
    const existing = await readNoteFile(noteId)
    if (!existing || !existing.meeting) return null
    const next = normalizeNote(
      {
        ...existing,
        title: title?.trim() || existing.title,
        content: recap,
        updatedAt: Date.now(),
        meeting: {
          ...existing.meeting,
          recap,
          status: 'completed',
          error: undefined
        }
      },
      noteId
    )
    return persistNote(next)
  })
}

/**
 * On startup any meeting still marked "recording" was interrupted by a quit or
 * crash. Keep the segments/transcript so the user can retranscribe or recap.
 */
export async function markInterruptedMeetings(): Promise<void> {
  const metas = getNoteMetas()
  for (const meta of metas) {
    if (
      meta.meetingStatus !== 'recording' &&
      meta.meetingStatus !== 'transcribing' &&
      meta.meetingStatus !== 'summarizing'
    ) {
      continue
    }
    const note = await readNoteFile(meta.id).catch(() => null)
    if (!note?.meeting) continue
    const next = normalizeNote(
      {
        ...note,
        updatedAt: Date.now(),
        meeting: {
          ...note.meeting,
          status: 'error',
          endedAt: note.meeting.endedAt ?? Date.now(),
          error:
            meta.meetingStatus === 'recording'
              ? 'Recording interrupted before it could be finalized.'
              : 'Processing was interrupted. You can retry transcription or generate the recap again.'
        }
      },
      note.id
    )
    await persistNote(next)
  }
}
