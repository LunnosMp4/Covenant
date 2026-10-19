export interface TerminalToolDefinition {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
}

export const TERMINAL_TOOL_NAMES = {
  getState: 'terminal_get_state',
  read: 'terminal_read',
  run: 'terminal_run'
} as const

export const MAX_TERMINAL_TOOL_OUTPUT = 6000

export const TERMINAL_TOOL_INSTRUCTIONS = [
  "You have direct access to the user's live terminal session.",
  '- Use terminal_get_state and terminal_read to inspect the shell before guessing.',
  '- Use terminal_run to execute a single-line command. The user must approve it first.',
  '- Prefer safe, reversible commands. Explain destructive commands before proposing them.',
  '- Never claim a command succeeded unless the tool result confirms it.'
].join('\n')

export function buildTerminalToolDefinitions(): TerminalToolDefinition[] {
  return [
    {
      type: 'function',
      name: TERMINAL_TOOL_NAMES.getState,
      description:
        "Get the linked terminal's shell, current working directory, last command, last exit code, and whether a command is running. Read-only.",
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: TERMINAL_TOOL_NAMES.read,
      description:
        'Read the most recent ANSI-stripped output from the linked terminal. Read-only.',
      parameters: {
        type: 'object',
        properties: {
          lines: {
            type: 'integer',
            minimum: 1,
            maximum: 400,
            description: 'How many recent lines to return (default 80).'
          }
        },
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: TERMINAL_TOOL_NAMES.run,
      description:
        'Run a single-line shell command in the linked terminal and return its exit code, resulting cwd, and output. Requires user approval.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The single-line shell command to execute.'
          },
          reason: {
            type: 'string',
            description: 'Short explanation shown to the user in the approval prompt.'
          }
        },
        required: ['command'],
        additionalProperties: false
      }
    }
  ]
}

// Commands that always warrant an explicit re-confirmation, even after the user
// chose "always allow" for the same exact string.
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f|\brm\s+-[a-zA-Z]*f[a-zA-Z]*r/i,
  /\brm\s+-rf?\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[a-zA-Z]*f/i,
  /\bmkfs(\.|\s)/i,
  /\bdd\s+if=/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\bchmod\s+-R\s+777\s+\//i,
  /\bchown\s+-R\b/i,
  /:\s*\(\s*\)\s*\{/,
  /\b(del|erase)\s+\/[fsq]/i,
  /\bformat\s+[a-z]:/i,
  /\bRemove-Item\b.*-Recurse/i,
  /\b(Stop-Computer|Restart-Computer)\b/i,
  />\s*\/dev\/sd/i
]

export function isDestructiveCommand(command: string): boolean {
  const normalized = command.trim()
  if (!normalized) return false
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function truncateTerminalOutput(
  content: string,
  maxLength = MAX_TERMINAL_TOOL_OUTPUT
): string {
  const trimmed = content.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength)}\n… (truncated)`
}
