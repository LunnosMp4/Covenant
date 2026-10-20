import type { NotesSettings } from '../../shared/config'
import { readConfig } from '../config/configStore'
import { createOpenAIClient } from '../openai/client'

const MAX_TRANSCRIPTION_BYTES = 24 * 1024 * 1024

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Transcribes a short audio segment with OpenAI. Segments are capped at a few
 * minutes by the renderer, so they stay well below the 25 MB request limit.
 */
export async function transcribeAudio(
  audio: Buffer,
  fileName: string,
  settings?: NotesSettings
): Promise<string> {
  if (!audio.length) return ''
  if (audio.length > MAX_TRANSCRIPTION_BYTES) {
    throw new Error('Audio segment is too large to transcribe.')
  }

  const storedConfig = readConfig()
  const apiKey = storedConfig.apiKey || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OpenAI API key is missing. Add it in Settings > General.')
  }

  const notes = settings ?? storedConfig.notes
  const client = createOpenAIClient(apiKey, storedConfig.proxyUrl)
  const file = new File([audio as unknown as BlobPart], fileName, { type: 'audio/webm' })
  const isDiarized = notes.transcriptionModel === 'gpt-4o-transcribe-diarize'

  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const transcription = await client.audio.transcriptions.create({
        model: notes.transcriptionModel,
        file,
        ...(isDiarized
          ? {
              response_format: 'diarized_json',
              // Required by gpt-4o-transcribe-diarize for audio over 30 seconds.
              chunking_strategy: 'auto'
            }
          : { response_format: 'text' }),
        ...(notes.transcriptionLanguage ? { language: notes.transcriptionLanguage } : {})
      } as never)

      if (isDiarized && transcription && typeof transcription === 'object') {
        const segments = (transcription as unknown as { segments?: unknown }).segments
        if (Array.isArray(segments) && segments.length > 0) {
          const lines = segments
            .map((segment) => {
              if (!segment || typeof segment !== 'object') return ''
              const entry = segment as Record<string, unknown>
              const text = typeof entry.text === 'string' ? entry.text.trim() : ''
              if (!text) return ''
              const speaker = typeof entry.speaker === 'string' ? entry.speaker.trim() : ''
              return speaker ? `${speaker}: ${text}` : text
            })
            .filter(Boolean)
          if (lines.length > 0) return lines.join('\n')
        }
      }

      const text =
        typeof transcription === 'string'
          ? transcription
          : typeof (transcription as unknown as { text?: unknown }).text === 'string'
            ? ((transcription as unknown as { text: string }).text)
            : ''
      return text.trim()
    } catch (error) {
      lastError = error
      if (attempt === 0) await delay(700)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Transcription failed.')
}
