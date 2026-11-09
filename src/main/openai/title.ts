import { modelSupportsTemperatureFor } from '../../shared/config'
import { readConfig } from '../config/configStore'
import { resolveChatProvider } from '../ai/provider'
import { buildResponseParams } from './messages'

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

export async function generateConversationTitle(
  prompt: string,
  sessionId?: string
): Promise<string> {
  const normalizedPrompt = prompt.trim()
  if (!normalizedPrompt) {
    throw new Error('Prompt cannot be empty.')
  }

  const storedConfig = readConfig()
  const provider = resolveChatProvider(storedConfig, {
    model: CONVERSATION_TITLE_MODEL,
    sessionId
  })
  const modelOption = provider.modelOption
  const params = buildResponseParams(storedConfig, CONVERSATION_TITLE_MODEL, {
    provider: provider.provider,
    modelOption
  })
  delete params.instructions
  delete params.reasoning
  if (modelSupportsTemperatureFor(provider.provider, CONVERSATION_TITLE_MODEL)) {
    params.temperature = 0.3
  }

  const response = await provider.client.responses.create({
    model: CONVERSATION_TITLE_MODEL,
    instructions:
      'Generate a very short conversation title (at most 6 words) that summarizes the user prompt. Respond with only the title, without quotes, without trailing punctuation, and without any explanation.',
    input: `User prompt: ${normalizedPrompt}`,
    ...(params as Record<string, unknown>)
  } as never)

  const rawTitle = (response as unknown as { output_text?: unknown }).output_text
  return normalizeGeneratedTitle(rawTitle) ?? 'New chat'
}
