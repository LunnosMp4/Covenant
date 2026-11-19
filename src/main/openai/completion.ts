import type OpenAI from 'openai'
import type { WebContents } from 'electron'
import {
  buildOpenAIToolDefinitions,
  callMcpTool,
  sanitizeResponseOutputForProvider,
  type McpToolRegistryEntry
} from '../services/mcpClient'
import type { BuiltinToolHandler } from '../services/builtinTools'
import { readConfig } from '../config/configStore'
import { buildResponseParams, buildResponsesInput, MAX_MCP_TOOL_ROUNDS, type SanitizedMessage } from './messages'
import type { AiModelOption, ChatProviderId } from '../../shared/config'
import { mapWithConcurrencyResults } from '../utils/async'

const MAX_PARALLEL_MCP_CALLS = 4

export async function completeChatWithMcp(
  client: OpenAI,
  sanitizedMessages: SanitizedMessage[],
  toolRegistry: McpToolRegistryEntry[],
  model: string,
  options: {
    provider?: ChatProviderId
    modelOption?: AiModelOption
    builtinTools?: BuiltinToolHandler[]
    extraTools?: Array<Record<string, unknown>>
    signal?: AbortSignal
    sender?: WebContents
  } = {}
): Promise<string> {
  const storedConfig = readConfig()
  const params = buildResponseParams(storedConfig, model, {
    provider: options.provider,
    modelOption: options.modelOption
  })
  const tools = [...buildOpenAIToolDefinitions(toolRegistry), ...(options.extraTools ?? [])]
  const builtinTools = options.builtinTools ?? []
  const signal = options.signal ?? new AbortController().signal

  let input = buildResponsesInput(sanitizedMessages)

  for (let attempt = 0; attempt < MAX_MCP_TOOL_ROUNDS; attempt += 1) {
    const response = (await client.responses.create({
      model,
      input: input as unknown[],
      ...(tools.length > 0 ? { tools: tools as unknown[] } : {}),
      ...(params as Record<string, unknown>)
    } as any)) as unknown as {
      output?: Array<Record<string, unknown>>
      output_text?: unknown
    }

    const output = response?.output ?? []
    const functionCalls = output.filter(
      (item) => item.type === 'function_call' && typeof item.call_id === 'string'
    ) as Array<{ call_id: string; name: string; arguments: string }>

    if (functionCalls.length === 0) {
      return (typeof response?.output_text === 'string' ? response.output_text : '').trim() || 'No response from model.'
    }

    const continuation: Array<Record<string, unknown>> = [
      ...sanitizeResponseOutputForProvider(output, options.provider ?? 'openai')
    ]

    // Independent MCP tools are dispatched concurrently; the loop above used to
    // pay the sum of every roundtrip even when the calls had no dependency.
    const outcomes = await mapWithConcurrencyResults(functionCalls, MAX_PARALLEL_MCP_CALLS, async (call) => {
      const builtin = builtinTools.find((handler) => handler.name === call.name)
      if (builtin) {
        const result = await builtin.execute(call.arguments, {
          signal,
          sender: options.sender
        })
        return {
          type: 'function_call_output',
          call_id: call.call_id,
          output: result.content
        } as Record<string, unknown>
      }
      const entry = toolRegistry.find((e) => e.qualifiedName === call.name)
      if (!entry) {
        return {
          type: 'function_call_output',
          call_id: call.call_id,
          output: `Tool ${call.name} is unavailable.`
        } as Record<string, unknown>
      }
      const result = await callMcpTool(entry.server, entry.tool, call.arguments)
      return {
        type: 'function_call_output',
        call_id: call.call_id,
        output: result.content
      } as Record<string, unknown>
    })

    const firstFailure = outcomes.find(
      (outcome): outcome is { ok: false; error: unknown } => !outcome.ok
    )
    if (firstFailure) {
      throw firstFailure.error instanceof Error
        ? firstFailure.error
        : new Error('MCP tool call failed.')
    }

    for (const outcome of outcomes) {
      if (outcome.ok) continuation.push(outcome.value)
    }

    input = [...input, ...continuation]
  }

  return 'The model requested too many tool calls without finishing.'
}
