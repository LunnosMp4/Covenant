export const MAX_TERMINAL_INPUT_CHUNK = 8192
export const DEFAULT_TERMINAL_COLS = 120
export const DEFAULT_TERMINAL_ROWS = 30
export const MIN_TERMINAL_COLS = 20
export const MAX_TERMINAL_COLS = 400
export const MIN_TERMINAL_ROWS = 5
export const MAX_TERMINAL_ROWS = 200

export function sanitizeTerminalDimension(
  rawValue: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return fallback
  }

  const integerValue = Math.floor(rawValue)
  return Math.min(max, Math.max(min, integerValue))
}

export function sanitizeTerminalInput(rawInput: unknown): string {
  if (typeof rawInput !== 'string' || !rawInput) {
    return ''
  }

  if (rawInput.length <= MAX_TERMINAL_INPUT_CHUNK) {
    return rawInput
  }

  return rawInput.slice(0, MAX_TERMINAL_INPUT_CHUNK)
}