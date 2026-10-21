import { randomUUID } from 'crypto'
import type { WebContents } from 'electron'
import type { Note } from '../../shared/notes/note'
import { MAX_NOTE_CONTENT_LENGTH } from '../../shared/notes/note'
import type { NoteAiRequest } from '../../shared/notes/prompts'
import { buildNoteAiInput, NOTE_AI_INSTRUCTIONS } from '../../shared/notes/prompts'
import { readConfig } from '../config/configStore'
import { getNote } from '../features/notes'
import { createOpenAIClient } from '../openai/client'
import { buildResponseParams, buildResponsesInput } from '../openai/messages'
import { runStreamingChat } from '../openai/streaming'

const activeStreams = new Map<string, AbortController>()

function normalizeRequest(raw: unknown): NoteAiRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const noteId = typeof obj.noteId === 'string' ? obj.noteId.trim() : ''
  const action = typeof obj.action === 'string' ? obj.action : 'chat'
  const allowed = new Set([
    'chat',
    'rewrite',
    'summarize',
    'shorten',
    'expand',
    'fix',
    'bullets',
    'translate',
    'action-items',
    'continue',
    'outline'
  ])
  if (!noteId || !allowed.has(action)) return null

  return {
    noteId,
    action: action as NoteAiRequest['action'],
    noteContent:
      typeof obj.noteContent === 'string'
        ? obj.noteContent.slice(0, MAX_NOTE_CONTENT_LENGTH)
        : undefined,
    noteTitle: typeof obj.noteTitle === 'string' ? obj.noteTitle : undefined,
    selection: typeof obj.selection === 'string' ? obj.selection : undefined,
    text: typeof obj.text === 'string' ? obj.text : undefined,
    messages: Array.isArray(obj.messages)
      ? obj.messages
          .map((message) => {
            if (!message || typeof message !== 'object') return null
            const entry = message as Record<string, unknown>
            if (entry.role !== 'user' && entry.role !== 'assistant') return null
            if (typeof entry.content !== 'string') return null
            return { role: entry.role, content: entry.content.slice(0, 20_000) }
          })
          .filter(
            (message): message is { role: 'user' | 'assistant'; content: string } =>
              message != null
          )
          .slice(-20)
      : undefined
  }
}

export function cancelNoteAi(streamId: string): void {
  if (typeof streamId !== 'string') return
  activeStreams.get(streamId)?.abort()
}

export async function runNoteAi(
  sender: WebContents,
  rawPayload: unknown
): Promise<{ id: string }> {
  const request = normalizeRequest(rawPayload)
  if (!request) throw new Error('Invalid note AI request.')

  const note: Note | null = await getNote(request.noteId)
  if (!note) throw new Error('Note not found.')

  const config = readConfig()
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OpenAI API key is missing. Add it in Settings > General.')
  }

  const model = config.chatModel
  const client = createOpenAIClient(apiKey, config.proxyUrl)
  const streamId = randomUUID()
  const controller = new AbortController()
  activeStreams.set(streamId, controller)

  const params = buildResponseParams(config, model)
  params.instructions = NOTE_AI_INSTRUCTIONS
  const input = buildResponsesInput([
    { role: 'user', content: buildNoteAiInput(request, note) }
  ])

  const sendStreamEvent = (payload: { id: string } & Record<string, unknown>): void => {
    if (sender.isDestroyed()) return
    sender.send('notes:ai-event', payload)
  }

  void runStreamingChat(
    { client, streamId, sender, model, sendStreamEvent, signal: controller.signal },
    input,
    [],
    params,
    [],
    []
  ).finally(() => {
    activeStreams.delete(streamId)
  })

  return { id: streamId }
}
