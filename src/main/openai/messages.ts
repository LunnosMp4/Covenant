import type { AppConfig } from '../../shared/config'
import {
  DEFAULT_REASONING_EFFORT,
  modelDoesReasoningFor,
  modelSupportsTemperatureFor,
  type AiModelOption,
  type ChatProviderId,
  type ReasoningEffort
} from '../../shared/config'
import type { ChatRole } from '../../shared/chat/chat'
import { CHAT_ROLE_SET } from '../../shared/chat/chat'
import { getGlobalInstructions } from '../features/preprompts'

export type SanitizedMessage = {
  role: ChatRole
  content: string | Array<{ type: string; text?: string; image_url?: string }>
}

export type RawChatMessage = {
  role?: string
  content?: string | Array<{ type: string; text?: string; image_url?: string }>
}

export function sanitizeMessages(rawMessages: RawChatMessage[]): SanitizedMessage[] {
  if (!Array.isArray(rawMessages)) return []

  return rawMessages
    .map((message): SanitizedMessage | null => {
      const role = typeof message.role === 'string' ? message.role.trim() : ''
      if (!CHAT_ROLE_SET.has(role as ChatRole)) return null
      const content = message.content
      if (content == null) return null
      if (typeof content === 'string') {
        const trimmed = content.trim()
        if (!trimmed) return null
        return { role: role as ChatRole, content: trimmed }
      }
      if (Array.isArray(content) && content.length > 0) {
        return { role: role as ChatRole, content }
      }
      return null
    })
    .filter((message): message is SanitizedMessage => message != null)
}

export const MAX_MCP_TOOL_ROUNDS = 5
export const MAX_TOOL_RESULT_DISPLAY_LENGTH = 1200

const COVENANT_INSTRUCTIONS =
  "You are Covenant, a helpful, concise AI assistant integrated into a user's operating system. Keep your answers brief and to the point."

export function truncateMcpResult(content: string): string {
  const trimmed = content.trim()
  if (trimmed.length <= MAX_TOOL_RESULT_DISPLAY_LENGTH) {
    return trimmed
  }
  return `${trimmed.slice(0, MAX_TOOL_RESULT_DISPLAY_LENGTH)}\n… (truncated)`
}

export function buildResponsesInput(sanitizedMessages: SanitizedMessage[]): Array<Record<string, unknown>> {
  return sanitizedMessages.map((message) => ({
    role:
      message.role === 'assistant'
        ? ('assistant' as const)
        : message.role === 'system'
          ? ('developer' as const)
          : (message.role as string),
    content: message.content
  }))
}

function mapReasoningEffort(
  requested: ReasoningEffort,
  supported: string[] | undefined
): string | undefined {
  if (!supported || supported.length === 0) return undefined
  if (supported.includes(requested)) return requested

  const preferences: Record<ReasoningEffort, string[]> = {
    low: ['low', 'minimal', 'medium', 'high', 'xhigh', 'max'],
    medium: ['medium', 'low', 'high', 'xhigh', 'max', 'minimal'],
    high: ['high', 'xhigh', 'max', 'medium', 'low', 'minimal']
  }

  for (const candidate of preferences[requested]) {
    if (supported.includes(candidate)) return candidate
  }
  return supported[0]
}

export function buildResponseParams(
  storedConfig: AppConfig,
  model: string,
  options: { provider?: ChatProviderId; modelOption?: AiModelOption } = {}
): Record<string, unknown> {
  const globalInstructions = getGlobalInstructions()
  const params: Record<string, unknown> = {
    instructions: globalInstructions
      ? `${COVENANT_INSTRUCTIONS}\n\n${globalInstructions}`
      : COVENANT_INSTRUCTIONS
  }

  const provider = options.provider ?? storedConfig.chatProvider
  const reasoning = options.modelOption
    ? options.modelOption.supportsReasoning
    : modelDoesReasoningFor(provider, model)
  const supportsTemperature = options.modelOption
    ? options.modelOption.supportsTemperature
    : modelSupportsTemperatureFor(provider, model)

  if (reasoning) {
    const effort = mapReasoningEffort(
      storedConfig.reasoningEffort || DEFAULT_REASONING_EFFORT,
      options.modelOption?.reasoningEfforts
    )
    if (effort) {
      params.reasoning = {
        effort,
        summary: 'auto'
      }
    }
  } else if (supportsTemperature) {
    params.temperature = 0.7
  }

  return params
}

export function buildWebSearchToolDefinition(): {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
} {
  return {
    type: 'function',
    name: 'web_search',
    description:
      'Search the web for current information. Use this when the answer depends on recent events, live data, or facts you are not confident about. Returns a short summary and source links.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query.'
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  }
}

export function extractWebSearchQuery(action: Record<string, unknown> | undefined): string {
  if (!action) return ''
  if (Array.isArray(action.queries) && action.queries.length > 0) return String(action.queries[0])
  if (typeof action.query === 'string' && action.query.trim()) return action.query
  if (typeof action.pattern === 'string' && action.pattern.trim()) return action.pattern
  if (typeof action.url === 'string' && action.url.trim()) return action.url
  return ''
}
