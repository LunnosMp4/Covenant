import type { MeetingMeta, MeetingSegment } from './note'

export const MEETING_SEGMENT_MS = 5 * 60 * 1000

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatMeetingTitle(date = new Date()): string {
  return `Meeting — ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

export function mergeSegmentTranscripts(segments: MeetingSegment[]): string {
  return segments
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((segment) => segment.transcript.trim())
    .filter(Boolean)
    .join('\n\n')
}

export function meetingDuration(meeting: MeetingMeta, fallbackNow = Date.now()): number {
  if (typeof meeting.durationMs === 'number') return meeting.durationMs
  if (typeof meeting.endedAt === 'number') return Math.max(0, meeting.endedAt - meeting.startedAt)
  return Math.max(0, fallbackNow - meeting.startedAt)
}

export function isMeetingRecording(meeting: MeetingMeta | undefined): boolean {
  return meeting?.status === 'recording'
}

export function extractRecapTitle(recap: string): string | null {
  const match = /^#\s+(.+)$/m.exec(recap)
  if (!match) return null
  const title = match[1]
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return title || null
}

export function chunkTranscript(text: string, maxChars: number): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.length <= maxChars) return [trimmed]

  const chunks: string[] = []
  let cursor = 0
  while (cursor < trimmed.length) {
    let end = Math.min(trimmed.length, cursor + maxChars)
    if (end < trimmed.length) {
      // Prefer a paragraph/line boundary near the limit.
      const boundary = trimmed.lastIndexOf('\n\n', end)
      const lineBoundary = trimmed.lastIndexOf('\n', end)
      const preferred = Math.max(boundary, lineBoundary)
      if (preferred > cursor + maxChars * 0.6) end = preferred
    }
    chunks.push(trimmed.slice(cursor, end).trim())
    cursor = end
  }
  return chunks.filter(Boolean)
}
