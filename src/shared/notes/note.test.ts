import { describe, expect, it } from 'vitest'
import {
  MAX_NOTE_TAGS,
  normalizeNote,
  notePreview,
  sortNoteMetas,
  toNoteMeta
} from './note'
import {
  chunkTranscript,
  extractRecapTitle,
  formatDuration,
  formatMeetingTitle,
  mergeSegmentTranscripts
} from './meeting'

describe('notes', () => {
  it('normalizes a plain note and clamps fields', () => {
    const note = normalizeNote(
      {
        title: '  Shopping  ',
        content: '# List\n- milk',
        tags: ['home', 'home', ' food '],
        pinned: true
      },
      'fallback',
      1000
    )

    expect(note.id).toBe('fallback')
    expect(note.title).toBe('Shopping')
    expect(note.tags).toEqual(['home', 'food'])
    expect(note.pinned).toBe(true)
    expect(note.createdAt).toBe(1000)
    expect(note.kind).toBe('note')
  })

  it('infers a meeting note and normalizes transcript segments', () => {
    const note = normalizeNote(
      {
        kind: 'meeting',
        title: 'Weekly sync',
        meeting: {
          status: 'completed',
          startedAt: 10,
          endedAt: 20,
          durationMs: 10,
          sources: { microphone: true, system: true },
          segments: [
            {
              index: 1,
              file: 'segment-0001.webm',
              durationMs: 5,
              transcript: 'Second part'
            },
            {
              index: 0,
              file: 'segment-0000.webm',
              durationMs: 5,
              transcript: 'First part'
            }
          ],
          transcriptionModel: 'gpt-4o-transcribe-diarize'
        }
      },
      'meeting',
      1
    )

    expect(note.kind).toBe('meeting')
    expect(note.meeting?.status).toBe('completed')
    expect(note.meeting?.segments.map((segment) => segment.index)).toEqual([0, 1])
    expect(note.meeting?.transcript).toBe('First part\n\nSecond part')
  })

  it('caps tags and produces a compact preview', () => {
    const tags = Array.from({ length: MAX_NOTE_TAGS + 5 }, (_, index) => `tag-${index}`)
    const note = normalizeNote({ tags, content: '# Heading\n\n**Bold** text' }, 'note', 1)
    expect(note.tags).toHaveLength(MAX_NOTE_TAGS)
    expect(notePreview(note.content)).toBe('Heading Bold text')
  })

  it('sorts pinned notes first and exposes meeting metadata', () => {
    const note = normalizeNote(
      {
        id: 'a',
        title: 'A',
        kind: 'meeting',
        updatedAt: 5,
        meeting: {
          status: 'completed',
          startedAt: 1,
          durationMs: 1000,
          sources: { microphone: true, system: false },
          segments: [
            { index: 0, file: 'segment-0000.webm', durationMs: 1000, transcript: 'hello' }
          ],
          transcript: 'hello',
          transcriptionModel: 'gpt-4o-transcribe-diarize'
        }
      },
      'a',
      5
    )
    const meta = toNoteMeta(note)
    expect(meta.meetingStatus).toBe('completed')
    expect(meta.meetingDurationMs).toBe(1000)
    expect(meta.meetingSegmentCount).toBe(1)
    expect(sortNoteMetas([meta, { ...meta, id: 'b', pinned: true }])[0].id).toBe('b')
  })

  it('formats meeting helpers', () => {
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(3_665_000)).toBe('1:01:05')
    expect(formatMeetingTitle(new Date('2026-10-20T14:32:00'))).toContain('Meeting —')
    expect(extractRecapTitle('# Sprint planning\n\nBody')).toBe('Sprint planning')
    expect(mergeSegmentTranscripts([
      { index: 1, file: 'b', durationMs: 0, transcript: 'two' },
      { index: 0, file: 'a', durationMs: 0, transcript: 'one' }
    ])).toBe('one\n\ntwo')
  })

  it('chunks long transcripts without dropping text', () => {
    const text = Array.from({ length: 50 }, (_, index) => `line ${index}`).join('\n')
    const chunks = chunkTranscript(text, 80)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('\n').replace(/\s+/g, ' ')).toContain('line 49')
  })
})
