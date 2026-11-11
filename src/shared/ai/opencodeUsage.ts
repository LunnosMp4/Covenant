import type {
  UsageCostPoint,
  UsageMetrics,
  UsageModelBreakdown,
  UsageServiceBreakdown
} from '../system/usage'

export type OpenCodeUsageErrorCode =
  | 'KEY_MISSING'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'UNKNOWN'

export interface OpenCodeUsageError {
  source: string
  code: OpenCodeUsageErrorCode
  message: string
}

export interface OpenCodeUsageMeter {
  percent: number
  limited?: boolean
  usedUsd?: number
  limitUsd?: number
  resetsAt?: number
}

export interface OpenCodeUsageGo {
  product?: string
  accessEndsAt?: number
  cancelAtPeriodEnd?: boolean
  useBalance?: boolean
  meters: {
    fiveHour?: OpenCodeUsageMeter
    week?: OpenCodeUsageMeter
    month?: OpenCodeUsageMeter
  }
}

export interface OpenCodeUsageSnapshot {
  fetchedAt: number
  rangeDays: number
  go?: OpenCodeUsageGo
  spend?: UsageMetrics
  errors: OpenCodeUsageError[]
}

export type OpenCodeUsageResult =
  | { ok: true; snapshot: OpenCodeUsageSnapshot }
  | { ok: false; code: OpenCodeUsageErrorCode; message: string }

const MICRO_CENTS_PER_USD = 100_000_000
const DAY_SECONDS = 24 * 60 * 60

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function firstNum(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = num(record[key])
    if (value !== undefined) return value
  }
  return undefined
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function timeToMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return numeric > 10_000_000_000 ? numeric : numeric * 1000
    }
  }
  return undefined
}

function timeToSeconds(value: unknown): number | undefined {
  const ms = timeToMs(value)
  return ms === undefined ? undefined : Math.floor(ms / 1000)
}

function percentOf(used: number | undefined, limit: number | undefined): number {
  if (used === undefined || limit === undefined || limit <= 0) return 0
  return Math.max(0, Math.min(100, (used / limit) * 100))
}

function unwrap(raw: unknown): Record<string, unknown> {
  const record = asRecord(raw)
  const data = asRecord(record.data)
  return Object.keys(data).length > 0 ? data : record
}

function findArray(raw: unknown, keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw
  const record = unwrap(raw)
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) return value
  }
  return []
}

function productLabel(product: string | undefined): string | undefined {
  switch (product) {
    case 'go':
      return 'Go'
    case 'go-plus':
      return 'Go Plus'
    case 'go-teams':
      return 'Go Teams'
    default:
      return product
  }
}

/**
 * `GET https://opencode.ai/inference/go/v1/usage`
 * `{ usage: { rolling: { percent, resetsAt, status }, weekly, monthly } }`
 */
export function parseGoUsageResponse(raw: unknown): OpenCodeUsageGo | undefined {
  const root = asRecord(asRecord(raw).usage ?? raw)
  if (Object.keys(root).length === 0) return undefined

  const mapMeter = (value: unknown): OpenCodeUsageMeter | undefined => {
    const entry = asRecord(value)
    if (Object.keys(entry).length === 0) return undefined
    const percent = num(entry.percent) ?? num(entry.usagePercent) ?? 0
    return {
      percent: Math.max(0, Math.min(100, percent)),
      limited: percent >= 100,
      resetsAt: timeToMs(entry.resetsAt ?? entry.resetAt ?? entry.resets_at)
    }
  }

  const meters = {
    fiveHour: mapMeter(root.rolling ?? root.fiveHour ?? root.five_hour),
    week: mapMeter(root.weekly ?? root.week),
    month: mapMeter(root.monthly ?? root.month)
  }

  if (!meters.fiveHour && !meters.week && !meters.month) return undefined
  return { meters }
}

/**
 * `GET https://opencode.ai/console/api/go/status`
 * Meters are reported as used/limit micro-cents.
 */
export function parseGoStatusResponse(raw: unknown): OpenCodeUsageGo | undefined {
  const record = unwrap(raw)
  if (Object.keys(record).length === 0) return undefined

  const access = asRecord(record.access)
  const metersRecord = asRecord(access.meters ?? record.meters)
  const mapMeter = (value: unknown): OpenCodeUsageMeter | undefined => {
    const entry = asRecord(value)
    if (Object.keys(entry).length === 0) return undefined
    const usedMicro = num(entry.usedMicroCents ?? entry.used_micro_cents)
    const limitMicro = num(entry.limitMicroCents ?? entry.limit_micro_cents)
    const usedUsd = usedMicro === undefined ? undefined : usedMicro / MICRO_CENTS_PER_USD
    const limitUsd = limitMicro === undefined ? undefined : limitMicro / MICRO_CENTS_PER_USD
    return {
      percent: percentOf(usedMicro, limitMicro),
      limited: usedMicro !== undefined && limitMicro !== undefined && usedMicro >= limitMicro,
      usedUsd,
      limitUsd,
      resetsAt: timeToMs(entry.resetsAt ?? entry.resets_at ?? access.endsAt ?? access.ends_at)
    }
  }

  const meters = {
    fiveHour: mapMeter(metersRecord.fiveHour ?? metersRecord.five_hour),
    week: mapMeter(metersRecord.week ?? metersRecord.weekly),
    month: mapMeter(metersRecord.month ?? metersRecord.monthly)
  }

  const product = firstString(record, ['product', 'plan', 'planID'])
  if (!product && !meters.fiveHour && !meters.week && !meters.month) return undefined

  return {
    product: productLabel(product),
    accessEndsAt: timeToMs(access.endsAt ?? access.ends_at ?? record.endsAt ?? record.ends_at),
    cancelAtPeriodEnd:
      record.cancelAtPeriodEnd === true || record.cancel_at_period_end === true
        ? true
        : undefined,
    useBalance: typeof record.useBalance === 'boolean' ? record.useBalance : undefined,
    meters
  }
}

/** Merge the inference usage meters with the console subscription metadata. */
export function mergeGoUsage(
  status: OpenCodeUsageGo | undefined,
  usage: OpenCodeUsageGo | undefined
): OpenCodeUsageGo | undefined {
  if (!status && !usage) return undefined
  const meters: OpenCodeUsageGo['meters'] = {}
  for (const key of ['fiveHour', 'week', 'month'] as const) {
    const fromStatus = status?.meters[key]
    const fromUsage = usage?.meters[key]
    if (fromStatus || fromUsage) {
      meters[key] = {
        ...fromStatus,
        ...fromUsage,
        usedUsd: fromStatus?.usedUsd,
        limitUsd: fromStatus?.limitUsd,
        percent: fromUsage?.percent ?? fromStatus?.percent ?? 0,
        resetsAt: fromUsage?.resetsAt ?? fromStatus?.resetsAt
      }
    }
  }
  return {
    product: status?.product ?? usage?.product,
    accessEndsAt: status?.accessEndsAt,
    cancelAtPeriodEnd: status?.cancelAtPeriodEnd,
    useBalance: status?.useBalance,
    meters
  }
}

export interface ParsedUsageSummary {
  totalCost?: number
  totalRequests?: number
  totalInputTokens?: number
  totalOutputTokens?: number
  totalCachedInputTokens?: number
  services?: UsageServiceBreakdown[]
}

/** `GET /console/api/usage/summary?range=30d` (tolerant of field casing). */
export function parseUsageSummary(raw: unknown): ParsedUsageSummary | undefined {
  const unwrapped = unwrap(raw)
  const summary = asRecord(unwrapped.summary)
  const record = Object.keys(summary).length > 0 ? summary : unwrapped
  if (Object.keys(record).length === 0) return undefined

  const costMicro = firstNum(record, ['totalCostMicroCents', 'total_cost_micro_cents', 'costMicroCents'])
  const costUsd = firstNum(record, ['totalCost', 'total_cost', 'cost'])
  const services = asArray(record.services)
    .map((item): UsageServiceBreakdown | null => {
      const entry = asRecord(item)
      const label = firstString(entry, ['service', 'label', 'name', 'lineItem', 'line_item'])
      if (!label) return null
      const micro = firstNum(entry, ['totalCostMicroCents', 'total_cost_micro_cents', 'costMicroCents'])
      const usd = firstNum(entry, ['amount', 'cost', 'totalCost'])
      return {
        label,
        amount: micro !== undefined ? micro / MICRO_CENTS_PER_USD : usd ?? 0,
        quantity: firstNum(entry, ['totalRequests', 'requests', 'quantity'])
      }
    })
    .filter((item): item is UsageServiceBreakdown => item !== null)

  return {
    totalCost: costMicro !== undefined ? costMicro / MICRO_CENTS_PER_USD : costUsd,
    totalRequests: firstNum(record, ['totalRequests', 'total_requests', 'requests', 'requestCount']),
    totalInputTokens: firstNum(record, ['totalInputTokens', 'total_input_tokens', 'inputTokens', 'promptTokens']),
    totalOutputTokens: firstNum(record, ['totalOutputTokens', 'total_output_tokens', 'outputTokens', 'completionTokens']),
    totalCachedInputTokens: firstNum(record, [
      'totalCacheReadTokens',
      'total_cache_read_tokens',
      'cachedInputTokens',
      'cached_input_tokens'
    ]),
    services: services.length > 0 ? services : undefined
  }
}

/** `GET /console/api/usage/cost-by-day?range=30d` */
export function parseCostByDayResponse(raw: unknown): UsageCostPoint[] {
  return findArray(raw, ['data', 'days', 'daily', 'costByDay', 'cost_by_day', 'items'])
    .map((item): UsageCostPoint | null => {
      const entry = asRecord(item)
      const start = timeToSeconds(
        entry.date ?? entry.day ?? entry.startTime ?? entry.start_time ?? entry.timestamp
      )
      if (start === undefined) return null
      const micro = firstNum(entry, ['totalCostMicroCents', 'total_cost_micro_cents', 'costMicroCents'])
      const usd = firstNum(entry, ['totalCost', 'total_cost', 'amount', 'cost'])
      return {
        startTime: start,
        endTime: start + DAY_SECONDS,
        amount: micro !== undefined ? micro / MICRO_CENTS_PER_USD : usd ?? 0
      }
    })
    .filter((item): item is UsageCostPoint => item !== null)
    .sort((a, b) => a.startTime - b.startTime)
}

/** `GET /console/api/usage/models?range=30d` */
export function parseModelsResponse(raw: unknown): UsageModelBreakdown[] {
  return findArray(raw, ['data', 'models', 'byModel', 'by_model', 'items'])
    .map((item): UsageModelBreakdown | null => {
      const entry = asRecord(item)
      const model = firstString(entry, ['model', 'modelID', 'model_id', 'id', 'name'])
      if (!model) return null
      const costMicro = firstNum(entry, ['totalCostMicroCents', 'total_cost_micro_cents', 'costMicroCents'])
      const costUsd = firstNum(entry, ['estimatedCost', 'cost', 'totalCost', 'total_cost'])
      return {
        model,
        requests:
          firstNum(entry, ['requests', 'totalRequests', 'total_requests', 'requestCount', 'numRequests']) ?? 0,
        inputTokens:
          firstNum(entry, ['inputTokens', 'totalInputTokens', 'total_input_tokens', 'promptTokens']) ?? 0,
        cachedInputTokens:
          firstNum(entry, ['cachedInputTokens', 'totalCacheReadTokens', 'cacheReadTokens', 'cached_tokens']) ?? 0,
        outputTokens:
          firstNum(entry, ['outputTokens', 'totalOutputTokens', 'total_output_tokens', 'completionTokens']) ?? 0,
        estimatedCost: costMicro !== undefined ? costMicro / MICRO_CENTS_PER_USD : costUsd ?? null
      }
    })
    .filter((item): item is UsageModelBreakdown => item !== null)
}

export interface BuildOpenCodeSpendInput {
  rangeDays: number
  startTime: number
  endTime: number
  now?: number
  summary?: ParsedUsageSummary
  daily?: UsageCostPoint[]
  models?: UsageModelBreakdown[]
  services?: UsageServiceBreakdown[]
}

export function buildOpenCodeSpend(input: BuildOpenCodeSpendInput): UsageMetrics {
  const rawDaily = [...(input.daily ?? [])].sort((a, b) => a.startTime - b.startTime)
  const endDay = Math.floor(input.endTime / DAY_SECONDS) * DAY_SECONDS
  const startDay = endDay - (input.rangeDays - 1) * DAY_SECONDS
  const byDay = new Map(
    rawDaily.map((point) => [Math.floor(point.startTime / DAY_SECONDS) * DAY_SECONDS, point])
  )
  const daily =
    rawDaily.length > 0
      ? Array.from({ length: input.rangeDays }, (_, index) => {
          const start = startDay + index * DAY_SECONDS
          return (
            byDay.get(start) ?? {
              startTime: start,
              endTime: start + DAY_SECONDS,
              amount: 0
            }
          )
        })
      : []
  const models = [...(input.models ?? [])].sort((a, b) => {
    const costA = a.estimatedCost ?? -1
    const costB = b.estimatedCost ?? -1
    if (costB !== costA) return costB - costA
    return b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)
  })
  const dailyCost = daily.reduce((total, point) => total + point.amount, 0)
  const modelRequests = models.reduce((total, model) => total + model.requests, 0)
  const totalCost = input.summary?.totalCost ?? dailyCost
  const totalRequests = input.summary?.totalRequests ?? modelRequests
  const totalInputTokens =
    input.summary?.totalInputTokens ??
    models.reduce((total, model) => total + model.inputTokens, 0)
  const totalOutputTokens =
    input.summary?.totalOutputTokens ??
    models.reduce((total, model) => total + model.outputTokens, 0)
  const totalCachedInputTokens =
    input.summary?.totalCachedInputTokens ??
    models.reduce((total, model) => total + model.cachedInputTokens, 0)

  const byService: UsageServiceBreakdown[] = input.services ?? []

  return {
    rangeDays: input.rangeDays,
    startTime: input.startTime,
    endTime: input.endTime,
    fetchedAt: input.now ?? Date.now(),
    currency: 'usd',
    totalCost,
    totalRequests,
    totalInputTokens,
    totalOutputTokens,
    totalCachedInputTokens,
    daily:
      daily.length > 0
        ? daily
        : [{ startTime: input.startTime, endTime: input.endTime, amount: totalCost }],
    byService,
    byModel: models
  }
}
