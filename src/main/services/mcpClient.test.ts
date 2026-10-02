import { afterEach, describe, expect, it, vi } from 'vitest'
import type { McpServer } from '../../shared/mcp'
import {
  buildOpenAIToolDefinitions,
  callMcpTool,
  forgetMcpSession,
  initializeMcpServer,
  normalizeMcpToolNameSegment,
  resolveMcpEndpointUrl,
  sanitizeMcpToolSchema,
  sanitizeResponseOutputForInput,
  testMcpServer
} from './mcpClient'

type FetchMock = ReturnType<typeof vi.fn>

function makeServer(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: 'server-1',
    name: 'Test Server',
    url: 'https://example.com/mcp',
    description: '',
    active: true,
    auth: { type: 'none' },
    tools: [],
    appendMcpSuffix: true,
    ...overrides
  }
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })
}

function sseResponse(json: unknown, headers: Record<string, string> = {}): Response {
  return new Response(`data: ${JSON.stringify(json)}\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream', ...headers }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  forgetMcpSession('server-1')
})

describe('resolveMcpEndpointUrl', () => {
  it('appends /mcp when the path has no suffix', () => {
    expect(resolveMcpEndpointUrl('https://example.com', true)).toBe('https://example.com/mcp')
  })

  it('keeps the URL when it already ends in /mcp', () => {
    expect(resolveMcpEndpointUrl('https://example.com/mcp', true)).toBe('https://example.com/mcp')
  })

  it('handles a trailing slash', () => {
    expect(resolveMcpEndpointUrl('https://example.com/api/', true)).toBe('https://example.com/api/mcp')
  })

  it('does not append /mcp when disabled', () => {
    expect(resolveMcpEndpointUrl('https://example.com/custom/endpoint', false)).toBe(
      'https://example.com/custom/endpoint'
    )
  })
})

describe('normalizeMcpToolNameSegment', () => {
  it('replaces invalid characters with underscores', () => {
    expect(normalizeMcpToolNameSegment('my tool-name!')).toBe('my_tool_name_')
  })

  it('returns tool for an empty value', () => {
    expect(normalizeMcpToolNameSegment('   ')).toBe('tool')
  })
})

describe('sanitizeMcpToolSchema', () => {
  it('returns a default object schema for undefined input', () => {
    expect(sanitizeMcpToolSchema(undefined)).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: true
    })
  })

  it('strips metadata keywords and ensures required keys', () => {
    const result = sanitizeMcpToolSchema({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'x',
      title: 'Foo',
      definitions: { a: {} },
      type: 'object',
      properties: { name: { type: 'string' } }
    })

    expect(result.$schema).toBeUndefined()
    expect(result.$id).toBeUndefined()
    expect(result.title).toBeUndefined()
    expect(result.definitions).toBeUndefined()
    expect(result.type).toBe('object')
    expect(result.properties).toEqual({ name: { type: 'string' } })
    expect(result.additionalProperties).toBe(true)
  })

  it('fills in missing type and properties', () => {
    const result = sanitizeMcpToolSchema({ foo: 'bar' })
    expect(result.type).toBe('object')
    expect(result.properties).toEqual({})
  })
})

describe('buildOpenAIToolDefinitions', () => {
  it('maps a registry entry into an OpenAI function tool', () => {
    const server = makeServer()
    const definitions = buildOpenAIToolDefinitions([
      {
        server,
        tool: {
          name: 'list_files',
          description: 'List files',
          inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
          enabled: true
        },
        qualifiedName: 'mcp_server_1_list_files'
      }
    ])

    expect(definitions).toEqual([
      {
        type: 'function',
        name: 'mcp_server_1_list_files',
        description: 'List files',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, additionalProperties: true }
      }
    ])
  })
})

describe('sanitizeResponseOutputForInput', () => {
  it('strips parsed_arguments from function_call items', () => {
    const result = sanitizeResponseOutputForInput([
      {
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_1',
        name: 'echo',
        arguments: '{"value":"hi"}',
        status: 'completed',
        parsed_arguments: { value: 'hi' }
      }
    ])

    expect(result).toEqual([
      {
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_1',
        name: 'echo',
        arguments: '{"value":"hi"}',
        status: 'completed'
      }
    ])
    expect('parsed_arguments' in (result[0] as Record<string, unknown>)).toBe(false)
  })

  it('strips parsed from message content parts', () => {
    const result = sanitizeResponseOutputForInput([
      {
        type: 'message',
        id: 'msg_1',
        role: 'assistant',
        content: [
          { type: 'output_text', text: 'hello', annotations: [], parsed: null }
        ]
      }
    ])

    expect(result).toEqual([
      {
        type: 'message',
        id: 'msg_1',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'hello', annotations: [] }]
      }
    ])
  })

  it('leaves non-parseable items untouched', () => {
    const reasoning = { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'abc' }
    expect(sanitizeResponseOutputForInput([reasoning])).toEqual([reasoning])
  })

  it('removes parsed_arguments even when it is null', () => {
    const result = sanitizeResponseOutputForInput([
      { type: 'function_call', call_id: 'call_1', name: 'x', arguments: '{}', parsed_arguments: null }
    ])
    expect(result[0]).not.toHaveProperty('parsed_arguments')
  })
})

describe('sendMcpRequest (via fetch mock)', () => {
  function mockDiscoveryServer(tools: unknown, options: { sse?: boolean; sessionId?: string } = {}): FetchMock {
    const fetchMock: FetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = (init.body as string) ?? ''
      if (body.includes('"tools/list"')) {
        const payload = { jsonrpc: '2.0', id: '1', result: { tools } }
        const headers: Record<string, string> = {}
        if (options.sessionId) headers['mcp-session-id'] = options.sessionId
        return options.sse ? sseResponse(payload, headers) : jsonResponse(payload, 200, headers)
      }
      if (body.includes('"initialize"')) {
        const headers: Record<string, string> = {}
        if (options.sessionId) headers['mcp-session-id'] = options.sessionId
        return jsonResponse({ jsonrpc: '2.0', id: '1', result: { serverInfo: { name: 'Mock' } } }, 200, headers)
      }
      return new Response(null, { status: 202 })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('parses an application/json JSON-RPC result', async () => {
    mockDiscoveryServer([{ name: 'a' }, { name: 'b' }])
    const { refreshMcpServerTools } = await import('./mcpClient')

    const refreshed = await refreshMcpServerTools(makeServer())

    expect(refreshed.tools.map((tool) => tool.name)).toEqual(['a', 'b'])
    expect(refreshed.lastError).toBeUndefined()
    expect(typeof refreshed.lastSyncedAt).toBe('number')
  })

  it('parses a streamable HTTP SSE response', async () => {
    mockDiscoveryServer([{ name: 'fetch' }], { sse: true })
    const { refreshMcpServerTools } = await import('./mcpClient')

    const refreshed = await refreshMcpServerTools(makeServer())
    expect(refreshed.tools.map((tool) => tool.name)).toEqual(['fetch'])
  })

  it('throws a clean error on a JSON-RPC error payload', async () => {
    const fetchMock: FetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = (init.body as string) ?? ''
      if (body.includes('"initialize"')) {
        return jsonResponse({ jsonrpc: '2.0', id: '1', result: { serverInfo: { name: 'Mock' } } })
      }
      return jsonResponse({ jsonrpc: '2.0', id: '1', error: { code: -32601, message: 'Method not found' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { refreshMcpServerTools } = await import('./mcpClient')
    await expect(refreshMcpServerTools(makeServer())).rejects.toThrow('MCP error: Method not found')
  })

  it('re-initializes and retries once on a stale session (404)', async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = []
    let toolCallCount = 0
    let initializeCount = 0
    const fetchMock: FetchMock = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      const headers = Object.fromEntries(new Headers(init.headers as HeadersInit).entries())
      const body = (init.body as string) ?? ''
      calls.push({ url, headers, body })

      if (body.includes('"tools/call"')) {
        if (toolCallCount === 0) {
          toolCallCount += 1
          return new Response('stale session', { status: 404 })
        }
        return jsonResponse({ jsonrpc: '2.0', id: '1', result: { content: 'done' } })
      }
      if (body.includes('"initialize"')) {
        const sessionId = initializeCount === 0 ? 'session-1' : 'session-2'
        initializeCount += 1
        return jsonResponse(
          { jsonrpc: '2.0', id: '1', result: { serverInfo: { name: 'Mock' } } },
          200,
          { 'mcp-session-id': sessionId }
        )
      }
      return new Response(null, { status: 202 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const server = makeServer()
    const { callMcpTool } = await import('./mcpClient')

    await initializeMcpServer(server)
    const result = await callMcpTool(server, { name: 'x', enabled: true }, '{}')

    expect(result.content).toBe('done')

    const toolCalls = calls.filter((call) => call.body.includes('"tools/call"'))
    expect(toolCalls).toHaveLength(2)
    // The retried request must carry the freshly negotiated session id.
    expect(toolCalls[1]?.headers['mcp-session-id']).toBe('session-2')
  })
})

describe('callMcpTool', () => {
  it('parses JSON arguments and returns text content', async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jsonrpc: '2.0',
        id: '1',
        result: { content: [{ type: 'text', text: 'hello world' }] }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await callMcpTool(
      makeServer(),
      { name: 'echo', description: 'echo', enabled: true },
      '{"value":"hi"}'
    )
    expect(result).toEqual({ content: 'hello world', isError: false })

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(sentBody.params.arguments).toEqual({ value: 'hi' })
  })

  it('falls back to { input } when arguments are not valid JSON', async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ jsonrpc: '2.0', id: '1', result: { content: 'ok' } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await callMcpTool(
      makeServer(),
      { name: 'echo', description: '', enabled: true },
      'not-json'
    )
    expect(result.content).toBe('ok')
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(sentBody.params.arguments).toEqual({ input: 'not-json' })
  })

  it('surfaces isError and structured content', async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jsonrpc: '2.0',
        id: '1',
        result: { content: [], isError: true, structuredContent: { ok: false } }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await callMcpTool(makeServer(), { name: 'fail', enabled: true }, undefined)
    expect(result.isError).toBe(true)
    expect(result.content).toContain('"ok":false')
  })
})

describe('testMcpServer', () => {
  it('reports success with a tool count', async () => {
    const fetchMock: FetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = (init.body as string) ?? ''
      if (body.includes('"tools/list"')) {
        return jsonResponse({ jsonrpc: '2.0', id: '1', result: { tools: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] } })
      }
      if (body.includes('"initialize"')) {
        return jsonResponse({ jsonrpc: '2.0', id: '1', result: { serverInfo: { name: 'Mock Server' } } })
      }
      return new Response(null, { status: 202 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await testMcpServer({ name: 'Mock', url: 'https://example.com', auth: { type: 'none' } })
    expect(result.ok).toBe(true)
    expect(result.toolCount).toBe(3)
    expect(result.message).toContain('Mock Server')
  })

  it('reports failure with a message on connection errors', async () => {
    const fetchMock: FetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await testMcpServer({ name: 'Mock', url: 'https://example.com', auth: { type: 'none' } })
    expect(result.ok).toBe(false)
    expect(result.lastError).toBe('ECONNREFUSED')
    expect(result.message).toBe('ECONNREFUSED')
  })
})