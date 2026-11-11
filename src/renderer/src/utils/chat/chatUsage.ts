import type { ChatMessage, ChatUsage } from '../../../../shared/chat/chat'
import { CHAT_MODEL_OPTIONS, OPENCODE_MODEL_OPTIONS } from '../../../../shared/config'
import { resolveModelPricing, type ModelPricing } from '../../../../shared/system/usage'

// Intl formatters are expensive to construct and were previously rebuilt for
// every message on every render (including each streamed token).
const TOKEN_COUNT_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4
})

export function formatTokenCount(tokens: number): string {
  return TOKEN_COUNT_FORMATTER.format(tokens)
}

export function formatCurrency(amount: number): string {
  return CURRENCY_FORMATTER.format(amount)
}

function resolveMessagePricing(model: string | undefined): ModelPricing | undefined {
  const openAI = resolveModelPricing(model)
  if (openAI) return openAI
  const openCode = model
    ? OPENCODE_MODEL_OPTIONS.find((option) => option.id === model.trim())?.pricing
    : undefined
  return openCode
    ? {
        inputPerMillion: openCode.inputPerMillion,
        cachedInputPerMillion: openCode.cachedInputPerMillion,
        cacheWritePerMillion: 0,
        outputPerMillion: openCode.outputPerMillion
      }
    : undefined
}

function computeUsageCost(usage: ChatUsage, pricing: ModelPricing | undefined): number | undefined {
  if (typeof usage.cost === 'number' && Number.isFinite(usage.cost)) return usage.cost
  if (!pricing) return undefined

  const promptTokens = usage.promptTokens ?? 0
  const cachedPromptTokens = Math.min(usage.cachedPromptTokens ?? 0, promptTokens)
  const cacheWritePromptTokens = Math.min(
    usage.cacheWritePromptTokens ?? 0,
    Math.max(promptTokens - cachedPromptTokens, 0)
  )
  const completionTokens = usage.completionTokens ?? 0
  const inputTokens = Math.max(promptTokens - cachedPromptTokens - cacheWritePromptTokens, 0)

  return (
    (inputTokens * pricing.inputPerMillion) / 1_000_000 +
    (cachedPromptTokens * pricing.cachedInputPerMillion) / 1_000_000 +
    (cacheWritePromptTokens * pricing.cacheWritePerMillion) / 1_000_000 +
    (completionTokens * pricing.outputPerMillion) / 1_000_000
  )
}

export function formatConversationTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  return `${monthDay}, ${time}`
}

export function formatUsageSummary(message: ChatMessage): string | undefined {
  const usage = message.usage
  if (!usage) {
    return undefined
  }

  const promptTokens = usage.promptTokens ?? 0
  const completionTokens = usage.completionTokens ?? 0
  const totalCost = computeUsageCost(usage, resolveMessagePricing(message.model))

  const parts = [
    `>${formatTokenCount(promptTokens)}tk`,
    `${formatTokenCount(completionTokens)}tk`
  ]

  if (totalCost !== undefined) {
    parts.push(formatCurrency(totalCost))
  } else {
    const totalTokens = usage.totalTokens ?? promptTokens + completionTokens
    parts.push(`${formatTokenCount(totalTokens)}tk`)
  }

  return parts.join(' · ')
}

export interface ContextStats {
  totalTokens: number
  maxTokens: number
  totalCost: number
  messageCount: number
  totalInputTokens: number
  totalOutputTokens: number
}

export function computeContextStats(
  messages: ChatMessage[],
  currentModel: string
): ContextStats {
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalTokens = 0
  let totalCost = 0

  for (const msg of messages) {
    const usage = msg.usage
    if (!usage) continue

    const promptTokens = usage.promptTokens ?? 0
    const completionTokens = usage.completionTokens ?? 0

    totalInputTokens += promptTokens
    totalOutputTokens += completionTokens
    totalTokens += usage.totalTokens ?? promptTokens + completionTokens

    const cost = computeUsageCost(usage, resolveMessagePricing(msg.model))
    if (cost !== undefined) totalCost += cost
  }

  const maxTokens =
    CHAT_MODEL_OPTIONS.find((m) => m.id === currentModel)?.maxContextTokens ??
    OPENCODE_MODEL_OPTIONS.find((m) => m.id === currentModel)?.maxContextTokens ??
    1_000_000

  return {
    totalTokens,
    maxTokens,
    totalCost,
    messageCount: messages.length,
    totalInputTokens,
    totalOutputTokens
  }
}

export function formatSourceUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '') + parsed.pathname.replace(/\/$/, '')
  } catch {
    return url
  }
}

export function formatSourceDomain(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}