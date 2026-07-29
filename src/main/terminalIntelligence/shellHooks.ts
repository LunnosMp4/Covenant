import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

let hookDir: string | null = null

function getHookDir(): string {
  if (hookDir) return hookDir
  const dir = join(tmpdir(), 'covenant-hooks')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  hookDir = dir
  return dir
}

const BASH_HOOK = `__covenant_preexec() {
  local cmd
  printf -v cmd '%s' "$BASH_COMMAND"
  printf '\\e]1337;CovenantPreExec;%s\\a' "$(printf '%s' "$cmd" | base64 -w0 2>/dev/null || printf '%s' "$cmd" | base64)"
}
__covenant_precmd() {
  local ec=$?
  printf '\\e]1337;CovenantPostExec;%s\\a' "$(printf '%d' "$ec" | base64)"
  printf '\\e]1337;CovenantCWD;%s\\a' "$(printf '%s' "$PWD" | base64)"
}
trap '__covenant_preexec' DEBUG
PROMPT_COMMAND="__covenant_precmd\${PROMPT_COMMAND:+;\$PROMPT_COMMAND}"
`

const ZSH_HOOK = `__covenant_preexec() {
  printf '\\e]1337;CovenantPreExec;%s\\a' "$(printf '%s' "$1" | base64)"
}
__covenant_precmd() {
  printf '\\e]1337;CovenantPostExec;%s\\a' "$(printf '%d' "$?" | base64)"
  printf '\\e]1337;CovenantCWD;%s\\a' "$(printf '%s' "$PWD" | base64)"
}
autoload -Uz add-zsh-hook
add-zsh-hook preexec __covenant_preexec
add-zsh-hook precmd __covenant_precmd
`

const FISH_HOOK = `function __covenant_preexec --on-event fish_preexec
  printf '\\e]1337;CovenantPreExec;%s\\a' (echo "$argv" | base64)
end
function __covenant_postexec --on-event fish_postexec
  printf '\\e]1337;CovenantPostExec;%s\\a' (echo "$argv" | base64)
end
function __covenant_prompt --on-event fish_prompt
  printf '\\e]1337;CovenantCWD;%s\\a' (echo "$PWD" | base64)
end
`

const PW_SH_HOOK = `$Global:__CovenantLastCommand = ''
$originalCovenantPrompt = Get-Content Function:\\prompt
function global:prompt {
    $cmd = if ($Global:__CovenantLastCommand) { $Global:__CovenantLastCommand } else { '' }
    $cmdB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($cmd))
    $ec = $Global:LASTEXITCODE
    $ecB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$ec"))
    $cwdB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($PWD.Path))
    Write-Host -NoNewline "\`e]1337;CovenantPreExec;$cmdB64\`a"
    Write-Host -NoNewline "\`e]1337;CovenantPostExec;$ecB64\`a"
    Write-Host -NoNewline "\`e]1337;CovenantCWD;$cwdB64\`a"
    $Global:__CovenantLastCommand = ''
    & $originalCovenantPrompt
}
$ExecutionContext.InvokeCommand.PreCommandLookupAction = {
    $Global:__CovenantLastCommand = $MyInvocation.Line
}
`

const EXT_BY_SHELL: Record<string, string> = {
  bash: '.sh',
  sh: '.sh',
  zsh: '.zsh',
  fish: '.fish',
  pwsh: '.ps1',
  powershell: '.ps1'
}

const HOOK_BY_SHELL: Record<string, string> = {
  bash: BASH_HOOK,
  sh: BASH_HOOK,
  zsh: ZSH_HOOK,
  fish: FISH_HOOK,
  pwsh: PW_SH_HOOK,
  powershell: PW_SH_HOOK
}

export interface HookInjectionResult {
  filePath: string
  success: boolean
}

export function getShellHookScript(shellName: string): string | null {
  return HOOK_BY_SHELL[shellName] || null
}

export function writeHookFile(sessionId: string, shellName: string): HookInjectionResult | null {
  const hookScript = getShellHookScript(shellName)
  if (!hookScript) return null

  const ext = EXT_BY_SHELL[shellName] || '.sh'
  const fileName = `covenant-hook-${sessionId}${ext}`
  const filePath = join(getHookDir(), fileName)

  try {
    writeFileSync(filePath, hookScript, 'utf-8')
    return { filePath, success: true }
  } catch (err) {
    console.error(`[TerminalIntelligence] Failed to write hook file ${filePath}:`, err)
    return null
  }
}

export function getInjectCommand(shellName: string, hookFilePath: string): string | null {
  const escaped = hookFilePath.replace(/\\/g, '\\\\')

  switch (shellName) {
    case 'bash':
    case 'sh':
      return `. '${escaped}' 2>/dev/null`
    case 'zsh':
      return `. '${escaped}' 2>/dev/null`
    case 'fish':
      return `source '${escaped}' 2>/dev/null`
    case 'pwsh':
    case 'powershell':
      return `. '${escaped}' 2>` + '$null'
    default:
      return null
  }
}

export function cleanupHookFile(filePath: string): void {
  try {
    unlinkSync(filePath)
    console.debug(`[TerminalIntelligence] Cleaned up hook file: ${filePath}`)
  } catch {
    // file may already be deleted
  }
}

export function injectShellHook(
  sessionId: string,
  shellPath: string,
  writeFn: (sessionId: string, data: string) => void
): string | null {
  const shellName = extractShellName(shellPath)
  const result = writeHookFile(sessionId, shellName)
  if (!result) return null

  const injectCmd = getInjectCommand(shellName, result.filePath)
  if (!injectCmd) {
    cleanupHookFile(result.filePath)
    return null
  }

  process.nextTick(() => {
    writeFn(sessionId, injectCmd + '\n')
  })

  return result.filePath
}

function extractShellName(shellPath: string): string {
  const parts = shellPath.replace(/\\/g, '/').split('/')
  const last = parts[parts.length - 1] || shellPath
  return last.replace('.exe', '').replace('.Exe', '').toLowerCase()
}
