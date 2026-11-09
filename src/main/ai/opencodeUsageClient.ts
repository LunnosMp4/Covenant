import { app } from 'electron'
import { ProxyAgent } from 'undici'
import type {
  UsageCostPoint,
  UsageMetrics,
  UsageModelBreakdown,
  UsageServiceBreakdown
} from '../../shared/system/usage'
import type { AppConfig } from '../../shared/config'
import { getGoApiKey } from '../code/codeCredentials'
import { resolveOpenAIProxyUrl } from '../proxy'

const CONSOLE_API = 'https://opencode.ai/console/api'
const MICRO_CENTS_PER_USD = 100_000_000

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function microCentsToUsd(value: unknown): number {
  return num(value) / MICRO_CENTS_PER_USD
}

function dateToSeconds(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value)
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000)
  }
  return undefined
}

async function consoleGet(path: string, config: AppConfig): Promise<unknown> {
  const apiKey = getGoApiKey()
  if (!apiKey) throw new Error('OpenCode API key is missing.')

  const proxyUrl = resolveOpenAIProxyUrl(config.proxyUrl)
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(`${CONSOLE_API}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'User-Agent': `Covenant/${app.getVersion()}`
      },
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {})
    } as RequestInit)

    if (!response.ok) {
      throw new Error(`OpenCode Console returned ${response.status}.`)
    }
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function mapDaily(value: unknown): UsageCostPoint[] {
  return asArray(value)
    .map((item) => {
      const entry = asRecord(item)
      const start = dateToSeconds(entry.date ?? entry.startTime ?? entry.start_time)
      if (start === undefined) return null
      return {
        startTime: start,
        endTime: start + 24 * 60 * 60,
        amount: microCentsToUsd(entry.totalCostMicroCents ?? entry.costMicroCents ?? entry.amount)
      }
    })
    .filter((item): item is UsageCostPoint => item !== null)
    .sort((a, b) => a.startTime - b.startTime)
}

function mapModels(value: unknown): UsageModelBreakdown[] {
  return asArray(value)
    .map((item): UsageModelBreakdown | null => {
      const entry = asRecord(item)
      const model = typeof entry.model === 'string' ? entry.model : ''
      if (!model) return null
      return {
        model,
        requests: num(entry.totalRequests ?? entry.requests),
        inputTokens: num(entry.totalInputTokens ?? entry.inputTokens),
        cachedInputTokens: num(entry.totalCacheReadTokens ?? entry.cachedInputTokens),
        outputTokens: num(entry.totalOutputTokens ?? entry.outputTokens),
        estimatedCost: microCentsToUsd(entry.totalCostMicroCents),
        allowance: microCentsToUsd(entry.allowanceMicroCents ?? entry.allowance)
      }
    })
    .filter((item): item is UsageModelBreakdown => item !== null)
}

function mapServices(value: unknown): UsageServiceBreakdown[] {
  return asArray(value)
    .map((item) => {
      const entry = asRecord(item)
      const label = typeof entry.service === 'string' ? entry.service : 'Other'
      return {
        label,
        amount: microCentsToUsd(entry.totalCostMicroCents),
        quantity: num(entry.totalRequests) || undefined
      }
    })
    .filter((item) => item.amount > 0 || item.quantity)
}

export async function fetchOpenCodeUsage(
  config: AppConfig,
  rangeDays: number
): Promise<UsageMetrics> {
  const payload = asRecord(await consoleGet('/activity/usage?view=personal', config))
  const root = asRecord(payload.data ?? payload)
  const overview = asRecord(root.current ?? root.overview ?? root)
  const daily = mapDaily(overview.daily ?? root.daily)
  const models = mapModels(overview.models ?? root.models)
  const services = mapServices(overview.services ?? root.services)

  let goModels: UsageModelBreakdown[] = []
  try {
    const goPayload = asRecord(await consoleGet('/activity/go', config))
    const goRoot = asRecord(goPayload.data ?? goPayload)
    goModels = mapModels(goRoot.models ?? goRoot.usage ?? goRoot)
  } catch {
    // Go status is optional; personal usage still works without it.
  }

  if (goModels.length > 0) {
    const byModel = new Map(models.map((model) => [model.model, model]))
    for (const goModel of goModels) {
      const existing = byModel.get(goModel.model)
      if (existing) {
        existing.allowance = goModel.allowance ?? existing.allowance
      } else {
        byModel.set(goModel.model, goModel)
      }
    }
    models.splice(0, models.length, ...byModel.values())
  }

  const totalCost = microCentsToUsd(overview.totalCostMicroCents ?? root.totalCostMicroCents)
  const totalRequests = num(overview.totalRequests ?? root.totalRequests)
  const totalInputTokens = num(overview.totalInputTokens ?? root.totalInputTokens)
  const totalOutputTokens = num(overview.totalOutputTokens ?? root.totalOutputTokens)
  const allowance = microCentsToUsd(overview.allowanceMicroCents ?? root.allowanceMicroCents)
  const now = Math.floor(Date.now() / 1000)
  const startTime = daily[0]?.startTime ?? now - rangeDays * 24 * 60 * 60

  return {
    rangeDays,
    startTime,
    endTime: now,
    fetchedAt: Date.now(),
    currency: 'usd',
    totalCost,
    totalRequests,
    totalInputTokens,
    totalOutputTokens,
    daily:
      daily.length > 0
        ? daily
        : [{ startTime, endTime: now, amount: totalCost }],
    byService: services,
    byModel: models.sort((a, b) => (b.estimatedCost ?? 0) - (a.estimatedCost ?? 0)),
    allowance: allowance || undefined
  }
}
