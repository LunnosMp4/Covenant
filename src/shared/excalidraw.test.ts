import { describe, expect, it } from 'vitest'
import type { ReasoningStep } from './chat'
import {
  collectExcalidrawCheckpoints,
  extractExcalidrawCheckpointId,
  isExcalidrawCreateViewStep,
  sanitizeCheckpointId
} from './excalidraw'

describe('sanitizeCheckpointId', () => {
  it('accepts url-safe checkpoint ids', () => {
    expect(sanitizeCheckpointId('a1b2c3d4e5f6g7h8')).toBe('a1b2c3d4e5f6g7h8')
    expect(sanitizeCheckpointId('Cp_123-abc')).toBe('Cp_123-abc')
  })

  it('rejects short, empty, or unsafe values', () => {
    expect(sanitizeCheckpointId('abc')).toBeNull()
    expect(sanitizeCheckpointId('')).toBeNull()
    expect(sanitizeCheckpointId('has space')).toBeNull()
    expect(sanitizeCheckpointId('drop;table')).toBeNull()
    expect(sanitizeCheckpointId(42)).toBeNull()
  })
})

describe('extractExcalidrawCheckpointId', () => {
  it('extracts from structuredContent JSON', () => {
    const content = JSON.stringify({ checkpointId: 'a1b2c3d4e5f6g7h8' })
    expect(extractExcalidrawCheckpointId(content)).toBe('a1b2c3d4e5f6g7h8')
  })

  it('extracts from a nested structuredContent object', () => {
    const content = JSON.stringify({
      structuredContent: { checkpointId: 'abcdef123456' }
    })
    expect(extractExcalidrawCheckpointId(content)).toBe('abcdef123456')
  })

  it('extracts from the human readable tool text', () => {
    const content = 'Diagram displayed! Checkpoint id: "abcdef123456".\nHave fun.'
    expect(extractExcalidrawCheckpointId(content)).toBe('abcdef123456')
  })

  it('extracts a checkpoint id from arbitrary text', () => {
    expect(extractExcalidrawCheckpointId('saved checkpointId: "zyxwvu987654"')).toBe(
      'zyxwvu987654'
    )
  })

  it('returns null for unrelated content', () => {
    expect(extractExcalidrawCheckpointId('no diagram here')).toBeNull()
    expect(extractExcalidrawCheckpointId(undefined)).toBeNull()
    expect(extractExcalidrawCheckpointId('')).toBeNull()
  })
})

describe('isExcalidrawCreateViewStep', () => {
  const base = {
    type: 'tool' as const,
    id: 'tool-1',
    status: 'done' as const
  }

  it('matches create_view by name or qualified query', () => {
    expect(isExcalidrawCreateViewStep({ ...base, name: 'Excalidraw › create_view' })).toBe(true)
    expect(isExcalidrawCreateViewStep({ ...base, name: 'x', query: 'mcp_excalidraw_create_view' })).toBe(
      true
    )
  })

  it('ignores unrelated tools and non-tool steps', () => {
    expect(isExcalidrawCreateViewStep({ ...base, name: 'read_checkpoint' })).toBe(false)
    expect(isExcalidrawCreateViewStep({ type: 'reasoning', text: 'hi' })).toBe(false)
  })
})

describe('collectExcalidrawCheckpoints', () => {
  it('collects, dedupes, and carries the server id', () => {
    const steps: ReasoningStep[] = [
      {
        type: 'tool',
        id: 't1',
        name: 'Excalidraw › create_view',
        serverId: 'server-1',
        status: 'done',
        content: JSON.stringify({ checkpointId: 'abcdef123456' })
      },
      {
        type: 'tool',
        id: 't2',
        name: 'Excalidraw › create_view',
        serverId: 'server-1',
        status: 'done',
        content: 'Checkpoint id: "abcdef123456"'
      },
      {
        type: 'tool',
        id: 't3',
        name: 'Other › tool',
        status: 'done',
        content: JSON.stringify({ checkpointId: 'zzzzzz999999' })
      }
    ]

    expect(collectExcalidrawCheckpoints(steps)).toEqual([
      { checkpointId: 'abcdef123456', serverId: 'server-1' }
    ])
  })

  it('skips errored create_view steps', () => {
    const steps: ReasoningStep[] = [
      {
        type: 'tool',
        id: 't1',
        name: 'Excalidraw › create_view',
        status: 'error',
        content: JSON.stringify({ checkpointId: 'abcdef123456' })
      }
    ]
    expect(collectExcalidrawCheckpoints(steps)).toEqual([])
  })
})
