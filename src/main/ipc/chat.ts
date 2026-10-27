import { randomUUID } from 'crypto'
import { ipcMain, type WebContents } from 'electron'
import { DEFAULT_CHAT_MODEL, DEFAULT_ENABLE_WEB_SEARCH, modelSupportsWebSearch } from '../../shared/config'
import {
  buildTerminalToolDefinitions,
  TERMINAL_TOOL_INSTRUCTIONS
} from '../../shared/terminal/tools'
import { readConfig } from '../config/configStore'
import { getActiveMcpToolRegistry } from '../mcp/registry'
import { createOpenAIClient } from '../openai/client'
import { completeChatWithMcp } from '../openai/completion'
import { buildResponseParams, buildResponsesInput, sanitizeMessages } from '../openai/messages'
import { runStreamingChat } from '../openai/streaming'
import { buildOpenAIToolDefinitions } from '../services/mcpClient'
import { terminalManager } from '../terminalManager'
import { createTerminalToolHandlers } from '../terminal/tools'
import { setVoiceRecordingActive } from '../windows'

const activeChatStreams = new Map<string, AbortController>()

/**
 * Streaming deltas arrive per token. Forwarding one IPC message per token makes
 * the renderer commit once per token, which re-renders the whole conversation.
 * Content/reasoning deltas are therefore coalesced into a single message per
 * flush window; every other event type flushes pending deltas first so ordering
 * is identical to the unbatched stream.
 */
const STREAM_DELTA_FLUSH_MS = 50

interface StreamSender {
  send: (payload: { id: string } & Record<string, unknown>) => void
  flush: () => void
}

function createStreamSender(sender: WebContents, streamId: string): StreamSender {
  let pendingContent = ''
  const pendingReasoning = new Map<string, string>()
  let flushTimer: NodeJS.Timeout | null = null

  const send = (payload: { id: string } & Record<string, unknown>): void => {
    if (sender.isDestroyed()) return
    sender.send('covenant:chat-stream-event', payload)
  }

  const flush = (): void => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }

    if (pendingContent) {
      const delta = pendingContent
      pendingContent = ''
      send({ id: streamId, type: 'content', delta })
    }

    if (pendingReasoning.size > 0) {
      const pending = [...pendingReasoning.entries()]
      pendingReasoning.clear()
      for (const [itemId, delta] of pending) {
        send({ id: streamId, type: 'reasoning-delta', itemId, delta })
      }
    }
  }

  const scheduleFlush = (): void => {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, STREAM_DELTA_FLUSH_MS)
    flushTimer.unref?.()
  }

  const sendEvent = (payload: { id: string } & Record<string, unknown>): void => {
    if (payload.type === 'content' && typeof payload.delta === 'string') {
      pendingContent += payload.delta
      scheduleFlush()
      return
    }

    if (
      payload.type === 'reasoning-delta' &&
      typeof payload.delta === 'string' &&
      typeof payload.itemId === 'string'
    ) {
      const itemId = payload.itemId
      pendingReasoning.set(itemId, (pendingReasoning.get(itemId) ?? '') + payload.delta)
      scheduleFlush()
      return
    }

    flush()
    send(payload)
  }

  return { send: sendEvent, flush }
}

export function registerChatIpc(): void {
  ipcMain.on('covenant:chat-cancel', (_event, streamId: string) => {
    if (typeof streamId !== 'string') return
    activeChatStreams.get(streamId)?.abort()
  })

  ipcMain.handle('covenant:chat-stream', async (event, rawPayload: unknown) => {
    const payload = rawPayload as { messages?: unknown; terminalSessionId?: unknown } | undefined
    const rawMessages = Array.isArray(rawPayload) ? rawPayload : payload?.messages
    const terminalSessionId =
      !Array.isArray(rawPayload) &&
      typeof payload?.terminalSessionId === 'string' &&
      payload.terminalSessionId.length > 0
        ? payload.terminalSessionId
        : undefined

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
    const streamSender = createStreamSender(sender, streamId)
    const sendStreamEvent = streamSender.send

    const toolRegistry = getActiveMcpToolRegistry()
    const chatModel = storedConfig.chatModel || DEFAULT_CHAT_MODEL
    const enableWebSearch = storedConfig.enableWebSearch ?? DEFAULT_ENABLE_WEB_SEARCH
    const doesWebSearch = enableWebSearch && modelSupportsWebSearch(chatModel)
    const terminalSession =
      terminalSessionId && terminalManager.hasSession(terminalSessionId)
        ? terminalSessionId
        : undefined

    const tools: Array<Record<string, unknown>> = []
    if (doesWebSearch) {
      tools.push({ type: 'web_search' })
    }
    tools.push(...buildOpenAIToolDefinitions(toolRegistry))
    if (terminalSession) {
      tools.push(...(buildTerminalToolDefinitions() as unknown as Array<Record<string, unknown>>))
    }

    const input = buildResponsesInput(sanitized)
    const params = buildResponseParams(storedConfig, chatModel)

    if (terminalSession) {
      const base = typeof params.instructions === 'string' ? params.instructions : ''
      params.instructions = `${base}\n\n${TERMINAL_TOOL_INSTRUCTIONS}`.trim()
    }

    const builtinTools = terminalSession ? createTerminalToolHandlers(terminalSession) : []

    const controller = new AbortController()
    activeChatStreams.set(streamId, controller)

    void runStreamingChat(
      { client, streamId, sender, model: chatModel, sendStreamEvent, signal: controller.signal },
      input,
      tools,
      params,
      toolRegistry,
      builtinTools
    ).finally(() => {
      streamSender.flush()
      activeChatStreams.delete(streamId)
    })

    return { id: streamId }
  })

  ipcMain.handle('covenant:chat', async (_event, rawPayload: unknown) => {
    const rawMessages = Array.isArray(rawPayload)
      ? rawPayload
      : (rawPayload as { messages?: unknown } | undefined)?.messages
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

  ipcMain.on('voice:recording-active', (_event, active: unknown) => {
    setVoiceRecordingActive(active === true)
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
