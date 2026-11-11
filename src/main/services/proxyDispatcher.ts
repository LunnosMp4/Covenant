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

/** Builds a proxy dispatcher, loading `undici` only when a proxy is set. */
export async function createProxyDispatcher(
  proxyUrl: string | undefined
): Promise<Dispatcher | undefined> {
  if (!proxyUrl) return undefined
  const { ProxyAgent } = await loadUndici()
  return new ProxyAgent(proxyUrl)
}

/** Builds a plain agent (used for loopback / self-signed SearXNG endpoints). */
export async function createAgentDispatcher(
  options: ConstructorParameters<UndiciModule['Agent']>[0]
): Promise<Dispatcher> {
  const { Agent } = await loadUndici()
  return new Agent(options)
}
