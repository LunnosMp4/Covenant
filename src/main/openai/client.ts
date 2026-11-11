import type OpenAI from 'openai'
import { resolveOpenAIProxyUrl } from '../proxy'
import { createProxyDispatcher } from '../services/proxyDispatcher'
import { loadOpenAISdk } from './sdk'

export interface OpenAIClientOptions {
  baseURL?: string
  defaultHeaders?: Record<string, string>
  timeout?: number
  maxRetries?: number
}

export async function createOpenAIClient(
  apiKey: string,
  proxyUrl?: string,
  options: OpenAIClientOptions = {}
): Promise<OpenAI> {
  // Both the SDK and the proxy dispatcher are resolved lazily; on a direct
  // connection this only pays for the SDK.
  const [OpenAI, openAIProxyAgent] = await Promise.all([
    loadOpenAISdk(),
    createProxyDispatcher(resolveOpenAIProxyUrl(proxyUrl))
  ])

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
