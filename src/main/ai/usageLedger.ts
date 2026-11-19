import { randomUUID } from 'crypto'
import type { ChatUsage } from '../../shared/chat/chat'
import type { ChatProviderId } from '../../shared/config'
import type { AiUsageEntry, AiUsageKind } from '../../shared/ai/usage'
import { getUsageEntries, setUsageEntries } from '../store/usageStore'

const MAX_ENTRIES = 10_000
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
/**
 * Each AI call used to rewrite the shared electron-store file (which also
 * holds every conversation) and every conversation save rewrote the ledger.
 * Entries now live in their own store (see `store/usageStore.ts`) and writes are
 * coalesced: the array is kept in memory and persisted shortly after the last
 * record, with a flush on quit, so readers still see the entry immediately.
 */
const FLUSH_DELAY_MS = 2000

let entriesCache: AiUsageEntry[] | null = null
let flushTimer: NodeJS.Timeout | null = null

function loadEntries(): AiUsageEntry[] {
  if (entriesCache === null) {
    try {
      entriesCache = getUsageEntries()
    } catch {
      entriesCache = []
    }
  }
  return entriesCache
}

function persistNow(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (entriesCache === null) return
  try {
    setUsageEntries(entriesCache)
  } catch {
    // Persistence must never break a chat or note response.
  }
}

function schedulePersist(): void {
  if (flushTimer) return
  flushTimer = setTimeout(persistNow, FLUSH_DELAY_MS)
  flushTimer.unref?.()
}

/** Persists any pending ledger entries (called on quit). */
export function flushAiUsage(): void {
  persistNow()
}

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
    const existing = loadEntries()
    entriesCache = [...existing, entry]
      .filter((item) => item.timestamp >= cutoff)
      .slice(-MAX_ENTRIES)
    schedulePersist()
  } catch {
    // Usage recording must never break a chat or note response.
  }
}

export function getAiUsageEntries(): AiUsageEntry[] {
  const cutoff = Date.now() - MAX_AGE_MS
  return loadEntries().filter((entry) => entry.timestamp >= cutoff)
}
