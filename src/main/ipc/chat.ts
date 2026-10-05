import { randomUUID } from 'crypto'
import { ipcMain } from 'electron'
import { DEFAULT_CHAT_MODEL, DEFAULT_ENABLE_WEB_SEARCH, modelSupportsWebSearch } from '../../shared/config'
import { readConfig } from '../config/configStore'
import { getActiveMcpToolRegistry } from '../mcp/registry'
import { createOpenAIClient } from '../openai/client'
import { completeChatWithMcp } from '../openai/completion'
import { buildResponseParams, buildResponsesInput, sanitizeMessages } from '../openai/messages'
import { runStreamingChat } from '../openai/streaming'
import { buildOpenAIToolDefinitions } from '../services/mcpClient'

const activeChatStreams = new Map<string, AbortController>()

export function registerChatIpc(): void {
  ipcMain.on('covenant:chat-cancel', (_event, streamId: string) => {
    if (typeof streamId !== 'string') return
    activeChatStreams.get(streamId)?.abort()
  })

  ipcMain.handle('covenant:chat-stream', async (event, rawMessages: unknown) => {
    const sanitized = Array.isArray(rawMessages) ? sanitizeMessages(rawMessages) : []

    if (sanitized.length === 0) {
      throw new Error('Prompt cannot be empty.')
    }

    const storedConfig = readConfig()
    const apiKey = storedConfig.apiKey || process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OpenAI API key is missing. Add it in Settings > General or set OPENAI_API_KEY.')
    }

    const client = createOpenAIClient(apiKey, storedConfig.proxyUrl)

    const streamId = randomUUID()
    const sender = event.sender
    const sendStreamEvent = (payload: { id: string } & Record<string, unknown>): void => {
      if (sender.isDestroyed()) return
      sender.send('covenant:chat-stream-event', payload)
    }

    const toolRegistry = getActiveMcpToolRegistry()
    const chatModel = storedConfig.chatModel || DEFAULT_CHAT_MODEL
    const enableWebSearch = storedConfig.enableWebSearch ?? DEFAULT_ENABLE_WEB_SEARCH
    const doesWebSearch = enableWebSearch && modelSupportsWebSearch(chatModel)

    const tools: Array<Record<string, unknown>> = []
    if (doesWebSearch) {
      tools.push({ type: 'web_search' })
    }
    tools.push(...buildOpenAIToolDefinitions(toolRegistry))

    const input = buildResponsesInput(sanitized)
    const params = buildResponseParams(storedConfig, chatModel)

    const controller = new AbortController()
    activeChatStreams.set(streamId, controller)

    void runStreamingChat(
      { client, streamId, sender, model: chatModel, sendStreamEvent, signal: controller.signal },
      input,
      tools,
      params,
      toolRegistry
    ).finally(() => {
      activeChatStreams.delete(streamId)
    })

    return { id: streamId }
  })

  ipcMain.handle('covenant:chat', async (_event, rawMessages: unknown) => {
    const sanitized = Array.isArray(rawMessages) ? sanitizeMessages(rawMessages) : []

    if (sanitized.length === 0) {
      throw new Error('Prompt cannot be empty.')
    }

    const storedConfig = readConfig()
    const apiKey = storedConfig.apiKey || process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OpenAI API key is missing. Add it in Settings > General or set OPENAI_API_KEY.')
    }

    const client = createOpenAIClient(apiKey, storedConfig.proxyUrl)
    const toolRegistry = getActiveMcpToolRegistry()
    const chatModel = storedConfig.chatModel || DEFAULT_CHAT_MODEL
    if (toolRegistry.length > 0) {
      return completeChatWithMcp(client, sanitized, toolRegistry, chatModel)
    }

    const input = buildResponsesInput(sanitized)
    const params = buildResponseParams(storedConfig, chatModel)

    const response = await client.responses.create({
      model: chatModel,
      input: input as unknown[],
      ...(params as Record<string, unknown>)
    } as any)
    return (response as any).output_text?.trim() || 'No response from model.'
  })

  ipcMain.handle('voice:transcribe', async (_event, audioBuffer: ArrayBuffer) => {
    const storedConfig = readConfig()
    const apiKey = storedConfig.apiKey || process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OpenAI API key is missing. Add it in Settings > General or set OPENAI_API_KEY.')
    }

    const client = createOpenAIClient(apiKey, storedConfig.proxyUrl)

    const file = new File([Buffer.from(audioBuffer)], 'audio.webm', { type: 'audio/webm' })
    const transcription = await client.audio.transcriptions.create({
      model: 'gpt-4o-mini-transcribe',
      file,
      response_format: 'text'
    })

    return typeof transcription === 'string' ? transcription : (transcription as unknown as { text: string }).text
  })
}
