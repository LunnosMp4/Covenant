import { app } from 'electron'
import type { AppConfig } from '../../shared/config'
import { createProxyDispatcher } from '../services/proxyDispatcher'
import { normalizeUsageRangeDays } from '../../shared/system/usage'
import {
  buildOpenCodeSpend,
  mergeGoUsage,
  parseCostByDayResponse,
  parseGoStatusResponse,
  parseGoUsageResponse,
  parseModelsResponse,
  parseUsageSummary,
  type OpenCodeUsageError,
  type OpenCodeUsageErrorCode,
  type OpenCodeUsageResult,
  type OpenCodeUsageSnapshot
} from '../../shared/ai/opencodeUsage'
import { getGoApiKey } from '../code/codeCredentials'
import { resolveOpenAIProxyUrl } from '../proxy'
import { log } from '../logger'

const ORIGIN = 'https://opencode.ai'
const TIMEOUT_MS = 15_000

class OpenCodeUsageRequestError extends Error {
  readonly code: OpenCodeUsageErrorCode

  constructor(code: OpenCodeUsageErrorCode, message: string) {
    super(message)
    this.name = 'OpenCodeUsageRequestError'
    this.code = code
  }
}

function mapStatus(status: number): OpenCodeUsageErrorCode {
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 429) return 'RATE_LIMITED'
  return 'UNKNOWN'
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return `Request timed out after ${TIMEOUT_MS / 1000}s.`
    return error.message
  }
  return String(error)
}

async function requestJson(path: string, config: AppConfig, apiKey: string): Promise<unknown> {
  const proxyUrl = resolveOpenAIProxyUrl(config.proxyUrl)
  const dispatcher = await createProxyDispatcher(proxyUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${ORIGIN}${path}`, {
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
      let detail = ''
      try {
        const text = await response.text()
        detail = text.trim().slice(0, 200)
      } catch {
        // Ignore body read failures.
      }
      throw new OpenCodeUsageRequestError(
        mapStatus(response.status),
        `${path} returned ${response.status}${detail ? `: ${detail}` : ''}`
      )
    }

    return await response.json()
  } catch (error) {
    if (error instanceof OpenCodeUsageRequestError) throw error
    throw new OpenCodeUsageRequestError(
      'NETWORK',
      `${path}: ${errorMessage(error)}`
    )
  } finally {
    clearTimeout(timeout)
  }
}

interface Fetched {
  data?: unknown
  error?: OpenCodeUsageError
}

async function tryFetch(
  source: string,
  path: string,
  config: AppConfig,
  apiKey: string,
  errors: OpenCodeUsageError[]
): Promise<Fetched> {
  try {
    return { data: await requestJson(path, config, apiKey) }
  } catch (error) {
    const code = error instanceof OpenCodeUsageRequestError ? error.code : 'UNKNOWN'
    const message = errorMessage(error)
    errors.push({ source, code, message })
    log.warn(`OpenCode usage request failed (${source})`, error)
    return { error: errors[errors.length - 1] }
  }
}

function pickPrimaryError(errors: OpenCodeUsageError[]): OpenCodeUsageError {
  return (
    errors.find((error) => error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN') ??
    errors.find((error) => error.code === 'NETWORK') ??
    errors[0] ?? {
      source: 'opencode',
      code: 'UNKNOWN',
      message: 'Unable to load OpenCode usage.'
    }
  )
}

/**
 * Read the real OpenCode Console data with the OpenCode API key.
 *
 * These routes are intentionally kept in one place because they are not
 * covered by the public inference API contract. Each request degrades
 * independently: a key without `Usage: Read` still gets the Go meters and the
 * prepaid balance.
 */
export async function fetchOpenCodeUsage(
  config: AppConfig,
  requestedRangeDays: unknown
): Promise<OpenCodeUsageResult> {
  const apiKey = getGoApiKey()
  if (!apiKey) {
    return {
      ok: false,
      code: 'KEY_MISSING',
      message: 'Add your OpenCode API key in AI → Providers & Keys.'
    }
  }

  const rangeDays = normalizeUsageRangeDays(requestedRangeDays)
  const now = Date.now()
  const endTime = Math.floor(now / 1000)
  const startTime = endTime - rangeDays * 24 * 60 * 60
  const errors: OpenCodeUsageError[] = []

  const [goUsage, goStatus, summary, costByDay, models] = await Promise.all([
    tryFetch('go usage', '/inference/go/v1/usage', config, apiKey, errors),
    tryFetch('go status', '/console/api/go/status', config, apiKey, errors),
    tryFetch('usage summary', `/console/api/usage/summary?range=${rangeDays}d`, config, apiKey, errors),
    tryFetch('usage cost by day', `/console/api/usage/cost-by-day?range=${rangeDays}d`, config, apiKey, errors),
    tryFetch('usage models', `/console/api/usage/models?range=${rangeDays}d`, config, apiKey, errors)
  ])

  const snapshot: OpenCodeUsageSnapshot = {
    fetchedAt: now,
    rangeDays,
    errors
  }

  // Some accounts still expose the Go meters under the legacy /zen prefix.
  let goUsageData = goUsage.data
  if (goUsageData === undefined && goUsage.error?.code === 'NOT_FOUND') {
    const legacy = await tryFetch(
      'go usage (zen)',
      '/zen/go/v1/usage',
      config,
      apiKey,
      errors
    )
    goUsageData = legacy.data
  }

  const go = mergeGoUsage(
    goStatus.data === undefined ? undefined : parseGoStatusResponse(goStatus.data),
    goUsageData === undefined ? undefined : parseGoUsageResponse(goUsageData)
  )
  if (go) snapshot.go = go

  const parsedSummary =
    summary.data === undefined ? undefined : parseUsageSummary(summary.data)
  const parsedDaily =
    costByDay.data === undefined ? [] : parseCostByDayResponse(costByDay.data)
  const parsedModels =
    models.data === undefined ? [] : parseModelsResponse(models.data)

  if (parsedSummary || parsedDaily.length > 0 || parsedModels.length > 0) {
    snapshot.spend = buildOpenCodeSpend({
      rangeDays,
      startTime,
      endTime,
      now,
      summary: parsedSummary,
      daily: parsedDaily,
      models: parsedModels,
      services: parsedSummary?.services
    })
  }

  if (snapshot.go || snapshot.spend) {
    return { ok: true, snapshot }
  }

  const primary = pickPrimaryError(errors)
  return {
    ok: false,
    code: primary.code,
    message: primary.message
  }
}
