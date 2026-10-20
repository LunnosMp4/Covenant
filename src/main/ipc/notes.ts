import { ipcMain } from 'electron'
import type { NoteCreateInput, NoteSaveInput } from '../../shared/notes/note'
import { readConfig } from '../config/configStore'
import {
  createNote,
  deleteNote,
  getNote,
  getNoteMetas,
  saveNote
} from '../features/notes'
import { cancelNoteAi, runNoteAi } from '../notes/ai'
import {
  appendMeetingSegment,
  cancelMeeting,
  finishMeeting,
  retranscribeMeeting,
  startMeeting
} from '../notes/meetingRecorder'
import { summarizeMeeting } from '../notes/recap'
import { setMeetingRecordingActive } from '../windows'

export function registerNotesIpc(): void {
  ipcMain.handle('notes:list', () => getNoteMetas())

  ipcMain.handle('notes:get', (_event, rawId: unknown) => {
    const id = typeof rawId === 'string' ? rawId : ''
    return getNote(id)
  })

  ipcMain.handle('notes:create', (_event, rawInput: unknown) => {
    const input =
      rawInput && typeof rawInput === 'object' ? (rawInput as NoteCreateInput) : {}
    return createNote(input)
  })

  ipcMain.handle('notes:save', (_event, rawInput: unknown) => {
    const input = rawInput && typeof rawInput === 'object' ? (rawInput as NoteSaveInput) : null
    if (!input) return null
    return saveNote(input)
  })

  ipcMain.handle('notes:delete', (_event, rawId: unknown) => {
    const id = typeof rawId === 'string' ? rawId : ''
    return deleteNote(id)
  })

  ipcMain.handle('notes:get-settings', () => readConfig().notes)

  ipcMain.handle('notes:meeting:start', (_event, rawInput: unknown) => {
    const input =
      rawInput && typeof rawInput === 'object'
        ? (rawInput as { captureSystemAudio?: boolean })
        : {}
    return startMeeting(input)
  })

  ipcMain.handle('notes:meeting:segment', (_event, rawPayload: unknown) => {
    const payload =
      rawPayload && typeof rawPayload === 'object'
        ? (rawPayload as {
            noteId?: unknown
            index?: unknown
            durationMs?: unknown
            data?: unknown
          })
        : {}
    return appendMeetingSegment(payload)
  })

  ipcMain.handle('notes:meeting:finish', async (_event, rawPayload: unknown) => {
    const payload =
      rawPayload && typeof rawPayload === 'object'
        ? (rawPayload as { noteId?: unknown; durationMs?: unknown })
        : {}
    const noteId = typeof payload.noteId === 'string' ? payload.noteId : ''
    const durationMs =
      typeof payload.durationMs === 'number' ? payload.durationMs : undefined
    return finishMeeting(noteId, durationMs)
  })

  ipcMain.handle('notes:meeting:cancel', (_event, rawId: unknown) => {
    const noteId = typeof rawId === 'string' ? rawId : ''
    return cancelMeeting(noteId)
  })

  ipcMain.handle('notes:meeting:summarize', (_event, rawId: unknown) => {
    const noteId = typeof rawId === 'string' ? rawId : ''
    return summarizeMeeting(noteId)
  })

  ipcMain.handle('notes:meeting:retranscribe', (_event, rawId: unknown) => {
    const noteId = typeof rawId === 'string' ? rawId : ''
    return retranscribeMeeting(noteId)
  })

  ipcMain.on('notes:meeting:active', (_event, active: unknown) => {
    setMeetingRecordingActive(active === true)
  })

  ipcMain.handle('notes:ai', (event, rawPayload: unknown) => {
    return runNoteAi(event.sender, rawPayload)
  })

  ipcMain.on('notes:ai-cancel', (_event, rawId: unknown) => {
    const id = typeof rawId === 'string' ? rawId : ''
    cancelNoteAi(id)
  })
}
