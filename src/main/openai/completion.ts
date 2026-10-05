import type OpenAI from 'openai'
import {
  buildOpenAIToolDefinitions,
  callMcpTool,
  sanitizeResponseOutputForInput,
  type McpToolRegistryEntry
} from '../services/mcpClient'
import { readConfig } from '../config/configStore'
import { buildResponseParams, buildResponsesInput, MAX_MCP_TOOL_ROUNDS, type SanitizedMessage } from './messages'

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
    for (const call of functionCalls) {
      const entry = toolRegistry.find((e) => e.qualifiedName === call.name)
      if (!entry) {
        continuation.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: `Tool ${call.name} is unavailable.`
        })
        continue
      }
      const result = await callMcpTool(entry.server, entry.tool, call.arguments)
      continuation.push({ type: 'function_call_output', call_id: call.call_id, output: result.content })
    }

    input = [...input, ...continuation]
  }

  return 'The model requested too many tool calls without finishing.'
}
