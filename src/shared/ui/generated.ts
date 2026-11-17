/**
 * Generated-surface contract (the sandboxed HTML/CSS/JS path).
 *
 * Structural validation lives here so both the main process and tests can use
 * it. Markup/CSS/token checks live in `src/main/ui/generatedValidation.ts`,
 * because they run against parsed trees. Neither layer is a security boundary:
 * the isolated, opaque-origin iframe is.
 */

export const GENERATED_BRIDGE_VERSION = 'covenant-generated-v1'

export const GENERATED_LIMITS = {
  maxTitleLength: 160,
  maxHtmlLength: 24_576,
  maxCssLength: 12_288,
  maxJavascriptLength: 32_768,
  maxFallbackLength: 8_192,
  maxStateCharacters: 16_384,
  maxHtmlNodes: 1_500,
  maxHtmlDepth: 40,
  maxFields: 6,
  minHeight: 160,
  defaultHeight: 320,
  maxHeight: 480,
  maxMessageRatePerSecond: 120,
  startupTimeoutMs: 5_000,
  renderTimeoutMs: 30_000
} as const

export const GENERATED_MESSAGE = {
  ready: 'ready',
  rendered: 'rendered',
  initialize: 'initialize',
  context: 'context',
  resize: 'resize',
  state: 'state',
  submit: 'submit',
  charts: 'charts',
  export: 'export',
  error: 'error'
} as const

export type GeneratedMessageType = (typeof GENERATED_MESSAGE)[keyof typeof GENERATED_MESSAGE]

export interface GeneratedField {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'boolean'
  required?: boolean
  options?: string[]
  min?: number
  max?: number
}

export interface GeneratedSource {
  title: string
  html: string
  css?: string
  javascript?: string
  /** Required readable answer when the frame fails or cannot run. */
  fallback: string
  height?: number
  fields?: GeneratedField[]
}

export interface GeneratedThemeContext {
  mode: 'dark' | 'light'
  fontFamily: string
  tokens: Record<string, string>
}

const FIELD_TYPES: readonly GeneratedField['type'][] = ['text', 'number', 'select', 'boolean']

const RESERVED_FIELD_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf'
])

export function clampGeneratedHeight(height: number | undefined): number {
  if (typeof height !== 'number' || !Number.isFinite(height)) {
    return GENERATED_LIMITS.defaultHeight
  }
  return Math.round(
    Math.min(GENERATED_LIMITS.maxHeight, Math.max(GENERATED_LIMITS.minHeight, height))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateGeneratedSource(value: unknown, path = 'generated'): string[] {
  if (!isRecord(value)) return [`${path}: expected an object`]

  const issues: string[] = []
  const { title, html, css, javascript, fallback, height, fields } = value

  if (
    typeof title !== 'string' ||
    title.trim().length === 0 ||
    title.length > GENERATED_LIMITS.maxTitleLength
  ) {
    issues.push(`${path}/title: 1-${GENERATED_LIMITS.maxTitleLength} characters required`)
  }

  if (typeof html !== 'string' || html.trim().length === 0) {
    issues.push(`${path}/html: required`)
  } else if (html.length > GENERATED_LIMITS.maxHtmlLength) {
    issues.push(`${path}/html: at most ${GENERATED_LIMITS.maxHtmlLength} characters`)
  }

  if (css !== undefined) {
    if (typeof css !== 'string') {
      issues.push(`${path}/css: expected a string`)
    } else if (css.length > GENERATED_LIMITS.maxCssLength) {
      issues.push(`${path}/css: at most ${GENERATED_LIMITS.maxCssLength} characters`)
    }
  }

  if (javascript !== undefined) {
    if (typeof javascript !== 'string') {
      issues.push(`${path}/javascript: expected a string`)
    } else if (javascript.length > GENERATED_LIMITS.maxJavascriptLength) {
      issues.push(`${path}/javascript: at most ${GENERATED_LIMITS.maxJavascriptLength} characters`)
    }
  }

  if (
    typeof fallback !== 'string' ||
    fallback.trim().length === 0 ||
    fallback.length > GENERATED_LIMITS.maxFallbackLength
  ) {
    issues.push(
      `${path}/fallback: a readable 1-${GENERATED_LIMITS.maxFallbackLength} character text summary is required`
    )
  }

  if (height !== undefined && (typeof height !== 'number' || !Number.isFinite(height))) {
    issues.push(`${path}/height: expected a number of pixels`)
  }

  if (fields !== undefined) {
    if (!Array.isArray(fields)) {
      issues.push(`${path}/fields: expected an array`)
    } else if (fields.length > GENERATED_LIMITS.maxFields) {
      issues.push(`${path}/fields: at most ${GENERATED_LIMITS.maxFields} fields`)
    } else {
      const names = new Set<string>()
      fields.forEach((field, index) => {
        if (!isRecord(field)) {
          issues.push(`${path}/fields/${index}: expected an object`)
          return
        }
        const name = field.name
        if (typeof name !== 'string' || !name.trim()) {
          issues.push(`${path}/fields/${index}/name: required`)
        } else if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(name)) {
          issues.push(`${path}/fields/${index}/name: use letters, digits and underscores`)
        } else if (RESERVED_FIELD_NAMES.has(name)) {
          issues.push(`${path}/fields/${index}/name: "${name}" is reserved`)
        } else if (names.has(name)) {
          issues.push(`${path}/fields/${index}/name: duplicate field "${name}"`)
        } else {
          names.add(name)
        }

        if (typeof field.label !== 'string' || !field.label.trim()) {
          issues.push(`${path}/fields/${index}/label: required`)
        }

        if (typeof field.type !== 'string' || !FIELD_TYPES.includes(field.type as GeneratedField['type'])) {
          issues.push(`${path}/fields/${index}/type: must be one of ${FIELD_TYPES.join(', ')}`)
          return
        }

        if (field.type === 'select') {
          const options = field.options
          if (!Array.isArray(options) || options.length === 0) {
            issues.push(`${path}/fields/${index}/options: a select needs at least one option`)
          } else if (options.some((option) => typeof option !== 'string' || !option.trim())) {
            issues.push(`${path}/fields/${index}/options: options must be non-empty strings`)
          } else if (new Set(options).size !== options.length) {
            issues.push(`${path}/fields/${index}/options: duplicate option`)
          }
        }

        if (field.type === 'number') {
          if (field.min !== undefined && typeof field.min !== 'number') {
            issues.push(`${path}/fields/${index}/min: expected a number`)
          }
          if (field.max !== undefined && typeof field.max !== 'number') {
            issues.push(`${path}/fields/${index}/max: expected a number`)
          }
        }
      })
    }
  }

  return issues
}

export function isGeneratedSource(value: unknown): value is GeneratedSource {
  return validateGeneratedSource(value).length === 0
}

/** Bounded JSON only: no functions, DOM nodes, or unbounded arrays. */
export function isGeneratedState(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  try {
    const serialized = JSON.stringify(value)
    return typeof serialized === 'string' && serialized.length <= GENERATED_LIMITS.maxStateCharacters
  } catch {
    return false
  }
}

export function clampGeneratedState(
  value: unknown
): Record<string, unknown> | undefined {
  if (!isGeneratedState(value)) return undefined
  try {
    const cloned = JSON.parse(JSON.stringify(value)) as unknown
    return isRecord(cloned) ? cloned : undefined
  } catch {
    return undefined
  }
}
