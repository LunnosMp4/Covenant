import { protocol } from 'electron'
import { promises as fs } from 'fs'
import { join, relative, resolve } from 'path'
import { getNoteAudioDir, getNotesRoot } from '../features/notes'

const NOTES_PROTOCOL = 'covenant-note'
const NOTE_ID_PATTERN = /^[a-zA-Z0-9-]{1,80}$/
const AUDIO_FILE_PATTERN = /^segment-\d{1,6}\.webm$/

export function registerNotesProtocol(): void {
  try {
    protocol.handle(NOTES_PROTOCOL, async (request) => {
      try {
        const url = new URL(request.url)
        if (url.hostname !== 'audio') {
          return new Response('Not found', { status: 404 })
        }

        const parts = url.pathname
          .replace(/^\/+/, '')
          .split('/')
          .map((part) => decodeURIComponent(part))
        const [noteId, fileName] = parts
        if (
          !noteId ||
          !fileName ||
          !NOTE_ID_PATTERN.test(noteId) ||
          !AUDIO_FILE_PATTERN.test(fileName) ||
          parts.length !== 2
        ) {
          return new Response('Not found', { status: 404 })
        }

        const audioRoot = resolve(getNotesRoot())
        const filePath = resolve(join(getNoteAudioDir(noteId), fileName))
        const rel = relative(audioRoot, filePath)
        if (rel.startsWith('..') || rel === '' || resolve(rel) === rel) {
          return new Response('Not found', { status: 404 })
        }

        const data = await fs.readFile(filePath)
        return new Response(data, {
          headers: {
            'content-type': 'audio/webm',
            'cache-control': 'no-cache'
          }
        })
      } catch {
        return new Response('Not found', { status: 404 })
      }
    })
  } catch (error) {
    console.error('Failed to register notes protocol handler:', error)
  }
}
