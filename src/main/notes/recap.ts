import type OpenAI from 'openai'
import type { AppConfig, NotesSettings } from '../../shared/config'
import { DEFAULT_REASONING_EFFORT, modelDoesReasoning } from '../../shared/config'
import type { Note } from '../../shared/notes/note'
import { chunkTranscript, extractRecapTitle } from '../../shared/notes/meeting'
import {
  buildMeetingRecapInstructions,
  buildMeetingRecapPrompt,
  buildPartialSummaryPrompt,
  buildSynthesisPrompt
} from '../../shared/notes/prompts'
import { readConfig } from '../config/configStore'
import { applyMeetingRecap, getNote, updateNoteMeeting } from '../features/notes'
import { createOpenAIClient } from '../openai/client'
import { sendToMain } from '../windows/broadcast'

const TRANSCRIPT_CHUNK_CHARS = 120_000
const PARTIAL_SUMMARY_CHUNK_CHARS = 100_000

function responseParams(config: AppConfig): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  if (modelDoesReasoning(config.chatModel)) {
    params.reasoning = {
      effort: config.reasoningEffort || DEFAULT_REASONING_EFFORT,
      summary: 'auto'
    }
  } else {
    params.temperature = 0.3
  }
  return params
}

async function createText(
  client: OpenAI,
  model: string,
  config: AppConfig,
  instructions: string,
  input: string
): Promise<string> {
  const response = await client.responses.create({
    model,
    input,
    ...responseParams(config),
    instructions
  } as never)
  const text = (response as unknown as { output_text?: unknown }).output_text
  return typeof text === 'string' ? text.trim() : ''
}

async function summarizeChunks(
  client: OpenAI,
  model: string,
  config: AppConfig,
  transcript: string
): Promise<string> {
  const chunks = chunkTranscript(transcript, PARTIAL_SUMMARY_CHUNK_CHARS)
  if (chunks.length <= 1) return transcript

  const partials: string[] = []
  for (let index = 0; index < chunks.length; index += 1) {
    const partial = await createText(
      client,
      model,
      config,
      'You summarize meeting transcripts faithfully. Use Markdown bullets and preserve names, numbers, decisions and action items.',
      buildPartialSummaryPrompt(chunks[index], index, chunks.length)
    )
    if (partial) partials.push(partial)
  }
  return partials.join('\n\n---\n\n')
}

export async function generateMeetingRecap(
  note: Note,
  config: AppConfig,
  settings: NotesSettings
): Promise<string> {
  const transcript = note.meeting?.transcript.trim() ?? ''
  if (!transcript) {
    throw new Error('There is no transcript to summarize yet.')
  }

  const apiKey = config.apiKey || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OpenAI API key is missing. Add it in Settings > General.')
  }

  const client = createOpenAIClient(apiKey, config.proxyUrl)
  const model = settings.summaryModel || config.chatModel
  const source = await summarizeChunks(client, model, config, transcript)
  const customPrompt = settings.summaryPrompt.trim()
  const startedAt = note.meeting?.startedAt ?? Date.now()
  // Apply the user's custom instructions for chunked transcripts too, not just
  // short ones, so the recap always follows their preferences.
  const prompt =
    source === transcript
      ? `${customPrompt ? `${customPrompt}\n\n` : ''}${buildMeetingRecapPrompt(transcript, startedAt)}`
      : `${customPrompt ? `${customPrompt}\n\n` : ''}${buildSynthesisPrompt(
          chunkTranscript(source, TRANSCRIPT_CHUNK_CHARS),
          startedAt
        )}`

  const recap = await createText(
    client,
    model,
    config,
    buildMeetingRecapInstructions(),
    prompt
  )
  if (!recap) throw new Error('The model returned an empty recap.')
  return recap
}

function fallbackTitle(note: Note): string {
  const generated = extractRecapTitle(note.content) ?? extractRecapTitle(note.meeting?.recap ?? '')
  if (generated) return generated.slice(0, 200)
  const current = note.title.trim()
  if (current && !/^meeting\s+—/i.test(current) && current !== 'Untitled meeting') {
    return current
  }
  return `Meeting — ${new Date(note.meeting?.startedAt ?? Date.now()).toLocaleDateString()}`
}

/** Notes currently being summarized, so a double trigger can't run twice. */
const activeRecaps = new Set<string>()

export async function summarizeMeeting(noteId: string): Promise<Note | null> {
  const note = await getNote(noteId)
  if (!note?.meeting) return null
  if (activeRecaps.has(noteId)) return note

  activeRecaps.add(noteId)
  try {
    const config = readConfig()
    const settings = config.notes

    const summarizing = await updateNoteMeeting(noteId, (meeting) => ({
      ...meeting,
      status: 'summarizing',
      error: undefined
    }))
    if (summarizing) {
      sendToMain('notes:meeting-event', {
        type: 'status',
        noteId,
        status: 'summarizing',
        note: summarizing
      })
    }

    const recap = await generateMeetingRecap(note, config, settings)
    const updated = await applyMeetingRecap(noteId, recap, fallbackTitle({ ...note, content: recap }))
    if (updated) {
      sendToMain('notes:meeting-event', { type: 'recap-done', noteId, note: updated })
    }
    return updated
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate the recap.'
    const failed = await updateNoteMeeting(noteId, (meeting) => ({
      ...meeting,
      status: 'error',
      error: message
    }))
    if (failed) {
      sendToMain('notes:meeting-event', {
        type: 'error',
        noteId,
        error: message,
        note: failed
      })
    }
    return failed
  } finally {
    activeRecaps.delete(noteId)
  }
}
