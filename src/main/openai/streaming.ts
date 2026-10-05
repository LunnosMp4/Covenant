import type OpenAI from 'openai'
import type { WebContents } from 'electron'
import type { ChatUsage } from '../../shared/chat/chat'
import { callMcpTool, sanitizeResponseOutputForInput, type McpToolRegistryEntry } from '../services/mcpClient'
import {
  extractWebSearchQuery,
  MAX_MCP_TOOL_ROUNDS,
  truncateMcpResult
} from './messages'

export interface StreamingChatContext {
  client: OpenAI
  streamId: string
  sender: WebContents
  model: string
  sendStreamEvent: (payload: { id: string } & Record<string, unknown>) => void
  signal: AbortSignal
}

export async function runStreamingChat(
  ctx: StreamingChatContext,
  initialInput: Array<Record<string, unknown>>,
  tools: Array<Record<string, unknown>>,
  baseParams: Record<string, unknown>,
  toolRegistry: McpToolRegistryEntry[]
): Promise<void> {
  const reasoningBufferMap = new Map<string, string>()
  const reasoningTitleParsed = new Set<string>()
  const reasoningTitleById = new Map<string, string>()
  const functionArgsById = new Map<string, string>()
  const functionMetaById = new Map<string, { name: string; callId: string }>()

  let currentInput = initialInput

  for (let round = 0; round < MAX_MCP_TOOL_ROUNDS + 1; round += 1) {
    if (ctx.signal.aborted) break

    const streamBody: Record<string, unknown> = {
      ...baseParams,
      model: ctx.model,
      input: currentInput as unknown[],
      stream: true
    }
    if (tools.length > 0) {
      streamBody.tools = tools as unknown[]
    }

    const stream = ctx.client.responses.stream(streamBody as any, { signal: ctx.signal })

    let finalUsage: ChatUsage | undefined
    let streamError: string | undefined
    let stopped = false

    try {
      for await (const streamEvent of stream) {
        switch (streamEvent.type) {
          case 'response.output_item.added': {
            const item = streamEvent.item as unknown as Record<string, unknown>
            if (item.type === 'reasoning') {
              reasoningBufferMap.set(item.id as string, '')
              ctx.sendStreamEvent({ id: ctx.streamId, type: 'reasoning-start', itemId: item.id })
            } else if (item.type === 'web_search_call') {
              const action = item.action as Record<string, unknown> | undefined
              ctx.sendStreamEvent({
                id: ctx.streamId,
                type: 'tool-start',
                itemId: item.id,
                toolType: 'web_search',
                toolName: 'Web Search',
                actionType: typeof action?.type === 'string' ? action.type : 'search',
                query: extractWebSearchQuery(action)
              })
            } else if (item.type === 'function_call') {
              const itemId = item.id as string
              const callId = typeof item.call_id === 'string' ? item.call_id : itemId
              const name = typeof item.name === 'string' ? item.name : ''
              functionArgsById.set(itemId, '')
              functionMetaById.set(itemId, { name, callId })
              const entry = toolRegistry.find((e) => e.qualifiedName === name)
              ctx.sendStreamEvent({
                id: ctx.streamId,
                type: 'tool-start',
                itemId,
                toolType: 'mcp',
                toolName: entry ? `${entry.server.name} › ${entry.tool.name}` : name,
                serverName: entry?.server.name,
                serverId: entry?.server.id,
                query: name,
                actionType: 'call'
              })
            }
            break
          }

          case 'response.function_call_arguments.delta': {
            const itemId = streamEvent.item_id
            const delta = typeof streamEvent.delta === 'string' ? streamEvent.delta : ''
            if (itemId) {
              functionArgsById.set(itemId, (functionArgsById.get(itemId) ?? '') + delta)
            }
            break
          }

          case 'response.function_call_arguments.done': {
            const itemId = streamEvent.item_id
            const args = typeof streamEvent.arguments === 'string'
              ? streamEvent.arguments
              : (functionArgsById.get(itemId) ?? '')
            const meta = itemId ? functionMetaById.get(itemId) : undefined
            if (itemId && meta) {
              functionArgsById.set(itemId, args)
              ctx.sendStreamEvent({ id: ctx.streamId, type: 'tool-query', itemId, query: meta.name })
            }
            break
          }

          case 'response.reasoning_summary_text.delta': {
            const deltaStr = typeof streamEvent.delta === 'string' ? streamEvent.delta : ''
            const itemId = streamEvent.item_id
            if (!deltaStr || !itemId) break

            const buffer = (reasoningBufferMap.get(itemId) || '') + deltaStr
            reasoningBufferMap.set(itemId, buffer)

            if (!reasoningTitleParsed.has(itemId)) {
              const match = /^\*\*([^*\n]+)\*\*\n\n([\s\S]*)$/.exec(buffer)
              if (match) {
                reasoningTitleParsed.add(itemId)
                reasoningTitleById.set(itemId, match[1])
                ctx.sendStreamEvent({ id: ctx.streamId, type: 'reasoning-title', itemId, title: match[1] })
                if (match[2]) {
                  ctx.sendStreamEvent({ id: ctx.streamId, type: 'reasoning-delta', itemId, delta: match[2] })
                }
                break
              }
            }

            if (reasoningTitleParsed.has(itemId)) {
              ctx.sendStreamEvent({ id: ctx.streamId, type: 'reasoning-delta', itemId, delta: deltaStr })
            }
            break
          }

          case 'response.output_item.done': {
            const doneItem = streamEvent.item as unknown as Record<string, unknown>
            if (doneItem.type === 'reasoning') {
              const itemId = doneItem.id as string
              if (!reasoningTitleParsed.has(itemId)) {
                const buffer = reasoningBufferMap.get(itemId) || ''
                const match = /^\*\*([^*\n]+)\*\*\n\n([\s\S]*)$/.exec(buffer)
                const fallbackTitle = match ? match[1] : 'Thinking...'
                reasoningTitleParsed.add(itemId)
                reasoningTitleById.set(itemId, fallbackTitle)
                ctx.sendStreamEvent({ id: ctx.streamId, type: 'reasoning-title', itemId, title: fallbackTitle })
                if (match && match[2]) {
                  ctx.sendStreamEvent({ id: ctx.streamId, type: 'reasoning-delta', itemId, delta: match[2] })
                } else if (!match && buffer) {
                  ctx.sendStreamEvent({ id: ctx.streamId, type: 'reasoning-delta', itemId, delta: buffer })
                }
              }
              ctx.sendStreamEvent({
                id: ctx.streamId,
                type: 'reasoning-end',
                itemId,
                title: reasoningTitleById.get(itemId) || 'Thinking...'
              })
            } else if (doneItem.type === 'web_search_call') {
              const action = (doneItem as Record<string, unknown>).action as Record<string, unknown> | undefined
              const query = extractWebSearchQuery(action)

              ctx.sendStreamEvent({
                id: ctx.streamId,
                type: 'tool-query',
                itemId: doneItem.id,
                query
              })

              const rawSources: Array<Record<string, unknown>> = []
              if (Array.isArray(action?.sources)) {
                rawSources.push(...action.sources as Array<Record<string, unknown>>)
              } else if (Array.isArray((action as Record<string, unknown> | undefined)?.['results'])) {
                const rawResults = (action as Record<string, unknown>)['results'] as Array<Record<string, unknown>>
                for (const entry of rawResults) {
                  if (Array.isArray(entry.results)) {
                    rawSources.push(...entry.results as Array<Record<string, unknown>>)
                  } else if (Array.isArray(entry.sources)) {
                    rawSources.push(...entry.sources as Array<Record<string, unknown>>)
                  }
                }
              }

              const sources = rawSources
                .map((src) => ({
                  title: (typeof src.title === 'string' ? src.title : '')
                    || (typeof src.name === 'string' ? src.name : '')
                    || '',
                  url: (typeof src.url === 'string' ? src.url : '')
                    || (typeof src.link === 'string' ? src.link : '')
                    || (typeof src.href === 'string' ? src.href : '')
                    || ''
                }))
                .filter((src) => src.url.length > 0)

              if (sources.length > 0) {
                ctx.sendStreamEvent({
                  id: ctx.streamId,
                  type: 'sources',
                  itemId: doneItem.id,
                  sources,
                  query
                })
              }
            } else if (doneItem.type === 'function_call') {
              const itemId = doneItem.id as string
              if (itemId) {
                const args =
                  typeof doneItem.arguments === 'string'
                    ? doneItem.arguments
                    : (functionArgsById.get(itemId) ?? '')
                functionArgsById.set(itemId, args)
              }
            }
            break
          }

          case 'response.output_text.delta': {
            const textDelta = typeof streamEvent.delta === 'string' ? streamEvent.delta : ''
            if (textDelta) {
              ctx.sendStreamEvent({ id: ctx.streamId, type: 'content', delta: textDelta })
            }
            break
          }

          case 'response.completed': {
            const response = streamEvent.response as unknown as {
              usage?: {
                input_tokens?: number
                output_tokens?: number
                total_tokens?: number
                cache_creation_input_tokens?: number
                cache_write_tokens?: number
                input_tokens_details?: { cached_tokens?: number; cache_creation_tokens?: number }
                output_tokens_details?: { reasoning_tokens?: number }
              }
            }
            const usage = response?.usage
            finalUsage = usage
              ? {
                  promptTokens: usage.input_tokens,
                  cachedPromptTokens: usage.input_tokens_details?.cached_tokens,
                  cacheWritePromptTokens:
                    usage.input_tokens_details?.cache_creation_tokens ??
                    usage.cache_creation_input_tokens ??
                    usage.cache_write_tokens,
                  completionTokens: usage.output_tokens,
                  totalTokens: usage.total_tokens,
                  reasoningTokens: usage.output_tokens_details?.reasoning_tokens
                }
              : undefined
            break
          }
        }
      }
    } catch (error) {
      if (ctx.signal.aborted) {
        stopped = true
      } else {
        streamError = error instanceof Error ? error.message : 'Unable to fetch AI response.'
      }
    }

    if (streamError) {
      ctx.sendStreamEvent({ id: ctx.streamId, type: 'error', error: streamError })
      return
    }
    if (stopped) {
      ctx.sendStreamEvent({ id: ctx.streamId, type: 'done', usage: finalUsage, model: ctx.model, stopped: true })
      return
    }

    const finalResponse = (await stream.finalResponse().catch(() => null)) as unknown as {
      output?: Array<Record<string, unknown>>
    } | null
    const output = finalResponse?.output ?? []
    const functionCalls = output.filter(
      (item) => item.type === 'function_call' && typeof item.call_id === 'string'
    ) as Array<{ id: string; call_id: string; name: string; arguments: string }>

    if (functionCalls.length === 0) {
      ctx.sendStreamEvent({ id: ctx.streamId, type: 'done', usage: finalUsage, model: ctx.model })
      return
    }

    const continuation: Array<Record<string, unknown>> = [...sanitizeResponseOutputForInput(output)]
    for (const call of functionCalls) {
      const entry = toolRegistry.find((e) => e.qualifiedName === call.name)
      ctx.sendStreamEvent({
        id: ctx.streamId,
        type: 'tool-result',
        itemId: call.id,
        toolType: 'mcp',
        toolName: call.name,
        serverName: entry?.server.name,
        status: 'running'
      })

      if (!entry) {
        continuation.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: `Tool ${call.name} is unavailable.`
        })
        ctx.sendStreamEvent({
          id: ctx.streamId,
          type: 'tool-result',
          itemId: call.id,
          toolType: 'mcp',
          toolName: call.name,
          status: 'error',
          content: 'Tool unavailable.'
        })
        continue
      }

      try {
        const result = await callMcpTool(entry.server, entry.tool, call.arguments, { signal: ctx.signal })
        continuation.push({ type: 'function_call_output', call_id: call.call_id, output: result.content })
        ctx.sendStreamEvent({
          id: ctx.streamId,
          type: 'tool-result',
          itemId: call.id,
          toolType: 'mcp',
          toolName: call.name,
          serverName: entry.server.name,
          status: result.isError ? 'error' : 'done',
          content: truncateMcpResult(result.content)
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'MCP tool call failed.'
        continuation.push({ type: 'function_call_output', call_id: call.call_id, output: `Error: ${message}` })
        ctx.sendStreamEvent({
          id: ctx.streamId,
          type: 'tool-result',
          itemId: call.id,
          toolType: 'mcp',
          toolName: call.name,
          serverName: entry.server.name,
          status: 'error',
          content: message
        })
      }

      if (ctx.signal.aborted) break
    }

    if (ctx.signal.aborted) {
      ctx.sendStreamEvent({ id: ctx.streamId, type: 'done', usage: undefined, model: ctx.model, stopped: true })
      return
    }

    currentInput = [...currentInput, ...continuation]
  }

  ctx.sendStreamEvent({ id: ctx.streamId, type: 'done', usage: undefined, model: ctx.model, stopped: true })
}
