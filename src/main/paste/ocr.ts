import type { AppConfig } from '../../shared/config'
import { resolveChatProvider } from '../ai/provider'
import { recordAiUsage } from '../ai/usageLedger'

const OCR_MODEL = 'gpt-6-luna'
const OCR_PROMPT =
  'Extract all readable text from this image. Return only the extracted text, preserving line breaks, with no commentary. If there is no text, return an empty string.'

/**
 * Optional OCR for copied images. Uses the active AI provider (OpenAI or
 * OpenCode) and a vision-capable model. Runs only when explicitly enabled.
 */
export class OcrExtractor {
  constructor(private readonly getConfig: () => AppConfig) {}

  async extractText(imageBuffer: Buffer, mime: string): Promise<string | null> {
    if (!imageBuffer || imageBuffer.length === 0) return null

    try {
      const config = this.getConfig()
      const provider = resolveChatProvider(config, { model: OCR_MODEL })
      const dataUrl = `data:${mime || 'image/png'};base64,${imageBuffer.toString('base64')}`
      const response = await provider.client.responses.create({
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

      const usage = (response as unknown as { usage?: Record<string, unknown> }).usage
      if (usage) {
        recordAiUsage({
          provider: provider.provider,
          model: OCR_MODEL,
          kind: 'ocr',
          usage: {
            promptTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined,
            completionTokens:
              typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined,
            totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined
          }
        })
      }

      const output = (response as unknown as { output_text?: unknown }).output_text
      if (typeof output !== 'string') return null
      const trimmed = output.trim()
      return trimmed.length > 0 ? trimmed : null
    } catch {
      return null
    }
  }
}
