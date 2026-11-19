import type { Dispatcher } from 'undici'

type UndiciModule = typeof import('undici')

/**
 * `undici` is only needed when a request actually goes through a proxy (or a
 * custom TLS agent). Loading it eagerly put its HTTP stack on the startup path
 * for every user, including the majority who never configure a proxy, so the
 * module is resolved on first use and cached for the process lifetime.
 */
let undiciPromise: Promise<UndiciModule> | null = null

function loadUndici(): Promise<UndiciModule> {
  if (!undiciPromise) {
    undiciPromise = import('undici').catch((error) => {
      // Don't cache a failed load; a later request can retry.
      undiciPromise = null
      throw error
    })
  }
  return undiciPromise
}

/**
 * Dispatchers own a connection pool each. Creating one per request kept every
 * pool alive for the process lifetime (one socket pool + fd set per AI call,
 * usage refresh and search), so the same configurations are shared instead.
 * The key set is tiny in practice (the configured proxy URL, plus the fixed
 * loopback agent options), and the cache is bounded defensively anyway.
 */
const MAX_CACHED_DISPATCHERS = 8

const proxyDispatchers = new Map<string, Dispatcher>()
const agentDispatchers = new Map<string, Dispatcher>()

function remember(cache: Map<string, Dispatcher>, key: string, dispatcher: Dispatcher): Dispatcher {
  cache.set(key, dispatcher)
  if (cache.size > MAX_CACHED_DISPATCHERS) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) {
      const evicted = cache.get(oldestKey)
      cache.delete(oldestKey)
      void Promise.resolve(evicted?.close()).catch(() => undefined)
    }
  }
  return dispatcher
}

/** Returns the shared proxy dispatcher for `proxyUrl`, loading `undici` once. */
export async function createProxyDispatcher(
  proxyUrl: string | undefined
): Promise<Dispatcher | undefined> {
  if (!proxyUrl) return undefined
  const cached = proxyDispatchers.get(proxyUrl)
  if (cached) return cached
  const { ProxyAgent } = await loadUndici()
  return remember(proxyDispatchers, proxyUrl, new ProxyAgent(proxyUrl))
}

/** Returns the shared plain agent (loopback / self-signed SearXNG endpoints). */
export async function createAgentDispatcher(
  options: ConstructorParameters<UndiciModule['Agent']>[0]
): Promise<Dispatcher> {
  const key = JSON.stringify(options)
  const cached = agentDispatchers.get(key)
  if (cached) return cached
  const { Agent } = await loadUndici()
  return remember(agentDispatchers, key, new Agent(options))
}

/** Test seam: drops every cached dispatcher. */
export async function disposeProxyDispatchers(): Promise<void> {
  const all = [...proxyDispatchers.values(), ...agentDispatchers.values()]
  proxyDispatchers.clear()
  agentDispatchers.clear()
  await Promise.allSettled(all.map((dispatcher) => dispatcher.close()))
}
