import OpenAI from 'openai'
import { ProxyAgent } from 'undici'
import { resolveOpenAIProxyUrl } from '../proxy'

export interface OpenAIClientOptions {
  baseURL?: string
  defaultHeaders?: Record<string, string>
  timeout?: number
  maxRetries?: number
}

export function createOpenAIClient(
  apiKey: string,
  proxyUrl?: string,
  options: OpenAIClientOptions = {}
): OpenAI {
  const resolvedProxyUrl = resolveOpenAIProxyUrl(proxyUrl)
  const openAIProxyAgent = resolvedProxyUrl ? new ProxyAgent(resolvedProxyUrl) : undefined

  return new OpenAI({
    apiKey,
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    ...(options.defaultHeaders ? { defaultHeaders: options.defaultHeaders } : {}),
    ...(typeof options.timeout === 'number' ? { timeout: options.timeout } : {}),
    ...(typeof options.maxRetries === 'number' ? { maxRetries: options.maxRetries } : {}),
    fetchOptions: openAIProxyAgent
      ? {
          dispatcher: openAIProxyAgent
        }
      : undefined
  })
}
