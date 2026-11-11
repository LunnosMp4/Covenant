import type OpenAI from 'openai'
import type { AppConfig, NotesSettings } from '../../shared/config'
import {
  getModelOptionFor,
  type AiModelOption,
  type ChatProviderId
} from '../../shared/config'
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
import { resolveChatProvider } from '../ai/provider'
import { recordAiUsage } from '../ai/usageLedger'
import { buildResponseParams } from '../openai/messages'
import { sendToMain } from '../windows/broadcast'

const TRANSCRIPT_CHUNK_CHARS = 120_000
const PARTIAL_SUMMARY_CHUNK_CHARS = 100_000

function responseParams(
  config: AppConfig,
  model: string,
  provider: ChatProviderId,
  modelOption?: AiModelOption
): Record<string, unknown> {
  const params = buildResponseParams(config, model, { provider, modelOption })
  delete params.instructions
  if (typeof params.temperature === 'number') params.temperature = 0.3
  return params
}

function recordResponseUsage(
  provider: ChatProviderId,
  model: string,
  response: unknown
): void {
  const usage = (response as { usage?: Record<string, unknown> } | undefined)?.usage
  if (!usage) return
  recordAiUsage({
    provider,
    model,
    kind: 'recap',
    usage: {
      promptTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined,
      completionTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined,
      totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined,
      reasoningTokens:
        (usage.output_tokens_details as Record<string, unknown> | undefined)?.reasoning_tokens as
          | number
          | undefined,
      cost: typeof usage.cost === 'number' ? usage.cost : undefined
    }
  })
}

async function createText(
  client: OpenAI,
  model: string,
  config: AppConfig,
  instructions: string,
  input: string,
  provider: ChatProviderId,
  modelOption?: AiModelOption
): Promise<string> {
  const response = await client.responses.create({
    model,
    input,
    ...responseParams(config, model, provider, modelOption),
    instructions
  } as never)
  recordResponseUsage(provider, model, response)
  const text = (response as unknown as { output_text?: unknown }).output_text
  return typeof text === 'string' ? text.trim() : ''
}

async function summarizeChunks(
  client: OpenAI,
  model: string,
  config: AppConfig,
  transcript: string,
  provider: ChatProviderId,
  modelOption?: AiModelOption
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
      buildPartialSummaryPrompt(chunks[index], index, chunks.length),
      provider,
      modelOption
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

  const provider = await resolveChatProvider(config, { sessionId: note.id })
  const client = provider.client
  const requestedModel = settings.summaryModel || provider.model
  const modelOption =
    getModelOptionFor(provider.provider, requestedModel) ?? provider.modelOption
  const model = modelOption.id || provider.model
  const source = await summarizeChunks(client, model, config, transcript, provider.provider, modelOption)
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
    prompt,
    provider.provider,
    modelOption
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
