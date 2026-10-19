import {
  isDestructiveCommand,
  TERMINAL_TOOL_NAMES,
  truncateTerminalOutput
} from '../../shared/terminal/tools'
import type { TerminalCommandResult } from '../../shared/terminal/terminal'
import type { BuiltinToolHandler, BuiltinToolResult } from '../services/builtinTools'
import { terminalManager } from '../terminalManager'
import { isCommandAlwaysAllowed, requestTerminalApproval } from './approval'

function parseArguments(rawArguments: string): Record<string, unknown> {
  if (!rawArguments.trim()) return {}
  try {
    const parsed = JSON.parse(rawArguments) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function errorResult(message: string): BuiltinToolResult {
  return { content: message, isError: true }
}

function formatCommandResult(result: TerminalCommandResult): string {
  const lines = [
    `exit_code: ${result.exitCode ?? 'unknown'}`,
    `cwd: ${result.cwd || 'unknown'}`
  ]
  if (result.error) {
    lines.push(`error: ${result.error}`)
  }
  const output = truncateTerminalOutput(result.output)
  lines.push('output:', output || '(no output)')
  return lines.join('\n')
}

export function createTerminalToolHandlers(sessionId: string): BuiltinToolHandler[] {
  return [
    {
      name: TERMINAL_TOOL_NAMES.getState,
      async execute(): Promise<BuiltinToolResult> {
        const state = terminalManager.getState(sessionId)
        if (!state) {
          return errorResult('The terminal session is no longer available.')
        }
        return { content: JSON.stringify(state), isError: false }
      }
    },
    {
      name: TERMINAL_TOOL_NAMES.read,
      async execute(rawArguments): Promise<BuiltinToolResult> {
        const args = parseArguments(rawArguments)
        const rawLines = args.lines
        const lines =
          typeof rawLines === 'number' && Number.isFinite(rawLines)
            ? Math.min(400, Math.max(1, Math.floor(rawLines)))
            : 80
        const output = terminalManager.readOutput(sessionId, lines)
        return { content: output || '(no output)', isError: false }
      }
    },
    {
      name: TERMINAL_TOOL_NAMES.run,
      async execute(rawArguments, ctx): Promise<BuiltinToolResult> {
        if (ctx.signal.aborted) {
          return errorResult('The request was cancelled.')
        }

        const args = parseArguments(rawArguments)
        const command = typeof args.command === 'string' ? args.command.trim() : ''
        const reason = typeof args.reason === 'string' ? args.reason.trim() : undefined

        if (!command) {
          return errorResult('A command is required.')
        }
        if (/[\r\n]/.test(command)) {
          return errorResult('Only single-line commands are supported.')
        }
        if (command.length > 4000) {
          return errorResult('The command is too long.')
        }

        const state = terminalManager.getState(sessionId)
        if (!state) {
          return errorResult('The terminal session is no longer available.')
        }
        if (state.running) {
          return errorResult(
            'The shell is currently busy running another command. Wait for it to finish or ask the user to stop it.'
          )
        }

        const destructive = isDestructiveCommand(command)
        const alreadyAllowed = !destructive && isCommandAlwaysAllowed(sessionId, command)

        if (!alreadyAllowed) {
          const reply = await requestTerminalApproval({
            sender: ctx.sender,
            signal: ctx.signal,
            sessionId,
            command,
            reason,
            destructive,
            cwd: state.cwd
          })

          if (reply === 'reject') {
            return errorResult('The user denied this command.')
          }
        }

        const result = await terminalManager.runCommand(sessionId, command)
        return {
          content: formatCommandResult(result),
          isError: !result.success || (result.exitCode != null && result.exitCode !== 0)
        }
      }
    }
  ]
}
