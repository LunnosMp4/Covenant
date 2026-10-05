import OpenAI from 'openai'
import { ProxyAgent } from 'undici'
import { resolveOpenAIProxyUrl } from '../proxy'

export function createOpenAIClient(apiKey: string, proxyUrl?: string): OpenAI {
  const resolvedProxyUrl = resolveOpenAIProxyUrl(proxyUrl)
  const openAIProxyAgent = resolvedProxyUrl ? new ProxyAgent(resolvedProxyUrl) : undefined

  return new OpenAI({
    apiKey,
    fetchOptions: openAIProxyAgent
      ? {
          dispatcher: openAIProxyAgent
        }
      : undefined
  })
}
