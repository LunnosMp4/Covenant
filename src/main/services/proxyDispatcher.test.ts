import { afterAll, describe, expect, it } from 'vitest'
import {
  createAgentDispatcher,
  createProxyDispatcher,
  disposeProxyDispatchers
} from './proxyDispatcher'

afterAll(async () => {
  await disposeProxyDispatchers()
})

describe('proxyDispatcher', () => {
  it('returns no dispatcher for a direct connection', async () => {
    await expect(createProxyDispatcher(undefined)).resolves.toBeUndefined()
    await expect(createProxyDispatcher('')).resolves.toBeUndefined()
  })

  it('reuses one dispatcher (and its socket pool) per proxy URL', async () => {
    const first = await createProxyDispatcher('http://127.0.0.1:9')
    const second = await createProxyDispatcher('http://127.0.0.1:9')
    const other = await createProxyDispatcher('http://127.0.0.1:10')

    expect(first).toBeDefined()
    expect(second).toBe(first)
    expect(other).not.toBe(first)
  })

  it('reuses the loopback agent for identical options', async () => {
    const options = { connect: { rejectUnauthorized: false } } as const
    const first = await createAgentDispatcher(options)
    const second = await createAgentDispatcher(options)
    expect(second).toBe(first)
  })
})
