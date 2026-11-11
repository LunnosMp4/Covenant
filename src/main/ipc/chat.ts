import { randomUUID } from 'crypto'
import { ipcMain, type WebContents } from 'electron'
import { DEFAULT_ENABLE_WEB_SEARCH } from '../../shared/config'
import {
  buildTerminalToolDefinitions,
  TERMINAL_TOOL_INSTRUCTIONS
} from '../../shared/terminal/tools'
import { readConfig } from '../config/configStore'
import { getActiveMcpToolRegistry } from '../mcp/registry'
import { createOpenAIClient } from '../openai/client'
import { completeChatWithMcp } from '../openai/completion'
import {
  buildResponseParams,
  buildResponsesInput,
  buildWebSearchToolDefinition,
  sanitizeMessages
} from '../openai/messages'
import { runStreamingChat } from '../openai/streaming'
import { buildOpenAIToolDefinitions } from '../services/mcpClient'
import { terminalManager } from '../terminalManager'
import { createTerminalToolHandlers } from '../terminal/tools'
import { setVoiceRecordingActive } from '../windows'
import { getOpenAIKey, resolveChatProvider } from '../ai/provider'
import {
  createWebSearchHandler,
  resolveWebSearchProviderForModel,
  shouldUseNativeWebSearch
} from '../ai/webSearch'
import { webSearchProviderLabel as getWebSearchProviderLabel } from '../../shared/ai/webSearch'
import { recordAiUsage } from '../ai/usageLedger'
import type { BuiltinToolHandler } from '../services/builtinTools'
import { log } from '../logger'

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
    const payload = rawPayload as
      | { messages?: unknown; terminalSessionId?: unknown; conversationId?: unknown }
      | undefined
    const rawMessages = Array.isArray(rawPayload) ? rawPayload : payload?.messages
    const terminalSessionId =
      !Array.isArray(rawPayload) &&
      typeof payload?.terminalSessionId === 'string' &&
      payload.terminalSessionId.length > 0
        ? payload.terminalSessionId
        : undefined
    const conversationId =
      !Array.isArray(rawPayload) &&
      typeof payload?.conversationId === 'string' &&
      payload.conversationId.length > 0
        ? payload.conversationId
        : undefined

    const sanitized = Array.isArray(rawMessages) ? sanitizeMessages(rawMessages) : []

    if (sanitized.length === 0) {
      throw new Error('Prompt cannot be empty.')
    }

    const storedConfig = readConfig()
    const provider = await resolveChatProvider(storedConfig, { sessionId: conversationId })

    const streamId = randomUUID()
    const sender = event.sender
    const streamSender = createStreamSender(sender, streamId)
    const sendStreamEvent = streamSender.send

    const toolRegistry = getActiveMcpToolRegistry()
    const chatModel = provider.model
    const modelOption = provider.modelOption
    const enableWebSearch = storedConfig.enableWebSearch ?? DEFAULT_ENABLE_WEB_SEARCH
    const webSearchEnabled = enableWebSearch && modelOption.webSearch !== false
    const resolvedWebSearchProvider = resolveWebSearchProviderForModel(storedConfig, modelOption)
    const webSearchProviderLabel = getWebSearchProviderLabel(resolvedWebSearchProvider)
    const terminalSession =
      terminalSessionId && terminalManager.hasSession(terminalSessionId)
        ? terminalSessionId
        : undefined

    const tools: Array<Record<string, unknown>> = []
    const builtinTools: BuiltinToolHandler[] = terminalSession
      ? createTerminalToolHandlers(terminalSession)
      : []

    if (webSearchEnabled) {
      const useNativeOpenAI =
        provider.provider === 'openai' &&
        resolvedWebSearchProvider === 'openai' &&
        modelOption.webSearch === 'native'
      const useNativeOpenCode = shouldUseNativeWebSearch(
        storedConfig,
        modelOption,
        resolvedWebSearchProvider
      )
      if (useNativeOpenAI || useNativeOpenCode) {
        tools.push({ type: 'web_search' })
      } else {
        tools.push(buildWebSearchToolDefinition())
        builtinTools.push(createWebSearchHandler(storedConfig, modelOption))
      }
    }

    tools.push(...buildOpenAIToolDefinitions(toolRegistry))
    if (terminalSession) {
      tools.push(...(buildTerminalToolDefinitions() as unknown as Array<Record<string, unknown>>))
    }

    const input = buildResponsesInput(sanitized)
    const params = buildResponseParams(storedConfig, chatModel, {
      provider: provider.provider,
      modelOption
    })

    if (terminalSession) {
      const base = typeof params.instructions === 'string' ? params.instructions : ''
      params.instructions = `${base}\n\n${TERMINAL_TOOL_INSTRUCTIONS}`.trim()
    }

    const controller = new AbortController()
    activeChatStreams.set(streamId, controller)

    void runStreamingChat(
      {
        client: provider.client,
        streamId,
        sender,
        model: chatModel,
        provider: provider.provider,
        webSearchProviderLabel,
        sendStreamEvent,
        signal: controller.signal,
        onUsage: (usage) =>
          recordAiUsage({
            provider: provider.provider,
            model: chatModel,
            kind: 'chat',
            usage
          })
      },
      input,
      tools,
      params,
      toolRegistry,
      builtinTools
    ).catch((error) => {
      const message = error instanceof Error ? error.message : 'Unable to fetch AI response.'
      log.error('Chat stream failed', error)
      sendStreamEvent({ id: streamId, type: 'error', error: message })
    }).finally(() => {
      streamSender.flush()
      activeChatStreams.delete(streamId)
    })

    return { id: streamId }
  })

  ipcMain.handle('covenant:chat', async (event, rawPayload: unknown) => {
    const rawMessages = Array.isArray(rawPayload)
      ? rawPayload
      : (rawPayload as { messages?: unknown } | undefined)?.messages
    const sanitized = Array.isArray(rawMessages) ? sanitizeMessages(rawMessages) : []

    if (sanitized.length === 0) {
      throw new Error('Prompt cannot be empty.')
    }

    const storedConfig = readConfig()
    const provider = await resolveChatProvider(storedConfig)
    const toolRegistry = getActiveMcpToolRegistry()
    const chatModel = provider.model
    const modelOption = provider.modelOption
    const enableWebSearch = storedConfig.enableWebSearch ?? DEFAULT_ENABLE_WEB_SEARCH
    const webSearchEnabled = enableWebSearch && modelOption.webSearch !== false
    const resolvedWebSearchProvider = resolveWebSearchProviderForModel(storedConfig, modelOption)

    const extraTools: Array<Record<string, unknown>> = []
    const builtinTools: BuiltinToolHandler[] = []
    if (webSearchEnabled) {
      const useNativeOpenAI =
        provider.provider === 'openai' &&
        resolvedWebSearchProvider === 'openai' &&
        modelOption.webSearch === 'native'
      const useNativeOpenCode = shouldUseNativeWebSearch(
        storedConfig,
        modelOption,
        resolvedWebSearchProvider
      )
      if (useNativeOpenAI || useNativeOpenCode) {
        extraTools.push({ type: 'web_search' })
      } else {
        extraTools.push(buildWebSearchToolDefinition())
        builtinTools.push(createWebSearchHandler(storedConfig, modelOption))
      }
    }

    if (toolRegistry.length > 0 || builtinTools.length > 0) {
      return completeChatWithMcp(provider.client, sanitized, toolRegistry, chatModel, {
        provider: provider.provider,
        modelOption,
        builtinTools,
        extraTools,
        sender: event.sender
      })
    }

    const input = buildResponsesInput(sanitized)
    const params = buildResponseParams(storedConfig, chatModel, {
      provider: provider.provider,
      modelOption
    })

    const response = await provider.client.responses.create({
      model: chatModel,
      input: input as unknown[],
      ...(extraTools.length > 0 ? { tools: extraTools as unknown[] } : {}),
      ...(params as Record<string, unknown>)
    } as any)
    return (response as any).output_text?.trim() || 'No response from model.'
  })

  ipcMain.on('voice:recording-active', (_event, active: unknown) => {
    setVoiceRecordingActive(active === true)
  })

  ipcMain.handle('voice:transcribe', async (_event, audioBuffer: ArrayBuffer) => {
    const storedConfig = readConfig()
    const apiKey = getOpenAIKey(storedConfig)
    if (!apiKey) {
      throw new Error('OpenAI API key is required for microphone transcription. Add it in Settings > AI > Providers & Keys.')
    }

    const client = await createOpenAIClient(apiKey, storedConfig.proxyUrl)

    const file = new File([Buffer.from(audioBuffer)], 'audio.webm', { type: 'audio/webm' })
    const transcription = await client.audio.transcriptions.create({
      model: 'gpt-4o-mini-transcribe',
      file,
      response_format: 'text'
    })

    return typeof transcription === 'string' ? transcription : (transcription as unknown as { text: string }).text
  })
}
