import type {
  UsageCostPoint,
  UsageMetrics,
  UsageModelBreakdown,
  UsageServiceBreakdown
} from '../system/usage'

export type AiUsageKind = 'chat' | 'note' | 'recap' | 'ocr'

export interface AiUsageEntry {
  id: string
  timestamp: number
  provider: 'openai' | 'opencode'
  model: string
  kind: AiUsageKind
  promptTokens: number
  cachedPromptTokens?: number
  cacheWritePromptTokens?: number
  completionTokens: number
  reasoningTokens?: number
  totalTokens?: number
  cost?: number
  listCost?: number
  allowance?: number
  billingSource?: string
}

const DAY_SECONDS = 24 * 60 * 60

function dayStartSeconds(timestampMs: number): number {
  const date = new Date(timestampMs)
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000)
}

export function buildLocalUsageMetrics(
  entries: AiUsageEntry[],
  rangeDays: number,
  now = Date.now()
): UsageMetrics {
  const endDate = new Date(now)
  const endDay = Math.floor(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()) / 1000
  )
  const startTime = endDay - (rangeDays - 1) * DAY_SECONDS
  const endTime = endDay + DAY_SECONDS
  const filtered = entries.filter((entry) => entry.timestamp / 1000 >= startTime)

  const dailyMap = new Map<number, UsageCostPoint>()
  for (let index = 0; index < rangeDays; index += 1) {
    const start = startTime + index * DAY_SECONDS
    dailyMap.set(start, { startTime: start, endTime: start + DAY_SECONDS, amount: 0 })
  }

  const modelMap = new Map<string, UsageModelBreakdown>()
  const serviceMap = new Map<string, UsageServiceBreakdown>()

  let totalCost = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalAllowance = 0

  for (const entry of filtered) {
    const day = dayStartSeconds(entry.timestamp)
    const bucket = dailyMap.get(day)
    const cost = entry.cost ?? entry.listCost ?? 0
    if (bucket) bucket.amount += cost
    totalCost += cost
    totalInputTokens += entry.promptTokens
    totalOutputTokens += entry.completionTokens
    totalAllowance += entry.allowance ?? 0

    const model = modelMap.get(entry.model) ?? {
      model: entry.model,
      requests: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      allowance: 0
    }
    model.requests += 1
    model.inputTokens += entry.promptTokens
    model.cachedInputTokens += entry.cachedPromptTokens ?? 0
    model.outputTokens += entry.completionTokens
    model.estimatedCost = (model.estimatedCost ?? 0) + cost
    model.allowance = (model.allowance ?? 0) + (entry.allowance ?? 0)
    modelMap.set(entry.model, model)

    const serviceLabel =
      entry.kind === 'note'
        ? 'Notes'
        : entry.kind === 'recap'
          ? 'Meeting recaps'
          : entry.kind === 'ocr'
            ? 'OCR'
            : 'Chat'
    const service = serviceMap.get(serviceLabel) ?? { label: serviceLabel, amount: 0, quantity: 0 }
    service.amount += cost
    service.quantity = (service.quantity ?? 0) + 1
    serviceMap.set(serviceLabel, service)
  }

  return {
    rangeDays,
    startTime,
    endTime,
    fetchedAt: now,
    currency: 'usd',
    totalCost,
    totalRequests: filtered.length,
    totalInputTokens,
    totalOutputTokens,
    daily: [...dailyMap.values()].sort((a, b) => a.startTime - b.startTime),
    byService: [...serviceMap.values()].sort((a, b) => b.amount - a.amount),
    byModel: [...modelMap.values()].sort((a, b) => (b.estimatedCost ?? 0) - (a.estimatedCost ?? 0)),
    allowance: totalAllowance || undefined
  }
}
