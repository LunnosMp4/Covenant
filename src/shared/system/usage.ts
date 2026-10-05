// Types and helpers for the OpenAI organization usage & cost metrics surfaced
// in Settings > Usage & Cost. The Admin API is queried from the main process;
// these shapes are shared with the renderer for rendering.

export const USAGE_RANGE_OPTIONS = [7, 30, 90] as const

export type UsageRangeDays = (typeof USAGE_RANGE_OPTIONS)[number]

export const DEFAULT_USAGE_RANGE_DAYS: UsageRangeDays = 30

export function normalizeUsageRangeDays(value: unknown): UsageRangeDays {
  const numeric = typeof value === 'number' ? value : Number(value)
  return (USAGE_RANGE_OPTIONS as readonly number[]).includes(numeric)
    ? (numeric as UsageRangeDays)
    : DEFAULT_USAGE_RANGE_DAYS
}

export interface ModelPricing {
  inputPerMillion: number
  cachedInputPerMillion: number
  cacheWritePerMillion: number
  outputPerMillion: number
}

export const CHAT_MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-6-luna': {
    inputPerMillion: 0.1,
    cachedInputPerMillion: 0.01,
    cacheWritePerMillion: 0.125,
    outputPerMillion: 0.5
  },
  'gpt-6.1-sol': {
    inputPerMillion: 2.0,
    cachedInputPerMillion: 0.1,
    cacheWritePerMillion: 2.5,
    outputPerMillion: 10
  }
}

const DATED_MODEL_SUFFIX = /-\d{4}-\d{2}-\d{2}$/

/**
 * Resolve pricing for a model id returned by the Usage API. OpenAI often
 * returns dated snapshot ids (e.g. `gpt-4o-2024-08-06`); fall back to the
 * undated family name and finally to a longest-prefix match.
 */
export function resolveModelPricing(modelId: string | null | undefined): ModelPricing | undefined {
  if (!modelId) return undefined
  const trimmed = modelId.trim()
  if (!trimmed) return undefined

  const exact = CHAT_MODEL_PRICING[trimmed]
  if (exact) return exact

  const undated = trimmed.replace(DATED_MODEL_SUFFIX, '')
  if (CHAT_MODEL_PRICING[undated]) return CHAT_MODEL_PRICING[undated]

  let bestMatch: string | undefined
  for (const key of Object.keys(CHAT_MODEL_PRICING)) {
    if (undated.startsWith(key) && (!bestMatch || key.length > bestMatch.length)) {
      bestMatch = key
    }
  }
  return bestMatch ? CHAT_MODEL_PRICING[bestMatch] : undefined
}

export type UsageErrorCode =
  | 'ADMIN_KEY_MISSING'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'UNKNOWN'

export class UsageApiError extends Error {
  readonly code: UsageErrorCode

  constructor(code: UsageErrorCode, message: string) {
    super(message)
    this.name = 'UsageApiError'
    this.code = code
  }
}

// ── Raw Admin API response shapes (subset used by the metrics page) ──

export interface OrganizationCostsResult {
  object: 'organization.costs.result'
  amount?: { value?: number; currency?: string }
  line_item?: string | null
  project_id?: string | null
  api_key_id?: string | null
  quantity?: number | null
}

export interface OrganizationCostsBucket {
  object: 'bucket'
  start_time: number
  end_time: number
  results: OrganizationCostsResult[]
}

export interface OrganizationCostsResponse {
  object: 'page'
  data: OrganizationCostsBucket[]
  has_more: boolean
  next_page?: string | null
}

export interface OrganizationUsageCompletionsResult {
  object: 'organization.usage.completions.result'
  input_tokens: number
  output_tokens: number
  num_model_requests: number
  input_cached_tokens?: number | null
  model?: string | null
}

export interface OrganizationUsageBucket {
  object: 'bucket'
  start_time: number
  end_time: number
  results: OrganizationUsageCompletionsResult[]
}

export interface OrganizationCompletionsUsageResponse {
  object: 'page'
  data: OrganizationUsageBucket[]
  has_more: boolean
  next_page?: string | null
}

// ── Aggregated metrics consumed by the renderer ──

export interface UsageCostPoint {
  startTime: number
  endTime: number
  amount: number
}

export interface UsageServiceBreakdown {
  label: string
  amount: number
  quantity?: number
}

export interface UsageModelBreakdown {
  model: string
  requests: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  estimatedCost: number | null
}

export interface UsageMetrics {
  rangeDays: number
  startTime: number
  endTime: number
  fetchedAt: number
  currency: string
  totalCost: number
  totalRequests: number
  totalInputTokens: number
  totalOutputTokens: number
  daily: UsageCostPoint[]
  byService: UsageServiceBreakdown[]
  byModel: UsageModelBreakdown[]
}

export type UsageMetricsResult =
  | { ok: true; metrics: UsageMetrics }
  | { ok: false; code: UsageErrorCode; message: string }

export interface UsageProject {
  id: string
  name: string
  status?: string
}

export interface OrganizationProjectsResponse {
  object: 'list'
  data: Array<{
    id: string
    object: 'organization.project'
    name: string
    created_at?: number
    status?: string
  }>
  has_more: boolean
  first_id?: string | null
  last_id?: string | null
}

export type UsageProjectsResult =
  | { ok: true; projects: UsageProject[] }
  | { ok: false; code: UsageErrorCode; message: string }

export interface BuildUsageMetricsInput {
  rangeDays: number
  startTime: number
  endTime: number
  costBuckets: OrganizationCostsBucket[]
  usageBuckets: OrganizationUsageBucket[]
  now?: number
}

function sumBucketCost(bucket: OrganizationCostsBucket): number {
  return bucket.results.reduce((total, result) => total + (result.amount?.value ?? 0), 0)
}

export function buildUsageMetrics(input: BuildUsageMetricsInput): UsageMetrics {
  const daily: UsageCostPoint[] = [...input.costBuckets]
    .sort((a, b) => a.start_time - b.start_time)
    .map((bucket) => ({
      startTime: bucket.start_time,
      endTime: bucket.end_time,
      amount: sumBucketCost(bucket)
    }))

  const serviceTotals = new Map<string, { amount: number; quantity: number }>()
  let currency = 'usd'

  for (const bucket of input.costBuckets) {
    for (const result of bucket.results) {
      const label = (result.line_item || 'Other').trim() || 'Other'
      const entry = serviceTotals.get(label) ?? { amount: 0, quantity: 0 }
      entry.amount += result.amount?.value ?? 0
      entry.quantity += result.quantity ?? 0
      serviceTotals.set(label, entry)
      if (result.amount?.currency) {
        currency = result.amount.currency
      }
    }
  }

  const byService: UsageServiceBreakdown[] = [...serviceTotals.entries()]
    .map(([label, value]) => ({ label, amount: value.amount, quantity: value.quantity || undefined }))
    .sort((a, b) => b.amount - a.amount)

  const modelTotals = new Map<
    string,
    { requests: number; inputTokens: number; cachedInputTokens: number; outputTokens: number }
  >()
  let totalRequests = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0

  for (const bucket of input.usageBuckets) {
    for (const result of bucket.results) {
      const model = (result.model || 'Unknown').trim() || 'Unknown'
      const entry =
        modelTotals.get(model) ?? { requests: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }
      const inputTokens = result.input_tokens ?? 0
      const cachedInputTokens = Math.min(result.input_cached_tokens ?? 0, inputTokens)
      entry.requests += result.num_model_requests ?? 0
      entry.inputTokens += inputTokens
      entry.cachedInputTokens += cachedInputTokens
      entry.outputTokens += result.output_tokens ?? 0
      modelTotals.set(model, entry)

      totalRequests += result.num_model_requests ?? 0
      totalInputTokens += inputTokens
      totalOutputTokens += result.output_tokens ?? 0
    }
  }

  const byModel: UsageModelBreakdown[] = [...modelTotals.entries()]
    .map(([model, value]) => {
      const pricing = resolveModelPricing(model)
      let estimatedCost: number | null = null
      if (pricing) {
        const uncachedInputTokens = Math.max(value.inputTokens - value.cachedInputTokens, 0)
        estimatedCost =
          (uncachedInputTokens * pricing.inputPerMillion +
            value.cachedInputTokens * pricing.cachedInputPerMillion +
            value.outputTokens * pricing.outputPerMillion) /
          1_000_000
      }
      return {
        model,
        requests: value.requests,
        inputTokens: value.inputTokens,
        cachedInputTokens: value.cachedInputTokens,
        outputTokens: value.outputTokens,
        estimatedCost
      }
    })
    .sort((a, b) => {
      const costA = a.estimatedCost ?? -1
      const costB = b.estimatedCost ?? -1
      if (costB !== costA) return costB - costA
      return b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)
    })

  const totalCost = daily.reduce((total, point) => total + point.amount, 0)

  return {
    rangeDays: input.rangeDays,
    startTime: input.startTime,
    endTime: input.endTime,
    fetchedAt: input.now ?? Date.now(),
    currency,
    totalCost,
    totalRequests,
    totalInputTokens,
    totalOutputTokens,
    daily,
    byService,
    byModel
  }
}
