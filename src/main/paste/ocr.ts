import OpenAI from 'openai'
import { ProxyAgent } from 'undici'

export interface OpenAIConfig {
  apiKey: string
  proxyUrl?: string
}

const OCR_MODEL = 'gpt-6-luna'
const OCR_PROMPT =
  'Extract all readable text from this image. Return only the extracted text, preserving line breaks, with no commentary. If there is no text, return an empty string.'

/**
 * Optional OCR for copied images, reusing the existing OpenAI dependency and
 * API key. Runs only when explicitly enabled and an API key is configured.
 */
export class OcrExtractor {
  private client: OpenAI | null = null
  private clientKey = ''

  constructor(private readonly getConfig: () => OpenAIConfig) {}

  private getClient(apiKey: string, proxyUrl?: string): OpenAI {
    const key = `${apiKey}\u0000${proxyUrl ?? ''}`
    if (this.client && this.clientKey === key) return this.client

    this.client = new OpenAI({
      apiKey,
      timeout: 20_000,
      maxRetries: 1,
      fetchOptions: proxyUrl ? { dispatcher: new ProxyAgent(proxyUrl) } : undefined
    })
    this.clientKey = key
    return this.client
  }

  async extractText(imageBuffer: Buffer, mime: string): Promise<string | null> {
    const { apiKey, proxyUrl } = this.getConfig()
    if (!apiKey) return null
    if (!imageBuffer || imageBuffer.length === 0) return null

    try {
      const client = this.getClient(apiKey, proxyUrl)
      const dataUrl = `data:${mime || 'image/png'};base64,${imageBuffer.toString('base64')}`
      const response = await client.responses.create({
        model: OCR_MODEL,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: OCR_PROMPT },
              { type: 'input_image', image_url: dataUrl }
            ]
          }
        ]
      } as never)

      const output = (response as unknown as { output_text?: unknown }).output_text
      if (typeof output !== 'string') return null
      const trimmed = output.trim()
      return trimmed.length > 0 ? trimmed : null
    } catch {
      return null
    }
  }
}
