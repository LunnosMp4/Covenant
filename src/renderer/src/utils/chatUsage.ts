import type { ChatMessage } from '../../../shared/chat'
import { CHAT_MODEL_OPTIONS } from '../../../shared/config'
import { CHAT_MODEL_PRICING } from '../../../shared/usage'

export { CHAT_MODEL_PRICING }

export function formatTokenCount(tokens: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(tokens)
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  }).format(amount)
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
  const cachedPromptTokens = Math.min(usage.cachedPromptTokens ?? 0, promptTokens)
  const cacheWritePromptTokens = Math.min(usage.cacheWritePromptTokens ?? 0, Math.max(promptTokens - cachedPromptTokens, 0))
  const completionTokens = usage.completionTokens ?? 0
  const pricing = message.model ? CHAT_MODEL_PRICING[message.model.trim()] : undefined

  const inputTokens = Math.max(promptTokens - cachedPromptTokens - cacheWritePromptTokens, 0)
  const inputCost = pricing ? (inputTokens * pricing.inputPerMillion) / 1_000_000 : 0
  const cachedInputCost = pricing ? (cachedPromptTokens * pricing.cachedInputPerMillion) / 1_000_000 : 0
  const cacheWriteCost = pricing ? (cacheWritePromptTokens * pricing.cacheWritePerMillion) / 1_000_000 : 0
  const outputCost = pricing ? (completionTokens * pricing.outputPerMillion) / 1_000_000 : 0
  const totalCost = inputCost + cachedInputCost + cacheWriteCost + outputCost

  const parts = [
    `>${formatTokenCount(promptTokens)}tk`,
    `${formatTokenCount(completionTokens)}tk`
  ]

  if (pricing) {
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
    const cachedPromptTokens = Math.min(usage.cachedPromptTokens ?? 0, promptTokens)
    const cacheWritePromptTokens = Math.min(usage.cacheWritePromptTokens ?? 0, Math.max(promptTokens - cachedPromptTokens, 0))
    const completionTokens = usage.completionTokens ?? 0

    totalInputTokens += promptTokens
    totalOutputTokens += completionTokens
    totalTokens += usage.totalTokens ?? promptTokens + completionTokens

    const pricing = msg.model ? CHAT_MODEL_PRICING[msg.model.trim()] : undefined
    if (pricing) {
      const inputTokens = Math.max(promptTokens - cachedPromptTokens - cacheWritePromptTokens, 0)
      const inputCost = (inputTokens * pricing.inputPerMillion) / 1_000_000
      const cachedInputCost = (cachedPromptTokens * pricing.cachedInputPerMillion) / 1_000_000
      const cacheWriteCost = (cacheWritePromptTokens * pricing.cacheWritePerMillion) / 1_000_000
      const outputCost = (completionTokens * pricing.outputPerMillion) / 1_000_000
      totalCost += inputCost + cachedInputCost + cacheWriteCost + outputCost
    }
  }

  const maxTokens = CHAT_MODEL_OPTIONS.find((m) => m.id === currentModel)?.maxContextTokens ?? 0

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