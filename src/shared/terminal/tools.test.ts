import { describe, expect, it } from 'vitest'
import {
  buildTerminalToolDefinitions,
  isDestructiveCommand,
  TERMINAL_TOOL_NAMES,
  truncateTerminalOutput
} from './tools'

describe('buildTerminalToolDefinitions', () => {
  it('exposes state, read and run tools', () => {
    const names = buildTerminalToolDefinitions().map((tool) => tool.name)
    expect(names).toEqual([
      TERMINAL_TOOL_NAMES.getState,
      TERMINAL_TOOL_NAMES.read,
      TERMINAL_TOOL_NAMES.run
    ])
  })

  it('marks the run tool as a function call requiring a command', () => {
    const run = buildTerminalToolDefinitions().find(
      (tool) => tool.name === TERMINAL_TOOL_NAMES.run
    )
    expect(run?.type).toBe('function')
    expect(run?.parameters).toMatchObject({
      type: 'object',
      required: ['command'],
      additionalProperties: false
    })
  })
})

describe('isDestructiveCommand', () => {
  it.each([
    'rm -rf /',
    'rm -rf node_modules',
    'git reset --hard HEAD~1',
    'git clean -fd',
    'mkfs.ext4 /dev/sda1',
    'dd if=/dev/zero of=/dev/sda',
    'shutdown -h now',
    'chmod -R 777 /',
    'Remove-Item -Recurse -Force C:\\temp'
  ])('flags %s', (command) => {
    expect(isDestructiveCommand(command)).toBe(true)
  })

  it.each(['ls -la', 'npm test', 'git status', 'echo hi', 'cd src'])(
    'does not flag %s',
    (command) => {
      expect(isDestructiveCommand(command)).toBe(false)
    }
  )

  it('ignores empty input', () => {
    expect(isDestructiveCommand('   ')).toBe(false)
  })
})

describe('truncateTerminalOutput', () => {
  it('keeps short output intact', () => {
    expect(truncateTerminalOutput('  hello  ')).toBe('hello')
  })

  it('truncates long output and marks it', () => {
    const result = truncateTerminalOutput('x'.repeat(50), 10)
    expect(result.startsWith('x'.repeat(10))).toBe(true)
    expect(result).toContain('truncated')
  })
})
