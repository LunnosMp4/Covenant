import { modelSupportsTemperature } from '../../shared/config'
import { readConfig } from '../config/configStore'
import { createOpenAIClient } from './client'

const CONVERSATION_TITLE_MODEL = 'gpt-6-luna'
const MAX_GENERATED_TITLE_LENGTH = 60

function normalizeGeneratedTitle(rawTitle: unknown): string | null {
  if (typeof rawTitle !== 'string') return null

  const cleaned = rawTitle
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '')
    .replace(/[.!?…]+$/, '')
    .trim()

  if (!cleaned) return null
  return cleaned.slice(0, MAX_GENERATED_TITLE_LENGTH)
}

export async function generateConversationTitle(prompt: string): Promise<string> {
  const normalizedPrompt = prompt.trim()
  if (!normalizedPrompt) {
    throw new Error('Prompt cannot be empty.')
  }

  const storedConfig = readConfig()
  const apiKey = storedConfig.apiKey || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OpenAI API key is missing.')
  }

  const client = createOpenAIClient(apiKey, storedConfig.proxyUrl)

  const response = await client.responses.create({
    model: CONVERSATION_TITLE_MODEL,
    instructions:
      'Generate a very short conversation title (at most 6 words) that summarizes the user prompt. Respond with only the title, without quotes, without trailing punctuation, and without any explanation.',
    input: `User prompt: ${normalizedPrompt}`,
    ...(modelSupportsTemperature(CONVERSATION_TITLE_MODEL) ? { temperature: 0.3 } : {})
  })

  const rawTitle = (response as unknown as { output_text?: unknown }).output_text
  return normalizeGeneratedTitle(rawTitle) ?? 'New chat'
}
