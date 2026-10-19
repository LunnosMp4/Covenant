import { describe, expect, it } from 'vitest'
import { buildTerminalContext } from './terminalContext'
import type { TerminalSessionState } from '../../../shared/terminal/terminal'

const state: TerminalSessionState = {
  sessionId: 's1',
  shell: 'zsh',
  cwd: '/Users/loic/project',
  lastCommand: 'npm test',
  lastExitCode: 1,
  running: false,
  updatedAt: 0
}

describe('buildTerminalContext', () => {
  it('includes shell, cwd, last command and exit code', () => {
    const context = buildTerminalContext(state, 'FAIL src/app.test.ts')
    expect(context).toContain('Shell: zsh')
    expect(context).toContain('Working directory: /Users/loic/project')
    expect(context).toContain('Last command: npm test')
    expect(context).toContain('Last exit code: 1')
    expect(context).toContain('FAIL src/app.test.ts')
  })

  it('omits the output fence when there is no output', () => {
    const context = buildTerminalContext(state, '   ')
    expect(context).not.toContain('Recent terminal output')
  })

  it('still returns a preamble without a session', () => {
    const context = buildTerminalContext(null, '')
    expect(context).toContain('embedded directly inside')
    expect(context).not.toContain('Shell:')
  })

  it('truncates very long output, keeping the tail', () => {
    const long = `${'x'.repeat(7000)}TAIL`
    const context = buildTerminalContext(state, long)
    expect(context).toContain('TAIL')
    expect(context.length).toBeLessThan(6500)
  })
})
