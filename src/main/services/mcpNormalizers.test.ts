import { describe, expect, it } from 'vitest'
import {
  normalizeMcpAuth,
  normalizeMcpHeaders,
  normalizeMcpTools,
  normalizeStoredMcpServer,
  normalizeStoredMcpServers
} from './mcpNormalizers'

describe('normalizeMcpHeaders', () => {
  it('returns empty array for non-array input', () => {
    expect(normalizeMcpHeaders(undefined)).toEqual([])
    expect(normalizeMcpHeaders('x')).toEqual([])
  })

  it('trims valid headers and drops nameless ones', () => {
    const result = normalizeMcpHeaders([
      { name: ' X-Api-Key ', value: ' secret ' },
      { name: '  ', value: 'ignored' },
      { name: 'Authorization', value: '' }
    ])
    expect(result).toEqual([
      { name: 'X-Api-Key', value: 'secret' },
      { name: 'Authorization', value: '' }
    ])
  })
})

describe('normalizeMcpAuth', () => {
  it('defaults to none for missing input', () => {
    expect(normalizeMcpAuth(undefined)).toEqual({ type: 'none' })
    expect(normalizeMcpAuth('x')).toEqual({ type: 'none' })
  })

  it('normalizes access token auth', () => {
    expect(normalizeMcpAuth({ type: 'accessToken', token: ' tok ' })).toEqual({
      type: 'accessToken',
      token: 'tok'
    })
  })

  it('normalizes custom header auth', () => {
    const result = normalizeMcpAuth({
      type: 'customHeaders',
      headers: [{ name: 'X-Token', value: 'abc' }]
    })
    expect(result).toEqual({ type: 'customHeaders', headers: [{ name: 'X-Token', value: 'abc' }] })
  })
})

describe('normalizeMcpTools', () => {
  it('returns empty array for non-array input', () => {
    expect(normalizeMcpTools(undefined)).toEqual([])
  })

  it('keeps valid tools, drops nameless ones, and defaults enabled', () => {
    const result = normalizeMcpTools([
      { name: ' read_file ', description: 'Read a file', inputSchema: { type: 'object' } },
      { name: '  ', description: 'no name' },
      'not-an-object'
    ])
    expect(result).toEqual([
      {
        name: 'read_file',
        description: 'Read a file',
        inputSchema: { type: 'object' },
        enabled: true
      }
    ])
  })

  it('preserves explicit enabled flags', () => {
    const result = normalizeMcpTools([{ name: 'x', enabled: false }])
    expect(result[0]?.enabled).toBe(false)
  })
})

describe('normalizeStoredMcpServer', () => {
  it('returns null for missing/invalid servers', () => {
    expect(normalizeStoredMcpServer(undefined)).toBeNull()
    expect(normalizeStoredMcpServer({ name: 'x' })).toBeNull()
    expect(normalizeStoredMcpServer({ url: 'http://x' })).toBeNull()
  })

  it('generates an id when missing', () => {
    const result = normalizeStoredMcpServer({ name: 'Tools', url: ' http://mcp.local ' })
    expect(result?.id).toBeDefined()
    expect(result?.name).toBe('Tools')
    expect(result?.url).toBe('http://mcp.local')
    expect(result?.active).toBe(false)
    expect(result?.tools).toEqual([])
    expect(result?.auth).toEqual({ type: 'none' })
  })

  it('normalizes nested auth and tools', () => {
    const result = normalizeStoredMcpServer({
      id: 's1',
      name: 'Tools',
      url: 'http://mcp.local',
      auth: { type: 'accessToken', token: 'abc' },
      tools: [{ name: 't', description: 'd', enabled: true }]
    })
    expect(result?.auth).toEqual({ type: 'accessToken', token: 'abc' })
    expect(result?.tools?.[0]?.enabled).toBe(true)
  })
})

describe('normalizeStoredMcpServers', () => {
  it('returns empty array for non-array input', () => {
    expect(normalizeStoredMcpServers(undefined)).toEqual([])
  })

  it('filters out invalid servers', () => {
    const result = normalizeStoredMcpServers([{ name: 'ok', url: 'http://ok' }, { name: 'bad' }])
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('ok')
  })
})