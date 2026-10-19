// Lightweight parsing of the PTY byte stream. We never feed the stripped text
// back to xterm (it keeps the raw stream); stripping is only for the AI-facing
// state model and the ring buffer.

// Matches CSI / OSC / other escape sequences (based on the widely used
// `ansi-regex`). Removes SGR colors as well as OSC (BEL or ST terminated).
const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, '')
}

// OSC 7 reports the shell's working directory: `ESC ] 7 ; file://<host><path> BEL|ST`.
const OSC7_PATTERN = /\u001B\]7;file:\/\/[^\u0007\u001B]*?(\/[^\u0007\u001B]*)(?:\u0007|\u001B\\)/
const OSC7_PATTERN_GLOBAL = new RegExp(OSC7_PATTERN.source, 'g')

export function extractOsc7Cwd(input: string): string | null {
  const match = OSC7_PATTERN.exec(input)
  if (!match) return null
  return decodeCwd(match[1])
}

export function extractAllOsc7Cwd(input: string): string[] {
  const results: string[] = []
  let match: RegExpExecArray | null
  OSC7_PATTERN_GLOBAL.lastIndex = 0
  while ((match = OSC7_PATTERN_GLOBAL.exec(input)) !== null) {
    results.push(decodeCwd(match[1]))
  }
  return results
}

function decodeCwd(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

// Sentinel emitted by agent-issued commands (see shellIntegration.ts). Carries
// the command token, its exit code, and the resulting cwd.
export const TERMINAL_SENTINEL_OSC = '\u001B]1337;Covenant;'
const SENTINEL_PATTERN =
  /\u001B\]1337;Covenant;([^;\u0007\u001B]+);(-?\d+);([^\u0007\u001B]*)(?:\u0007|\u001B\\)/

export interface SentinelMatch {
  token: string
  exitCode: number
  cwd: string
  raw: string
}

export function extractSentinel(input: string): SentinelMatch | null {
  const match = SENTINEL_PATTERN.exec(input)
  if (!match) return null
  return {
    token: match[1],
    exitCode: Number.parseInt(match[2], 10),
    cwd: decodeCwd(match[3]),
    raw: match[0]
  }
}
