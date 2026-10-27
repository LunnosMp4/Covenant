import type OpenAI from 'openai'
import {
  buildOpenAIToolDefinitions,
  callMcpTool,
  sanitizeResponseOutputForInput,
  type McpToolRegistryEntry
} from '../services/mcpClient'
import { readConfig } from '../config/configStore'
import { buildResponseParams, buildResponsesInput, MAX_MCP_TOOL_ROUNDS, type SanitizedMessage } from './messages'

const MAX_PARALLEL_MCP_CALLS = 4

/**
 * Runs `worker` over `items` with bounded concurrency while preserving the
 * original result order. Errors are captured per item so one failing call does
 * not cancel the others; the caller decides how to surface them.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const results = new Array<{ ok: true; value: R } | { ok: false; error: unknown }>(items.length)
  let cursor = 0

  const run = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      try {
        results[index] = { ok: true, value: await worker(items[index], index) }
      } catch (error) {
        results[index] = { ok: false, error }
      }
    }
  }

  const workers = Math.min(Math.max(limit, 1), items.length)
  await Promise.all(Array.from({ length: workers }, () => run()))
  return results
}

export async function completeChatWithMcp(
  client: OpenAI,
  sanitizedMessages: SanitizedMessage[],
  toolRegistry: McpToolRegistryEntry[],
  model: string
): Promise<string> {
  const storedConfig = readConfig()
  const params = buildResponseParams(storedConfig, model)
  const tools = buildOpenAIToolDefinitions(toolRegistry)

  let input = buildResponsesInput(sanitizedMessages)

  for (let attempt = 0; attempt < MAX_MCP_TOOL_ROUNDS; attempt += 1) {
    const response = (await client.responses.create({
      model,
      input: input as unknown[],
      tools: tools as unknown[],
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

    const continuation: Array<Record<string, unknown>> = [...sanitizeResponseOutputForInput(output)]

    // Independent MCP tools are dispatched concurrently; the loop above used to
    // pay the sum of every roundtrip even when the calls had no dependency.
    const outcomes = await runWithConcurrency(functionCalls, MAX_PARALLEL_MCP_CALLS, async (call) => {
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
