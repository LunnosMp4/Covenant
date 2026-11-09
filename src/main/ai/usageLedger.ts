import { randomUUID } from 'crypto'
import type { ChatUsage } from '../../shared/chat/chat'
import type { ChatProviderId } from '../../shared/config'
import type { AiUsageEntry, AiUsageKind } from '../../shared/ai/usage'
import { appStore } from '../store/appStore'

const MAX_ENTRIES = 10_000
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

export interface RecordUsageInput {
  provider: ChatProviderId
  model: string
  kind: AiUsageKind
  usage: ChatUsage
  timestamp?: number
}

export function recordAiUsage(input: RecordUsageInput): void {
  try {
    const entry: AiUsageEntry = {
      id: randomUUID(),
      timestamp: input.timestamp ?? Date.now(),
      provider: input.provider,
      model: input.model,
      kind: input.kind,
      promptTokens: input.usage.promptTokens ?? 0,
      cachedPromptTokens: input.usage.cachedPromptTokens,
      cacheWritePromptTokens: input.usage.cacheWritePromptTokens,
      completionTokens: input.usage.completionTokens ?? 0,
      reasoningTokens: input.usage.reasoningTokens,
      totalTokens: input.usage.totalTokens,
      cost: input.usage.cost,
      listCost: input.usage.listCost,
      allowance: input.usage.allowance,
      billingSource: input.usage.billingSource
    }

    const cutoff = Date.now() - MAX_AGE_MS
    const existing = appStore.get('aiUsageEntries', [])
    const next = [...existing, entry]
      .filter((item) => item.timestamp >= cutoff)
      .slice(-MAX_ENTRIES)
    appStore.set('aiUsageEntries', next)
  } catch {
    // Usage recording must never break a chat or note response.
  }
}

export function getAiUsageEntries(): AiUsageEntry[] {
  const cutoff = Date.now() - MAX_AGE_MS
  return appStore.get('aiUsageEntries', []).filter((entry) => entry.timestamp >= cutoff)
}

export function clearAiUsageEntries(): void {
  appStore.set('aiUsageEntries', [])
}
