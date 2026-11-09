import { app } from 'electron'
import { ProxyAgent, type Dispatcher } from 'undici'
import {
  OPENCODE_MODEL_OPTIONS,
  type AiModelOption,
  type NativeApiFamily,
  type OpenCodePlan
} from '../../shared/ai/models'
import { readConfig } from '../config/configStore'
import { getGoApiKey } from '../code/codeCredentials'
import { resolveOpenAIProxyUrl } from '../proxy'

const CACHE_TTL_MS = 60 * 60 * 1000
const FALLBACK_TIMEOUT_MS = 12_000

interface CacheEntry {
  key: string
  fetchedAt: number
  models: AiModelOption[]
}

let cache: CacheEntry | null = null

function modelListUrl(plan: OpenCodePlan): string {
  return plan === 'go'
    ? 'https://opencode.ai/inference/go/v1/models'
    : 'https://opencode.ai/inference/v1/models'
}

function pickNativeApi(raw: Record<string, unknown>): NativeApiFamily | undefined {
  const api = raw.api && typeof raw.api === 'object' ? (raw.api as Record<string, unknown>) : {}
  if (api.responses) return 'responses'
  if (api['chat-completions']) return 'chat-completions'
  if (api.messages) return 'messages'
  if (api['generate-content']) return 'generate-content'
  return undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function mapModel(raw: Record<string, unknown>): AiModelOption | null {
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!id) return null
  if (raw.type !== undefined && raw.type !== 'chat') return null

  const cost = raw.cost && typeof raw.cost === 'object' ? (raw.cost as Record<string, unknown>) : {}
  const textCost = cost.text && typeof cost.text === 'object' ? (cost.text as Record<string, unknown>) : {}
  const inputCost =
    textCost.input && typeof textCost.input === 'object'
      ? (textCost.input as Record<string, unknown>)
      : {}
  const outputCost =
    textCost.output && typeof textCost.output === 'object'
      ? (textCost.output as Record<string, unknown>)
      : {}
  const inputPrice = readNumber(inputCost.price) ?? 0
  const outputPrice = readNumber(outputCost.price) ?? 0
  // Hide free models: they may return 403 outside OpenCode and complicate
  // plan/limit reporting.
  if (inputPrice === 0 && outputPrice === 0) return null

  const capabilities =
    raw.capabilities && typeof raw.capabilities === 'object'
      ? (raw.capabilities as Record<string, unknown>)
      : {}
  const tools =
    capabilities.tools && typeof capabilities.tools === 'object'
      ? (capabilities.tools as Record<string, unknown>)
      : {}
  const reasoning =
    capabilities.reasoning && typeof capabilities.reasoning === 'object'
      ? (capabilities.reasoning as Record<string, unknown>)
      : {}
  const modalities =
    raw.modalities && typeof raw.modalities === 'object'
      ? (raw.modalities as Record<string, unknown>)
      : {}
  const inputModalities = Array.isArray(modalities.input)
    ? modalities.input.filter((item): item is string => typeof item === 'string')
    : []
  const limit = raw.limit && typeof raw.limit === 'object' ? (raw.limit as Record<string, unknown>) : {}

  const nativeApi = pickNativeApi(raw)
  const nativeResponses =
    raw.api && typeof raw.api === 'object'
      ? ((raw.api as Record<string, unknown>).responses as Record<string, unknown> | undefined)
      : undefined
  const nativeSearch =
    nativeResponses?.capabilities &&
    typeof nativeResponses.capabilities === 'object' &&
    (nativeResponses.capabilities as Record<string, unknown>).tools &&
    typeof (nativeResponses.capabilities as Record<string, unknown>).tools === 'object'
      ? ((nativeResponses.capabilities as Record<string, unknown>).tools as Record<string, unknown>).search === true
      : false

  const reasoningEfforts = Array.isArray(reasoning.effort)
    ? reasoning.effort.filter((item): item is string => typeof item === 'string')
    : []

  const cachedRead =
    inputCost.cache && typeof inputCost.cache === 'object'
      ? readNumber((inputCost.cache as Record<string, unknown>).read) ?? 0
      : 0

  return {
    provider: 'opencode',
    id,
    label: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
    maxContextTokens: readNumber(limit.context) ?? 1_000_000,
    supportsExtendedParams: reasoning.supported === true,
    supportsTools: tools.supported !== false,
    supportsReasoning: reasoning.supported === true,
    reasoningEfforts,
    supportsTemperature: capabilities.temperature !== false,
    supportsVision: inputModalities.some((item) => item.startsWith('image/')),
    webSearch: nativeSearch ? 'native' : tools.supported === false ? false : 'tool',
    nativeApi,
    pricing:
      inputPrice > 0 || outputPrice > 0
        ? {
            inputPerMillion: inputPrice,
            cachedInputPerMillion: cachedRead,
            outputPerMillion: outputPrice
          }
        : undefined
  }
}

function createDispatcher(proxyUrl?: string): Dispatcher | undefined {
  return proxyUrl ? new ProxyAgent(proxyUrl) : undefined
}

export async function listOpenCodeModels(
  plan: OpenCodePlan,
  options: { force?: boolean } = {}
): Promise<AiModelOption[]> {
  const key = plan
  if (!options.force && cache && cache.key === key && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.models
  }

  const config = readConfig()
  const apiKey = getGoApiKey()
  const proxyUrl = resolveOpenAIProxyUrl(config.proxyUrl)
  const dispatcher = createDispatcher(proxyUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FALLBACK_TIMEOUT_MS)

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': `Covenant/${app.getVersion()}`
    }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    const response = await fetch(modelListUrl(plan), {
      method: 'GET',
      headers,
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {})
    } as RequestInit)

    if (!response.ok) {
      throw new Error(`Model catalog returned ${response.status}`)
    }

    const payload = (await response.json()) as { data?: unknown }
    const rawModels = Array.isArray(payload.data) ? payload.data : []
    const models = rawModels
      .map((item) => (item && typeof item === 'object' ? mapModel(item as Record<string, unknown>) : null))
      .filter((item): item is AiModelOption => item !== null)
      .sort((a, b) => a.label.localeCompare(b.label))

    const result = models.length > 0 ? models : OPENCODE_MODEL_OPTIONS
    cache = { key, fetchedAt: Date.now(), models: result }
    return result
  } catch {
    // Offline / gateway error: keep the UI usable with the static fallback.
    return OPENCODE_MODEL_OPTIONS
  } finally {
    clearTimeout(timeout)
  }
}

export function clearOpenCodeModelCache(): void {
  cache = null
}

export function getCachedOpenCodeModel(modelId: string): AiModelOption | undefined {
  return cache?.models.find((model) => model.id === modelId)
}
