import { randomUUID } from 'crypto'

export type ShellKind = 'powershell' | 'cmd' | 'posix'

export interface WrappedCommand {
  /** Full command line to write to the PTY (without the trailing Enter). */
  wrapped: string
  /** Sentinel token, or empty string when the shell cannot emit one. */
  token: string
  /** False for shells where we cannot reliably detect completion (cmd.exe). */
  supported: boolean
}

const SHELL_NAME_PATTERN = /[^/\\]+$/

export function classifyShell(shellPath: string): ShellKind {
  const name = (SHELL_NAME_PATTERN.exec(shellPath)?.[0] ?? shellPath).toLowerCase()
  if (name.startsWith('pwsh') || name.startsWith('powershell')) return 'powershell'
  if (name.startsWith('cmd')) return 'cmd'
  return 'posix'
}

/**
 * Wraps a command so it emits an OSC sentinel carrying `<token>;<exit>;<cwd>`
 * after it finishes. This lets the main process know exactly when the command
 * completed and with what exit code, without modifying the user's shell config.
 */
export function wrapCommand(shellPath: string, command: string): WrappedCommand {
  const token = randomUUID()
  const kind = classifyShell(shellPath)

  if (kind === 'posix') {
    // IMPORTANT: keep the input line printable. Raw ESC/BEL bytes typed into a
    // shell are interpreted by the line editor (ZLE/readline) and break the
    // quoted string, so let printf emit the control bytes at execution time.
    const wrapped = `${command} ; printf '\\033]1337;Covenant;%s;%s;%s\\007' '${token}' "$?" "$PWD"`
    return { wrapped, token, supported: true }
  }

  if (kind === 'powershell') {
    const wrapped = [
      `${command};`,
      '$__covEc = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 };',
      `[Console]::Write(([char]27 + "]1337;Covenant;${token};$__covEc;$($PWD.Path)" + [char]7))`
    ].join(' ')
    return { wrapped, token, supported: true }
  }

  // cmd.exe: no reliable, side-effect-free way to report completion.
  return { wrapped: command, token: '', supported: false }
}

/** Shell-specific line ending used to submit a command to the PTY. */
export function commandTerminator(_shellPath: string): string {
  return '\r'
}
