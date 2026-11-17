/**
 * Structural and semantic validation for declarative UI specs.
 *
 * This is the trust gate: nothing reaches the renderer unless it passes here.
 * Errors are short and actionable so the model can repair a spec in one round.
 */

import { validateChartData } from './chart'
import { validateGeneratedSource } from './generated'
import {
  UI_LIMITS,
  UI_NODE_TYPES,
  UI_SPEC_VERSION,
  type UiNodeType,
  type UiPart,
  type UiSpec,
  type UiSurface
} from './spec'

export type UiValidationResult =
  | { ok: true; spec: UiSpec }
  | { ok: false; issues: string[] }

const RESERVED_IDS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty'
])

const ALLOWED_KEYS = new Set(['type', 'props'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function text(value: unknown, path: string, max: number, issues: string[]): boolean {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path}: a non-empty string is required`)
    return false
  }
  if (value.length > max) {
    issues.push(`${path}: at most ${max} characters`)
    return false
  }
  return true
}

function optionalText(value: unknown, path: string, max: number, issues: string[]): void {
  if (value === undefined) return
  if (typeof value !== 'string') {
    issues.push(`${path}: expected a string`)
    return
  }
  if (value.length > max) {
    issues.push(`${path}: at most ${max} characters`)
  }
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: string[]
): T | undefined {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    issues.push(`${path}: must be one of ${allowed.join(', ')}`)
    return undefined
  }
  return value as T
}

function validateStackProps(
  props: Record<string, unknown>,
  path: string,
  issues: string[]
): string[] {
  const children = props.children
  if (!Array.isArray(children) || children.length === 0) {
    issues.push(`${path}/children: at least one child node id is required`)
    return []
  }
  if (children.length > UI_LIMITS.maxNodes) {
    issues.push(`${path}/children: at most ${UI_LIMITS.maxNodes} children`)
  }
  const ids: string[] = []
  children.forEach((child, index) => {
    if (typeof child !== 'string' || !child.trim()) {
      issues.push(`${path}/children/${index}: expected a node id`)
      return
    }
    ids.push(child)
  })
  if (props.gap !== undefined) {
    oneOf(props.gap, ['sm', 'md', 'lg'] as const, `${path}/gap`, issues)
  }
  return ids
}

function validateTextProps(
  props: Record<string, unknown>,
  path: string,
  issues: string[]
): void {
  text(props.text, `${path}/text`, UI_LIMITS.maxTextLength, issues)
  if (props.tone !== undefined) {
    oneOf(props.tone, ['body', 'caption', 'heading'] as const, `${path}/tone`, issues)
  }
}

function validateMetricProps(
  props: Record<string, unknown>,
  path: string,
  issues: string[]
): void {
  const items = props.items
  if (!Array.isArray(items) || items.length === 0) {
    issues.push(`${path}/items: at least one metric is required`)
    return
  }
  if (items.length > UI_LIMITS.maxMetricItems) {
    issues.push(`${path}/items: at most ${UI_LIMITS.maxMetricItems} metrics`)
  }
  items.forEach((item, index) => {
    const itemPath = `${path}/items/${index}`
    if (!isRecord(item)) {
      issues.push(`${itemPath}: expected an object`)
      return
    }
    text(item.label, `${itemPath}/label`, 60, issues)
    if (!isFiniteNumber(item.value)) {
      issues.push(`${itemPath}/value: a finite number is required`)
    }
    optionalText(item.unit, `${itemPath}/unit`, 24, issues)
    optionalText(item.hint, `${itemPath}/hint`, 120, issues)
    if (item.format !== undefined) {
      oneOf(item.format, ['number', 'percent', 'compact'] as const, `${itemPath}/format`, issues)
    }
    if (item.delta !== undefined) {
      if (!isRecord(item.delta)) {
        issues.push(`${itemPath}/delta: expected an object`)
        return
      }
      if (!isFiniteNumber(item.delta.value)) {
        issues.push(`${itemPath}/delta/value: a finite number is required`)
      }
      optionalText(item.delta.suffix, `${itemPath}/delta/suffix`, 16, issues)
      if (item.delta.sentiment !== undefined) {
        oneOf(
          item.delta.sentiment,
          ['positive', 'negative', 'neutral'] as const,
          `${itemPath}/delta/sentiment`,
          issues
        )
      }
    }
    if (item.sparkline !== undefined) {
      const sparkline = item.sparkline
      if (!Array.isArray(sparkline) || sparkline.length < 2) {
        issues.push(`${itemPath}/sparkline: at least two points are required`)
        return
      }
      if (sparkline.length > UI_LIMITS.maxSparklinePoints) {
        issues.push(
          `${itemPath}/sparkline: at most ${UI_LIMITS.maxSparklinePoints} points`
        )
      }
      sparkline.forEach((point, pointIndex) => {
        if (point !== null && !isFiniteNumber(point)) {
          issues.push(
            `${itemPath}/sparkline/${pointIndex}: use a finite number, or null for a gap`
          )
        }
      })
      if (!sparkline.some((point) => isFiniteNumber(point))) {
        issues.push(`${itemPath}/sparkline: needs at least one number`)
      }
    }
  })
}

function validateTableProps(
  props: Record<string, unknown>,
  path: string,
  issues: string[]
): void {
  optionalText(props.title, `${path}/title`, 160, issues)
  optionalText(props.caption, `${path}/caption`, 240, issues)
  if (props.searchable !== undefined && typeof props.searchable !== 'boolean') {
    issues.push(`${path}/searchable: expected a boolean`)
  }

  const columns = props.columns
  if (!Array.isArray(columns) || columns.length === 0) {
    issues.push(`${path}/columns: at least one column is required`)
    return
  }
  if (columns.length > UI_LIMITS.maxTableColumns) {
    issues.push(`${path}/columns: at most ${UI_LIMITS.maxTableColumns} columns`)
  }
  columns.forEach((column, index) => {
    text(column, `${path}/columns/${index}`, 48, issues)
  })

  const rows = props.rows
  if (!Array.isArray(rows)) {
    issues.push(`${path}/rows: an array is required`)
    return
  }
  if (rows.length > UI_LIMITS.maxTableRows) {
    issues.push(`${path}/rows: at most ${UI_LIMITS.maxTableRows} rows`)
  }
  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) {
      issues.push(`${path}/rows/${rowIndex}: expected an array of cells`)
      return
    }
    if (row.length !== columns.length) {
      issues.push(
        `${path}/rows/${rowIndex}: ${row.length} cells for ${columns.length} columns (they must align)`
      )
    }
    row.forEach((cell, cellIndex) => {
      if (typeof cell !== 'string') {
        issues.push(`${path}/rows/${rowIndex}/${cellIndex}: expected a string`)
        return
      }
      if (cell.length > UI_LIMITS.maxTableCellLength) {
        issues.push(
          `${path}/rows/${rowIndex}/${cellIndex}: at most ${UI_LIMITS.maxTableCellLength} characters`
        )
      }
    })
  })

  const align = props.align
  if (align !== undefined) {
    if (!Array.isArray(align) || align.length !== columns.length) {
      issues.push(`${path}/align: one entry per column is required`)
    } else {
      align.forEach((entry, index) => {
        oneOf(entry, ['left', 'right'] as const, `${path}/align/${index}`, issues)
      })
    }
  }

  if (props.rowAction !== undefined) {
    if (!isRecord(props.rowAction)) {
      issues.push(`${path}/rowAction: expected an object with label and prompt`)
      return
    }
    text(props.rowAction.label, `${path}/rowAction/label`, UI_LIMITS.maxActionLabelLength, issues)
    text(props.rowAction.prompt, `${path}/rowAction/prompt`, UI_LIMITS.maxPromptLength, issues)
  }
}

function validateTimelineProps(
  props: Record<string, unknown>,
  path: string,
  issues: string[]
): void {
  optionalText(props.title, `${path}/title`, 160, issues)
  optionalText(props.caption, `${path}/caption`, 240, issues)
  if (props.variant !== undefined) {
    oneOf(props.variant, ['timeline', 'steps'] as const, `${path}/variant`, issues)
  }

  const items = props.items
  if (!Array.isArray(items) || items.length === 0) {
    issues.push(`${path}/items: at least one step is required`)
    return
  }
  if (items.length > UI_LIMITS.maxTimelineItems) {
    issues.push(`${path}/items: at most ${UI_LIMITS.maxTimelineItems} steps`)
  }
  items.forEach((item, index) => {
    const itemPath = `${path}/items/${index}`
    if (!isRecord(item)) {
      issues.push(`${itemPath}: expected an object`)
      return
    }
    text(item.label, `${itemPath}/label`, UI_LIMITS.maxTimelineLabelLength, issues)
    optionalText(item.meta, `${itemPath}/meta`, UI_LIMITS.maxTimelineMetaLength, issues)
    optionalText(item.detail, `${itemPath}/detail`, UI_LIMITS.maxTimelineDetailLength, issues)
    if (item.state !== undefined) {
      oneOf(item.state, ['done', 'current', 'todo'] as const, `${itemPath}/state`, issues)
    }
  })
}

function validateCompareProps(
  props: Record<string, unknown>,
  path: string,
  issues: string[]
): void {
  optionalText(props.title, `${path}/title`, 160, issues)
  optionalText(props.caption, `${path}/caption`, 240, issues)

  const options = props.options
  if (!Array.isArray(options) || options.length === 0) {
    issues.push(`${path}/options: at least one option is required`)
    return
  }
  if (options.length > UI_LIMITS.maxCompareOptions) {
    issues.push(`${path}/options: at most ${UI_LIMITS.maxCompareOptions} options`)
  }
  const seen = new Set<string>()
  options.forEach((option, index) => {
    if (!text(option, `${path}/options/${index}`, 48, issues)) return
    if (seen.has(option as string)) {
      issues.push(`${path}/options/${index}: duplicate option "${String(option)}"`)
    }
    seen.add(option as string)
  })

  const criteria = props.criteria
  if (!Array.isArray(criteria) || criteria.length === 0) {
    issues.push(`${path}/criteria: at least one criterion is required`)
    return
  }
  if (criteria.length > UI_LIMITS.maxCompareCriteria) {
    issues.push(`${path}/criteria: at most ${UI_LIMITS.maxCompareCriteria} criteria`)
  }
  criteria.forEach((criterion, index) => {
    const criterionPath = `${path}/criteria/${index}`
    if (!isRecord(criterion)) {
      issues.push(`${criterionPath}: expected an object`)
      return
    }
    text(criterion.label, `${criterionPath}/label`, 48, issues)
    const values = criterion.values
    if (!Array.isArray(values) || values.length !== options.length) {
      issues.push(
        `${criterionPath}/values: one value per option is required (${options.length})`
      )
      return
    }
    values.forEach((value, valueIndex) => {
      if (typeof value !== 'string') {
        issues.push(`${criterionPath}/values/${valueIndex}: expected a string`)
        return
      }
      if (value.length > UI_LIMITS.maxTableCellLength) {
        issues.push(`${criterionPath}/values/${valueIndex}: at most ${UI_LIMITS.maxTableCellLength} characters`)
      }
    })
  })
}

function validateActionsProps(
  props: Record<string, unknown>,
  path: string,
  issues: string[]
): void {
  optionalText(props.title, `${path}/title`, 160, issues)
  const prompts = props.prompts
  if (!Array.isArray(prompts) || prompts.length === 0) {
    issues.push(`${path}/prompts: at least one prompt is required`)
    return
  }
  if (prompts.length > UI_LIMITS.maxActionPrompts) {
    issues.push(`${path}/prompts: at most ${UI_LIMITS.maxActionPrompts} prompts`)
  }
  prompts.forEach((prompt, index) => {
    const promptPath = `${path}/prompts/${index}`
    if (!isRecord(prompt)) {
      issues.push(`${promptPath}: expected an object`)
      return
    }
    text(prompt.label, `${promptPath}/label`, UI_LIMITS.maxActionLabelLength, issues)
    text(prompt.prompt, `${promptPath}/prompt`, UI_LIMITS.maxPromptLength, issues)
    if (prompt.variant !== undefined) {
      oneOf(prompt.variant, ['primary', 'secondary'] as const, `${promptPath}/variant`, issues)
    }
  })
}

function validateAllowsUnknownProps(
  props: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: string[]
): void {
  for (const key of Object.keys(props)) {
    if (!allowed.includes(key)) {
      issues.push(`${path}/${key}: unsupported property`)
    }
  }
}

function validateNode(id: string, node: unknown, issues: string[]): string[] {
  const path = `/elements/${id}`
  if (!isRecord(node)) {
    issues.push(`${path}: expected an object with type and props`)
    return []
  }

  for (const key of Object.keys(node)) {
    if (!ALLOWED_KEYS.has(key)) {
      issues.push(`${path}/${key}: unsupported node key (only type and props are allowed)`)
    }
  }

  const type = node.type
  const isKnown = typeof type === 'string' && UI_NODE_TYPES.includes(type as UiNodeType)

  if (!isKnown) {
    issues.push(`${path}/type: unknown node type "${String(type)}"`)
    return []
  }

  const props = node.props
  if (!isRecord(props)) {
    issues.push(`${path}/props: expected an object`)
    return []
  }

  switch (type) {
    case 'Stack':
      validateAllowsUnknownProps(props, ['children', 'gap'], `${path}/props`, issues)
      return validateStackProps(props, `${path}/props`, issues)
    case 'Text':
      validateAllowsUnknownProps(props, ['text', 'tone'], `${path}/props`, issues)
      validateTextProps(props, `${path}/props`, issues)
      return []
    case 'Metric':
      validateAllowsUnknownProps(props, ['items'], `${path}/props`, issues)
      validateMetricProps(props, `${path}/props`, issues)
      return []
    case 'Chart':
      issues.push(...validateChartData(props, `${path}/props`))
      return []
    case 'Table':
      validateAllowsUnknownProps(
        props,
        ['title', 'caption', 'columns', 'rows', 'align', 'searchable', 'rowAction'],
        `${path}/props`,
        issues
      )
      validateTableProps(props, `${path}/props`, issues)
      return []
    case 'Compare':
      validateAllowsUnknownProps(
        props,
        ['title', 'caption', 'options', 'criteria'],
        `${path}/props`,
        issues
      )
      validateCompareProps(props, `${path}/props`, issues)
      return []
    case 'Actions':
      validateAllowsUnknownProps(props, ['title', 'prompts'], `${path}/props`, issues)
      validateActionsProps(props, `${path}/props`, issues)
      return []
    case 'Timeline':
      validateAllowsUnknownProps(
        props,
        ['title', 'caption', 'variant', 'items'],
        `${path}/props`,
        issues
      )
      validateTimelineProps(props, `${path}/props`, issues)
      return []
    case 'Generated':
      issues.push(...validateGeneratedSource(props, `${path}/props`))
      return []
    default:
      return []
  }
}

export function validateUiSpec(value: unknown): UiValidationResult {
  const issues: string[] = []

  if (!isRecord(value)) {
    return { ok: false, issues: ['spec: expected an object with version, root and elements'] }
  }

  if (value.version !== UI_SPEC_VERSION) {
    issues.push(`version: must be "${UI_SPEC_VERSION}"`)
  }

  optionalText(value.title, 'title', 160, issues)

  const root = value.root
  if (typeof root !== 'string' || !root.trim()) {
    issues.push('root: a node id is required')
  }

  const elements = value.elements
  if (!isRecord(elements)) {
    return { ok: false, issues: [...issues, 'elements: expected an object of node id → node'] }
  }

  const ids = Object.keys(elements)
  if (ids.length === 0) {
    issues.push('elements: at least one node is required')
  }
  if (ids.length > UI_LIMITS.maxNodes) {
    issues.push(`elements: at most ${UI_LIMITS.maxNodes} nodes`)
  }

  for (const id of ids) {
    if (RESERVED_IDS.has(id)) {
      issues.push(`elements/${id}: "${id}" is a reserved id`)
    } else if (id.length > UI_LIMITS.maxIdLength) {
      issues.push(`elements/${id}: ids are limited to ${UI_LIMITS.maxIdLength} characters`)
    } else if (!id.trim()) {
      issues.push('elements: node ids cannot be empty')
    }
  }

  const childRefs = new Map<string, string[]>()
  for (const id of ids) {
    childRefs.set(id, validateNode(id, elements[id], issues))
  }

  // Graph checks: one root, one parent per node, no cycles, bounded depth.
  const parentOf = new Map<string, string>()
  for (const [id, children] of childRefs) {
    for (const child of children) {
      if (!(child in elements)) {
        issues.push(`/elements/${id}/props/children: "${child}" does not exist`)
        continue
      }
      if (child === id) {
        issues.push(`/elements/${id}/props/children: a node cannot contain itself`)
        continue
      }
      const existing = parentOf.get(child)
      if (existing) {
        issues.push(
          `/elements/${child}: referenced by both "${existing}" and "${id}" (every node needs one parent)`
        )
      } else {
        parentOf.set(child, id)
      }
    }
  }

  if (typeof root === 'string' && root.trim() && !(root in elements)) {
    issues.push(`root: "${root}" does not exist in elements`)
  }

  if (typeof root === 'string' && root in elements) {
    if (parentOf.has(root)) {
      issues.push(`root: "${root}" is a child of "${parentOf.get(root)}" (the root needs no parent)`)
    }

    const visited = new Set<string>()
    let deepest = 0

    const walk = (id: string, depth: number, trail: Set<string>): void => {
      if (trail.has(id)) {
        issues.push(`/elements/${id}: cycle detected`)
        return
      }
      if (visited.has(id)) return
      visited.add(id)
      deepest = Math.max(deepest, depth)
      if (depth > UI_LIMITS.maxDepth) return
      const children = childRefs.get(id) ?? []
      const nextTrail = new Set(trail)
      nextTrail.add(id)
      for (const child of children) {
        if (child in elements) walk(child, depth + 1, nextTrail)
      }
    }

    walk(root, 1, new Set())

    for (const id of ids) {
      if (!visited.has(id)) {
        issues.push(`/elements/${id}: not reachable from the root`)
      }
    }

    if (deepest > UI_LIMITS.maxDepth) {
      issues.push(`elements: nesting depth ${deepest} exceeds the limit of ${UI_LIMITS.maxDepth}`)
    }
  }

  let size = 0
  try {
    size = JSON.stringify(value).length
  } catch {
    issues.push('spec: must be JSON-serializable')
  }
  if (size > UI_LIMITS.maxSpecBytes) {
    issues.push(
      `spec: ${size} bytes exceeds the ${UI_LIMITS.maxSpecBytes} byte limit (send less data, or summarise)`
    )
  }

  if (issues.length > 0) {
    return { ok: false, issues: Array.from(new Set(issues)).slice(0, 12) }
  }

  return { ok: true, spec: value as unknown as UiSpec }
}

/** Validates a spec arriving from persistence; retired nodes still render. */
export function normalizeUiSurface(payload: unknown): UiSurface | null {
  if (!isRecord(payload)) return null

  const id = typeof payload.id === 'string' ? payload.id.trim() : ''
  if (!id || id.length > 80) return null

  const revision = isFiniteNumber(payload.revision) ? Math.max(1, Math.floor(payload.revision)) : 1
  const status = payload.status === 'ready' ? 'ready' : 'draft'
  const createdAt = isFiniteNumber(payload.createdAt) ? payload.createdAt : Date.now()

  const validated = validateUiSpec(payload.spec)
  if (!validated.ok) return null

  return {
    id,
    revision,
    status,
    createdAt,
    spec: validated.spec
  }
}

export function normalizeUiParts(payload: unknown): UiPart[] | undefined {
  if (!Array.isArray(payload)) return undefined

  const parts = payload
    .map((item): UiPart | null => {
      if (!isRecord(item) || item.kind !== 'surface') return null
      const surface = normalizeUiSurface(item.surface)
      if (!surface) return null
      const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : surface.id
      return { id, kind: 'surface', surface }
    })
    .filter((part): part is UiPart => Boolean(part))
    .slice(0, UI_LIMITS.maxSurfacesPerAnswer)

  return parts.length > 0 ? parts : undefined
}

export function markSurfacesReady(parts: readonly UiPart[] | undefined): UiPart[] | undefined {
  if (!parts || parts.length === 0) return parts ? [...parts] : undefined
  let changed = false
  const next = parts.map((part) => {
    if (part.surface.status === 'ready') return part
    changed = true
    return { ...part, surface: { ...part.surface, status: 'ready' as const } }
  })
  return changed ? next : [...parts]
}
