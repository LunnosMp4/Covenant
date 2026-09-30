import { randomUUID } from 'crypto'
import type { McpAuth, McpHeader, McpServer, McpTool } from '../../shared/mcp'

const DEFAULT_MCP_PROTOCOL_VERSION = '2024-11-05'
const DEFAULT_MCP_TIMEOUT_MS = 30_000
const MAX_MCP_ERROR_BODY_LENGTH = 400

interface ClientInfo {
  name: string
  version: string
}

let clientInfo: ClientInfo = { name: 'Covenant', version: '0.0.0' }

export function configureMcpClient(info: ClientInfo): void {
  clientInfo = { ...info }
}

const mcpSessionIds = new Map<string, string>()

export function forgetMcpSession(serverId: string): void {
  mcpSessionIds.delete(serverId)
}

export function forgetAllMcpSessions(): void {
  mcpSessionIds.clear()
}

export interface McpServerConnection {
  id: string
  url: string
  auth: McpAuth
  appendMcpSuffix?: boolean
}

export interface McpRequestOptions {
  timeoutMs?: number
  signal?: AbortSignal
  retried?: boolean
}

interface JsonRpcEnvelope {
  jsonrpc?: string
  id?: string | number | null
  result?: unknown
  error?: { code?: number; message?: string }
}

export function resolveMcpEndpointUrl(rawUrl: string, appendMcpSuffix: boolean): string {
  const parsed = new URL(rawUrl)
  if (!appendMcpSuffix) {
    return parsed.toString()
  }

  if (parsed.pathname.endsWith('/mcp')) {
    return parsed.toString()
  }

  parsed.pathname = parsed.pathname.endsWith('/') ? `${parsed.pathname}mcp` : `${parsed.pathname}/mcp`
  return parsed.toString()
}

export function normalizeMcpToolNameSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_]/g, '_')
  return normalized || 'tool'
}

function buildMcpHeaders(server: McpServerConnection): Headers {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json, text/event-stream')

  if (server.auth.type === 'accessToken' && server.auth.token.trim()) {
    headers.set('Authorization', `Bearer ${server.auth.token.trim()}`)
  }

  if (server.auth.type === 'customHeaders') {
    server.auth.headers.forEach((header) => {
      if (header.name.trim()) {
        headers.set(header.name.trim(), header.value.trim())
      }
    })
  }

  const sessionId = mcpSessionIds.get(server.id)
  if (sessionId) {
    headers.set('mcp-session-id', sessionId)
  }

  return headers
}

function parseSseEvents(text: string): string[] {
  const events: string[] = []
  const dataLines: string[] = []

  const flush = (): void => {
    if (dataLines.length > 0) {
      events.push(dataLines.join('\n'))
      dataLines.length = 0
    }
  }

  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (line.length === 0) {
      flush()
      continue
    }
    if (line.startsWith('data:')) {
      const value = line.slice(5).replace(/^ /, '')
      if (value === '[DONE]') {
        flush()
        continue
      }
      dataLines.push(value)
    }
  }
  flush()

  return events
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

function extractMcpJsonResponse(text: string, requestId: string): JsonRpcEnvelope {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('MCP server returned an empty response.')
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = tryParseJson(trimmed)
    if (parsed !== undefined && typeof parsed === 'object') {
      return parsed as JsonRpcEnvelope
    }
    throw new Error('MCP server returned an invalid JSON response.')
  }

  const events = parseSseEvents(trimmed)
  const responses = events
    .map((event) => tryParseJson(event))
    .filter((item): item is JsonRpcEnvelope => item !== undefined && typeof item === 'object')

  if (responses.length === 0) {
    throw new Error('MCP server returned no parseable events.')
  }

  return responses.find((item) => item.id === requestId) ?? responses[responses.length - 1]!
}

function cleanMcpErrorText(body: string, status: number): string {
  const trimmed = body.trim()
  if (trimmed.startsWith('{')) {
    const parsed = tryParseJson(trimmed) as JsonRpcEnvelope | undefined
    if (parsed?.error?.message) {
      return `MCP error: ${parsed.error.message}`
    }
  }
  const shortened = trimmed.length > MAX_MCP_ERROR_BODY_LENGTH ? `${trimmed.slice(0, MAX_MCP_ERROR_BODY_LENGTH)}…` : trimmed
  return shortened || `MCP request failed with status ${status}.`
}

async function sendMcpRaw(
  server: McpServerConnection,
  method: string,
  params: Record<string, unknown> | undefined,
  includeId: boolean,
  options: McpRequestOptions
): Promise<Response> {
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? DEFAULT_MCP_TIMEOUT_MS
  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error(`MCP request timed out after ${timeoutMs}ms.`))
  }, timeoutMs)

  const callerSignal = options.signal
  const onCallerAbort = (): void => {
    controller.abort(callerSignal?.reason)
  }
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true })

  try {
    const body: Record<string, unknown> = { jsonrpc: '2.0', method }
    if (includeId) {
      body.id = randomUUID()
    }
    if (params) {
      body.params = params
    }

    const response = await fetch(resolveMcpEndpointUrl(server.url, server.appendMcpSuffix ?? true), {
      method: 'POST',
      headers: buildMcpHeaders(server),
      body: JSON.stringify(body),
      signal: controller.signal
    })

    const sessionId = response.headers.get('mcp-session-id')
    if (sessionId) {
      mcpSessionIds.set(server.id, sessionId)
    }

    return response
  } finally {
    clearTimeout(timeoutHandle)
    callerSignal?.removeEventListener('abort', onCallerAbort)
  }
}

async function sendMcpRequest(
  server: McpServerConnection,
  method: string,
  params?: Record<string, unknown>,
  options: McpRequestOptions = {}
): Promise<unknown> {
  const requestId = randomUUID()
  const response = await sendMcpRaw(server, method, params, true, options)

  const responseText = await response.text()

  if (!response.ok) {
    const hadSession = mcpSessionIds.has(server.id)
    const staleSession = !options.retried && hadSession && (response.status === 400 || response.status === 404 || response.status === 410)
    if (staleSession) {
      mcpSessionIds.delete(server.id)
      await initializeMcpServer(server, options)
      return sendMcpRequest(server, method, params, { ...options, retried: true })
    }
    throw new Error(cleanMcpErrorText(responseText, response.status))
  }

  const parsed = extractMcpJsonResponse(responseText, requestId)
  if (parsed.error) {
    const message = typeof parsed.error.message === 'string' ? parsed.error.message : 'MCP request failed.'
    throw new Error(`MCP error: ${message}`)
  }

  return parsed.result
}

async function sendMcpNotification(
  server: McpServerConnection,
  method: string,
  params?: Record<string, unknown>
): Promise<void> {
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), 5000)
  try {
    await fetch(resolveMcpEndpointUrl(server.url, server.appendMcpSuffix ?? true), {
      method: 'POST',
      headers: buildMcpHeaders(server),
      body: JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }),
      signal: controller.signal
    }).catch(() => undefined)
  } finally {
    clearTimeout(timeoutHandle)
  }
}

export async function initializeMcpServer(
  server: McpServerConnection,
  options: McpRequestOptions = {}
): Promise<{ protocolVersion?: string; capabilities?: Record<string, unknown>; serverInfo?: Record<string, unknown> }> {
  const result = (await sendMcpRequest(
    server,
    'initialize',
    {
      protocolVersion: DEFAULT_MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: clientInfo.name, version: clientInfo.version }
    },
    options
  )) as { protocolVersion?: string; capabilities?: Record<string, unknown>; serverInfo?: Record<string, unknown> } | undefined

  try {
    await sendMcpNotification(server, 'notifications/initialized')
  } catch {
    // Optional notification — failures are non-fatal.
  }

  return result ?? {}
}

export async function refreshMcpServerTools(
  server: McpServer,
  options: McpRequestOptions = {}
): Promise<McpServer> {
  await initializeMcpServer(server, options)

  const result = (await sendMcpRequest(server, 'tools/list', {}, options)) as { tools?: unknown } | undefined
  const rawTools = Array.isArray(result?.tools) ? (result.tools as unknown[]) : []

  const discoveredTools: Array<{
    name: string
    description: string
    inputSchema?: Record<string, unknown>
  }> = []
  for (const rawTool of rawTools) {
    if (!rawTool || typeof rawTool !== 'object') continue
    const tool = rawTool as Record<string, unknown>
    const name = typeof tool.name === 'string' ? tool.name.trim() : ''
    if (!name) continue
    const description = typeof tool.description === 'string' ? tool.description.trim() : ''
    const inputSchema =
      tool.inputSchema && typeof tool.inputSchema === 'object'
        ? (tool.inputSchema as Record<string, unknown>)
        : undefined
    discoveredTools.push({ name, description, inputSchema })
  }

  const existingToolsByName = new Map(server.tools.map((tool) => [tool.name, tool]))
  const hadPriorTools = server.tools.length > 0
  const normalizedTools: McpTool[] = discoveredTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    enabled: existingToolsByName.get(tool.name)?.enabled ?? !hadPriorTools
  }))

  return {
    ...server,
    tools: normalizedTools,
    lastSyncedAt: Date.now(),
    lastError: undefined
  }
}

function parseMcpToolResultContent(result: unknown): string {
  if (typeof result === 'string') {
    return result
  }

  if (!result || typeof result !== 'object') {
    return JSON.stringify(result)
  }

  const content = (result as { content?: unknown }).content
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    const textSegments = content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }

        if (part && typeof part === 'object') {
          const typedPart = part as { type?: unknown; text?: unknown; content?: unknown }
          if (typedPart.type === 'text' && typeof typedPart.text === 'string') {
            return typedPart.text
          }

          if (typeof typedPart.content === 'string') {
            return typedPart.content
          }
        }

        return ''
      })
      .filter((segment) => Boolean(segment))

    if (textSegments.length > 0) {
      return textSegments.join('\n')
    }
  }

  return JSON.stringify(result)
}

export interface McpCallResult {
  content: string
  isError: boolean
}

export async function callMcpTool(
  server: McpServerConnection,
  tool: McpTool,
  rawArguments: string | undefined,
  options: McpRequestOptions = {}
): Promise<McpCallResult> {
  let parsedArguments: Record<string, unknown> = {}

  if (typeof rawArguments === 'string' && rawArguments.trim()) {
    try {
      parsedArguments = JSON.parse(rawArguments) as Record<string, unknown>
    } catch {
      parsedArguments = { input: rawArguments }
    }
  }

  const result = (await sendMcpRequest(
    server,
    'tools/call',
    {
      name: tool.name,
      arguments: parsedArguments
    },
    options
  )) as { content?: unknown; isError?: boolean; structuredContent?: unknown } | undefined

  if (!result || typeof result !== 'object') {
    return { content: parseMcpToolResultContent(result), isError: false }
  }

  const isError = result.isError === true
  const content =
    typeof result.structuredContent !== 'undefined' && result.structuredContent !== null
      ? JSON.stringify(result.structuredContent)
      : parseMcpToolResultContent(result)

  return { content, isError }
}

export function sanitizeMcpToolSchema(inputSchema: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!inputSchema || typeof inputSchema !== 'object') {
    return { type: 'object', properties: {}, additionalProperties: true }
  }

  const schema = { ...inputSchema } as Record<string, unknown>
  delete schema.$schema
  delete schema.$id
  delete schema.title
  delete schema.definitions

  if (typeof schema.type !== 'string') {
    schema.type = 'object'
  }
  if (typeof schema.properties !== 'object' || schema.properties === null) {
    schema.properties = {}
  }
  if (typeof schema.additionalProperties !== 'boolean' && typeof schema.additionalProperties !== 'object') {
    schema.additionalProperties = true
  }

  return schema
}

export interface McpToolRegistryEntry {
  server: McpServer
  tool: McpTool
  qualifiedName: string
}

export function buildOpenAIToolDefinitions(
  toolRegistry: McpToolRegistryEntry[]
): Array<{ type: 'function'; name: string; description?: string; parameters: Record<string, unknown> }> {
  return toolRegistry.map((entry) => ({
    type: 'function',
    name: entry.qualifiedName,
    description: entry.tool.description || undefined,
    parameters: sanitizeMcpToolSchema(entry.tool.inputSchema)
  }))
}

export interface McpConnectionTestResult {
  ok: boolean
  message: string
  toolCount: number
  lastError?: string
}

export async function testMcpServer(input: {
  name: string
  url: string
  auth: McpAuth
  appendMcpSuffix?: boolean
  timeoutMs?: number
}): Promise<McpConnectionTestResult> {
  const connection: McpServerConnection = {
    id: `test-${randomUUID()}`,
    url: input.url,
    auth: input.auth,
    appendMcpSuffix: input.appendMcpSuffix ?? true
  }

  try {
    const result = await initializeMcpServer(connection, { timeoutMs: input.timeoutMs })
    const listResult = (await sendMcpRequest(connection, 'tools/list', {}, { timeoutMs: input.timeoutMs })) as {
      tools?: unknown
    }
    const toolCount = Array.isArray(listResult?.tools) ? (listResult.tools as unknown[]).length : 0
    const serverName =
      (result?.serverInfo as Record<string, unknown> | undefined)?.name ?? input.name
    return {
      ok: true,
      message: `Connected to ${serverName} (${toolCount} tools).`,
      toolCount,
      lastError: undefined
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to connect to MCP server.'
    return { ok: false, message, toolCount: 0, lastError: message }
  }
}