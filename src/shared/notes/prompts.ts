import type { Note } from './note'

export const NOTE_AI_INSTRUCTIONS =
  "You are Covenant's note assistant. You help the user write, edit, summarize and reason about their notes. " +
  'Return clean Markdown. Be concise unless the user asks for depth. Never invent facts that are not in the note or the user request.'

export type NoteAiAction =
  | 'chat'
  | 'rewrite'
  | 'summarize'
  | 'shorten'
  | 'expand'
  | 'fix'
  | 'bullets'
  | 'translate'
  | 'action-items'
  | 'continue'
  | 'outline'

export interface NoteAiRequest {
  noteId: string
  action: NoteAiAction
  /** The current note body, sent by the renderer so unsaved edits are included. */
  noteContent?: string
  noteTitle?: string
  selection?: string
  text?: string
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
}

const ACTION_INSTRUCTIONS: Record<Exclude<NoteAiAction, 'chat'>, string> = {
  rewrite:
    'Rewrite the selected text so it is clearer and better structured. Preserve the meaning, facts and tone. Return only the rewritten text.',
  summarize:
    'Summarize the following content into a concise Markdown summary with the most important points. Return only the summary.',
  shorten:
    'Make the following text shorter and tighter while preserving every important fact. Return only the shortened text.',
  expand:
    'Expand the following text with useful detail and examples that are consistent with the existing content. Return only the expanded text.',
  fix:
    'Fix spelling, grammar and punctuation in the following text. Preserve the meaning and formatting. Return only the corrected text.',
  bullets:
    'Convert the following content into a clean Markdown bullet list. Return only the list.',
  translate:
    'Translate the following content into English. If it is already English, translate it into French. Return only the translation.',
  'action-items':
    'Extract action items from the following content. Return a Markdown checklist with owners or deadlines when they are explicitly mentioned. Do not invent owners or dates.',
  continue:
    'Continue writing the note naturally from where it ends. Match the existing style and do not repeat what is already written. Return only the continuation.',
  outline:
    'Create a clear Markdown outline for the following content. Return only the outline.'
}

/** Upper bounds for note AI context so long notes/transcripts stay affordable. */
export const MAX_NOTE_AI_CONTENT_CHARS = 40_000
export const MAX_NOTE_AI_TRANSCRIPT_CHARS = 60_000
export const MAX_NOTE_AI_TARGET_CHARS = 40_000

/**
 * Keeps the beginning and end of a long text, which preserves both the note's
 * opening context and its most recent content. The middle is replaced with a
 * marker so the model knows content was omitted.
 */
export function truncateMiddle(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) return text
  const marker = '\n\n…[truncated]…\n\n'
  const budget = maxChars - marker.length
  if (budget <= 0) return text.slice(0, maxChars)
  const head = Math.ceil(budget * 0.6)
  const tail = budget - head
  return `${text.slice(0, head)}${marker}${text.slice(text.length - tail)}`
}

function noteContext(note: Note, noteContent: string, noteTitle: string): string {
  const title = noteTitle.trim() || note.title || 'Untitled note'
  const content = truncateMiddle(noteContent.trim(), MAX_NOTE_AI_CONTENT_CHARS)
  const meetingTranscript = note.meeting?.transcript.trim() ?? ''
  const transcriptSection = meetingTranscript
    ? `\n\nMeeting transcript:\n${truncateMiddle(meetingTranscript, MAX_NOTE_AI_TRANSCRIPT_CHARS)}`
    : ''
  return `Note title: ${title}\n\nNote content:\n${content || '(empty)'}${transcriptSection}`
}

export function buildNoteAiInput(request: NoteAiRequest, note: Note): string {
  const noteContent = request.noteContent ?? note.content
  const noteTitle = request.noteTitle ?? note.title
  const context = noteContext(note, noteContent, noteTitle)

  if (request.action === 'chat') {
    const history = (request.messages ?? [])
      .slice(-20)
      .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
      .join('\n\n')
    const question = request.text?.trim() || 'Help me with this note.'
    return `${context}\n\nConversation so far:\n${history || '(new conversation)'}\n\nUser: ${question}`
  }

  const instruction = ACTION_INSTRUCTIONS[request.action]
  const rawTarget = request.selection?.trim() || request.text?.trim()
  const target = rawTarget ? truncateMiddle(rawTarget, MAX_NOTE_AI_TARGET_CHARS) : ''
  if (target) {
    return `${context}\n\n${instruction}\n\nText:\n${target}`
  }
  return `${context}\n\n${instruction}`
}

export function buildMeetingRecapInstructions(): string {
  return (
    "You are Covenant's meeting analyst. You turn raw meeting transcripts into accurate, useful recaps. " +
    'Only use information that appears in the transcript. Mark uncertain items as uncertain. Never invent attendees, owners, dates or decisions. ' +
    'Return Markdown only, starting with a single H1 title.'
  )
}

export function buildMeetingRecapPrompt(transcript: string, startedAt: number): string {
  const date = new Date(startedAt)
  const dateLabel = date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
  return `Meeting date: ${dateLabel}

Transcript:
${transcript}

Produce this structure:
# <short descriptive meeting title>

## TL;DR
<2-4 sentences>

## Key points
- <important point>

## Decisions
- <decision or "None recorded">

## Action items
- [ ] <task — owner/deadline only if explicitly mentioned>

## Open questions
- <question or "None recorded">

## Notable quotes
> <short meaningful quote, only if useful>

## Next steps
- <next step>

Keep the recap concise but complete. If the transcript is fragmentary, say so rather than filling gaps.`
}

export function buildPartialSummaryPrompt(transcriptChunk: string, index: number, total: number): string {
  return `This is part ${index + 1} of ${total} of a meeting transcript. Summarize this part as detailed Markdown bullet points, preserving decisions, action items, names, numbers and open questions. Return only the summary.\n\nTranscript part:\n${transcriptChunk}`
}

export function buildSynthesisPrompt(partialSummaries: string[], startedAt: number): string {
  return `Combine the following partial meeting summaries into one final recap. Remove duplication, keep all decisions/action items, and do not invent missing information. Start with a single H1 title.\n\nMeeting date: ${new Date(startedAt).toLocaleString()}\n\nPartial summaries:\n${partialSummaries.join('\n\n---\n\n')}`
}
