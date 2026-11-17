/**
 * One plain-text rendering used everywhere text is needed instead of pixels:
 * the accessibility label, the fallback when rendering fails, the model's memory
 * of an earlier visual on the next turn, and chat search.
 */

import { describeChart, formatChartValue, type ChartData } from './chart'
import { GENERATED_LIMITS, type GeneratedSource } from './generated'
import type {
  ActionsProps,
  CompareProps,
  MetricProps,
  TableProps,
  TextProps,
  UiSpec
} from './spec'

const MAX_DEFAULT_CHARACTERS = 2_400
const MAX_TABLE_ROWS = 16

function clip(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

function asProps<T>(node: { props: Record<string, unknown> }): T {
  return node.props as unknown as T
}

function describeMetric(props: MetricProps): string {
  const items = props.items.map((item) => {
    const value = formatChartValue(item.value, item.format ?? 'number')
    const unit = item.unit ? ` ${item.unit}` : ''
    const delta =
      item.delta === undefined
        ? ''
        : ` (${item.delta.value > 0 ? '+' : ''}${formatChartValue(item.delta.value, 'number')}${
            item.delta.suffix ?? '%'
          })`
    return `${clip(item.label, 40)} ${value}${unit}${delta}`
  })
  return `Metrics: ${items.join('; ')}`
}

function describeTable(props: TableProps): string {
  const title = props.title ? ` "${clip(props.title, 60)}"` : ''
  const rows = props.rows
    .slice(0, MAX_TABLE_ROWS)
    .map((row) => row.map((cell) => clip(cell, 60)).join(' | '))
  const more = props.rows.length > MAX_TABLE_ROWS ? '; …' : ''
  return `Table${title} (${props.columns.map((column) => clip(column, 30)).join(' | ')}): ${rows.join('; ')}${more}`
}

function describeCompare(props: CompareProps): string {
  const title = props.title ? ` "${clip(props.title, 60)}"` : ''
  const criteria = props.criteria.map((criterion) => {
    const values = criterion.values.map((value) => clip(value, 40)).join(' / ')
    return `${clip(criterion.label, 40)}: ${values}`
  })
  return `Compare${title} (${props.options.map((option) => clip(option, 30)).join(' / ')}): ${criteria.join('; ')}`
}

function describeActions(props: ActionsProps): string {
  return `Suggested follow-ups: ${props.prompts
    .map((prompt) => `"${clip(prompt.label, 40)}"`)
    .join(', ')}`
}

function describeGenerated(props: GeneratedSource): string {
  return `Visual "${clip(props.title, 80)}": ${clip(props.fallback, GENERATED_LIMITS.maxFallbackLength)}`
}

/**
 * Depth-first, display-ordered description. `Stack` contributes ordering only.
 */
export function describeUiSpec(
  spec: UiSpec,
  options: { maxCharacters?: number } = {}
): string {
  const maxCharacters = options.maxCharacters ?? MAX_DEFAULT_CHARACTERS
  const lines: string[] = []
  const visited = new Set<string>()

  const walk = (id: string): void => {
    if (visited.has(id)) return
    visited.add(id)
    const node = spec.elements[id]
    if (!node) return

    switch (node.type) {
      case 'Stack': {
        const children = asProps<{ children?: unknown }>(node).children
        if (Array.isArray(children)) {
          children.forEach((child) => {
            if (typeof child === 'string') walk(child)
          })
        }
        return
      }
      case 'Text': {
        const props = asProps<TextProps>(node)
        if (typeof props.text === 'string' && props.text.trim()) {
          lines.push(clip(props.text, 600))
        }
        return
      }
      case 'Chart':
        lines.push(describeChart(asProps<ChartData>(node)))
        return
      case 'Metric':
        lines.push(describeMetric(asProps<MetricProps>(node)))
        return
      case 'Table':
        lines.push(describeTable(asProps<TableProps>(node)))
        return
      case 'Compare':
        lines.push(describeCompare(asProps<CompareProps>(node)))
        return
      case 'Actions':
        lines.push(describeActions(asProps<ActionsProps>(node)))
        return
      case 'Generated':
        lines.push(describeGenerated(asProps<GeneratedSource>(node)))
        return
      default:
        return
    }
  }

  walk(spec.root)

  const joined = lines.join('\n')
  return joined.length > maxCharacters ? `${joined.slice(0, maxCharacters - 1)}…` : joined
}

/** Short label for a single node, used by the renderer for `aria-label`. */
export function describeUiNode(spec: UiSpec, nodeId: string): string {
  const node = spec.elements[nodeId]
  if (!node) return ''
  const single: UiSpec = { ...spec, root: nodeId }
  return describeUiSpec(single, { maxCharacters: 600 })
}
