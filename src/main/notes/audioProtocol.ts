import { protocol } from 'electron'
import { createReadStream, promises as fs } from 'fs'
import { join, relative, resolve } from 'path'
import { Readable } from 'stream'
import { isValidNoteId } from '../../shared/notes/note'
import { fixWebmDuration } from '../../shared/notes/webm'
import { getNote, getNoteAudioDir, getNotesRoot } from '../features/notes'

const NOTES_PROTOCOL = 'covenant-note'
const AUDIO_FILE_PATTERN = /^segment-\d{1,6}\.webm$/
const AUDIO_HEADERS: Record<string, string> = {
  'content-type': 'audio/webm',
  'accept-ranges': 'bytes',
  'cache-control': 'no-cache'
}

/**
 * Recordings made before the duration fix lack a WebM Duration element, so
 * Chromium can't seek them. Patch each file once, lazily, before it is served.
 */
const preparedAudio = new Map<string, Promise<void>>()

function prepareSeekableAudio(
  noteId: string,
  fileName: string,
  filePath: string
): Promise<void> {
  const key = `${noteId}/${fileName}`
  const existing = preparedAudio.get(key)
  if (existing) return existing

  const task = (async () => {
    const note = await getNote(noteId)
    const durationMs =
      note?.meeting?.segments.find((segment) => segment.file === fileName)?.durationMs ?? 0
    if (!(durationMs > 0)) return

    const data = await fs.readFile(filePath)
    const patched = fixWebmDuration(data, durationMs)
    if (!patched) return
    await fs.writeFile(filePath, Buffer.from(patched))
  })().catch(() => {
    // Non-fatal: the file is still served, just without seek metadata.
  })

  preparedAudio.set(key, task)
  return task
}

function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return null

  if (!rawStart) {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = Number(rawStart)
  const end = rawEnd ? Number(rawEnd) : size - 1
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return null
  }
  return { start, end: Math.min(end, size - 1) }
}

function stream(filePath: string, options?: { start: number; end: number }): ReadableStream {
  return Readable.toWeb(createReadStream(filePath, options)) as unknown as ReadableStream
}

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
          !isValidNoteId(noteId) ||
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

        await prepareSeekableAudio(noteId, fileName, filePath)

        const stats = await fs.stat(filePath)
        if (!stats.isFile() || stats.size === 0) {
          return new Response('Not found', { status: 404 })
        }

        const rangeHeader = request.headers.get('range')
        if (rangeHeader) {
          const range = parseRange(rangeHeader, stats.size)
          if (!range) {
            return new Response(null, {
              status: 416,
              headers: { ...AUDIO_HEADERS, 'content-range': `bytes */${stats.size}` }
            })
          }
          return new Response(stream(filePath, range), {
            status: 206,
            headers: {
              ...AUDIO_HEADERS,
              'content-length': String(range.end - range.start + 1),
              'content-range': `bytes ${range.start}-${range.end}/${stats.size}`
            }
          })
        }

        return new Response(stream(filePath), {
          headers: { ...AUDIO_HEADERS, 'content-length': String(stats.size) }
        })
      } catch {
        return new Response('Not found', { status: 404 })
      }
    })
  } catch (error) {
    console.error('Failed to register notes protocol handler:', error)
  }
}
