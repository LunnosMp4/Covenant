import { describe, expect, it } from 'vitest'
import {
  formatModelSelector,
  normalizeCodePermissions,
  normalizeCodeProject,
  normalizeCodeProjects,
  normalizeCodeSettings,
  parseModelSelector
} from './codeNormalizers'
import {
  CODE_PROVIDER_ID,
  DEFAULT_CODE_PERMISSIONS,
  DEFAULT_CODE_SETTINGS
} from './code'

describe('normalizeCodePermissions', () => {
  it('falls back to defaults for invalid input', () => {
    expect(normalizeCodePermissions(undefined)).toEqual(DEFAULT_CODE_PERMISSIONS)
    expect(normalizeCodePermissions({ edit: 'nope' }).edit).toBe('ask')
  })

  it('keeps valid effects', () => {
    expect(normalizeCodePermissions({ bash: 'deny', webfetch: 'ask' })).toMatchObject({
      bash: 'deny',
      webfetch: 'ask'
    })
  })
})

describe('normalizeCodeSettings', () => {
  it('returns defaults for junk', () => {
    const result = normalizeCodeSettings(null)
    expect(result.autoStart).toBe(DEFAULT_CODE_SETTINGS.autoStart)
    expect(result.permission).toEqual(DEFAULT_CODE_PERMISSIONS)
  })

  it('clamps ports and trims model', () => {
    expect(normalizeCodeSettings({ serverPort: 99999 }).serverPort).toBe(0)
    expect(normalizeCodeSettings({ serverPort: 4096 }).serverPort).toBe(4096)
    expect(normalizeCodeSettings({ defaultModel: '  opencode-go/kimi-k3 ' }).defaultModel).toBe(
      'opencode-go/kimi-k3'
    )
  })
})

describe('normalizeCodeProject', () => {
  it('rejects empty directories', () => {
    expect(normalizeCodeProject({ directory: '   ' })).toBeNull()
    expect(normalizeCodeProject('nope')).toBeNull()
  })

  it('derives a name from the directory', () => {
    const project = normalizeCodeProject({ directory: 'C:\\code\\my-app\\' })
    expect(project?.name).toBe('my-app')
  })

  it('normalizeCodeProjects filters invalid entries', () => {
    expect(normalizeCodeProjects([{ directory: '/a' }, { directory: '' }, 5])).toHaveLength(1)
  })
})

describe('model selector', () => {
  it('parses provider/model#variant', () => {
    expect(parseModelSelector('opencode-go/kimi-k3#high')).toEqual({
      providerID: 'opencode-go',
      id: 'kimi-k3',
      variant: 'high'
    })
  })

  it('defaults to the go provider', () => {
    expect(parseModelSelector('')).toEqual({ providerID: CODE_PROVIDER_ID, id: '' })
    expect(parseModelSelector('gpt-5.6-luna')).toEqual({
      providerID: CODE_PROVIDER_ID,
      id: 'gpt-5.6-luna',
      variant: undefined
    })
  })

  it('round-trips through formatModelSelector', () => {
    const ref = parseModelSelector('opencode-go/kimi-k3#high')
    expect(formatModelSelector(ref)).toBe('opencode-go/kimi-k3#high')
  })
})
