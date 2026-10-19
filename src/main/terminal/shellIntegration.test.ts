import { describe, expect, it, vi } from 'vitest'
import { classifyShell, wrapCommand } from './shellIntegration'
import { ShellStateTracker } from './sessionState'

describe('classifyShell', () => {
  it('detects PowerShell variants', () => {
    expect(classifyShell('/usr/bin/pwsh')).toBe('powershell')
    expect(classifyShell('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe')).toBe('powershell')
  })

  it('detects cmd.exe', () => {
    expect(classifyShell('C:/Windows/System32/cmd.exe')).toBe('cmd')
  })

  it('defaults to posix', () => {
    expect(classifyShell('/bin/zsh')).toBe('posix')
    expect(classifyShell('/bin/bash')).toBe('posix')
  })
})

describe('wrapCommand', () => {
  it('appends a sentinel with exit code and cwd for posix shells', () => {
    const { wrapped, token, supported } = wrapCommand('/bin/zsh', 'ls -la')
    expect(supported).toBe(true)
    expect(token).toBeTruthy()
    expect(wrapped).toContain('ls -la')
    // Control bytes must be emitted by printf at runtime, never typed raw.
    expect(wrapped).toContain("printf '\\033]1337;Covenant;")
    expect(wrapped).toContain('\\007')
    expect(wrapped).not.toContain('\u001B')
    expect(wrapped).not.toContain('\u0007')
    expect(wrapped).toContain('$?')
    expect(wrapped).toContain('$PWD')
  })

  it('emits a PowerShell sentinel with $LASTEXITCODE', () => {
    const { wrapped, supported } = wrapCommand('/usr/bin/pwsh', 'Get-ChildItem')
    expect(supported).toBe(true)
    expect(wrapped).toContain('$LASTEXITCODE')
    expect(wrapped).toContain('$PWD.Path')
  })

  it('marks cmd.exe as unsupported', () => {
    const result = wrapCommand('C:/Windows/System32/cmd.exe', 'dir')
    expect(result.supported).toBe(false)
    expect(result.token).toBe('')
    expect(result.wrapped).toBe('dir')
  })
})

describe('ShellStateTracker', () => {
  it('buffers stripped output and reads recent lines', () => {
    const tracker = new ShellStateTracker('s1', '/bin/zsh', '/start')
    tracker.feed('\u001B[32mhello\u001B[0m\nworld\n')
    expect(tracker.read(10)).toBe('hello\nworld')
  })

  it('tracks cwd from OSC 7', () => {
    const tracker = new ShellStateTracker('s1', '/bin/zsh', '/start')
    tracker.feed('prompt\u001B]7;file://host/projects/app\u0007$ ')
    expect(tracker.getState().cwd).toBe('/projects/app')
  })

  it('resolves a sentinel into exit code, cwd and notifies listeners', () => {
    const tracker = new ShellStateTracker('s1', '/bin/zsh', '/start')
    const listener = vi.fn()
    tracker.onSentinel(listener)

    tracker.markCommandStart('false')
    expect(tracker.getState().running).toBe(true)

    tracker.feed(`\u001B]1337;Covenant;tok;1;/next\u0007`)

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'tok', exitCode: 1, cwd: '/next' })
    )
    const state = tracker.getState()
    expect(state.running).toBe(false)
    expect(state.lastExitCode).toBe(1)
    expect(state.lastCommand).toBe('false')
    expect(state.cwd).toBe('/next')
  })

  it('does not leak the sentinel into the AI-facing output', () => {
    const tracker = new ShellStateTracker('s1', '/bin/zsh', '/start')
    tracker.feed('result\u001B]1337;Covenant;tok;0;/x\u0007\n')
    expect(tracker.read(10)).not.toContain('1337')
  })

  it('reads output produced after a marker', () => {
    const tracker = new ShellStateTracker('s1', '/bin/zsh', '/start')
    tracker.feed('old line\n')
    const offset = tracker.getOutputLength()
    tracker.feed('new line\n')
    expect(tracker.readSince(offset)).toBe('new line')
  })
})
