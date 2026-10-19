import type { TerminalSessionState } from '../../../shared/terminal/terminal'

const MAX_CONTEXT_OUTPUT_CHARS = 6000

/**
 * Builds the developer/system preamble that gives the assistant awareness of
 * the linked terminal session. Injected at send time; never persisted.
 */
export function buildTerminalContext(
  state: TerminalSessionState | null,
  output: string
): string {
  const lines = [
    'You are Covenant, an AI assistant embedded directly inside the user\'s terminal.',
    'Help with shell commands, debugging, and system tasks. Be concise and concrete.',
    'Rely on the terminal context below; never fabricate command output.',
    'Prefer safe, reversible commands and clearly flag anything destructive.'
  ]

  if (state) {
    const context: string[] = [
      `- Shell: ${state.shell}`,
      `- Working directory: ${state.cwd || '(unknown)'}`,
      `- Last command: ${state.lastCommand ?? '(none)'}`,
      `- Last exit code: ${state.lastExitCode ?? '(unknown)'}`,
      `- Currently running: ${state.running ? 'yes' : 'no'}`
    ]
    lines.push('', 'Terminal context:', ...context)
  }

  const trimmed = output.trim()
  if (trimmed) {
    const bounded =
      trimmed.length > MAX_CONTEXT_OUTPUT_CHARS
        ? trimmed.slice(-MAX_CONTEXT_OUTPUT_CHARS)
        : trimmed
    lines.push('', 'Recent terminal output:', '```', bounded, '```')
  }

  return lines.join('\n')
}
