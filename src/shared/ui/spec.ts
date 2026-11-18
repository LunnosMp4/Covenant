/**
 * Declarative UI contract.
 *
 * The model authors a bounded graph of known node types. It never sends React,
 * HTML, expressions, event handlers, or chart-library options. Node identity is
 * injected by the renderer after validation, never by the model.
 */

import type { ChartData } from './chart'
import type { GeneratedSource } from './generated'

export const UI_SPEC_VERSION = 'ui-v1'

export type UiNodeType =
  | 'Stack'
  | 'Text'
  | 'Metric'
  | 'Chart'
  | 'Table'
  | 'Compare'
  | 'Actions'
  | 'Timeline'
  | 'Generated'

export const UI_LIMITS = {
  maxNodes: 24,
  maxDepth: 6,
  maxIdLength: 64,
  maxSpecBytes: 32_768,
  maxAnswerBytes: 262_144,
  maxSurfacesPerAnswer: 3,
  maxTextLength: 1_200,
  maxTableColumns: 8,
  maxTableRows: 50,
  maxTableCellLength: 160,
  maxMetricItems: 4,
  maxSparklinePoints: 32,
  maxCompareOptions: 4,
  maxCompareCriteria: 8,
  maxActionPrompts: 4,
  maxActionLabelLength: 60,
  maxPromptLength: 600,
  maxTimelineItems: 8,
  maxTimelineLabelLength: 80,
  maxTimelineMetaLength: 40,
  maxTimelineDetailLength: 240
} as const

export interface StackProps {
  children: string[]
  gap?: 'sm' | 'md' | 'lg'
}

export interface TextProps {
  text: string
  tone?: 'body' | 'caption' | 'heading'
}

export interface MetricItem {
  label: string
  value: number
  unit?: string
  format?: 'number' | 'percent' | 'compact'
  delta?: {
    value: number
    sentiment?: 'positive' | 'negative' | 'neutral'
    suffix?: string
  }
  hint?: string
  /** Recent history behind the number, drawn as a sparkline. Null = gap. */
  sparkline?: Array<number | null>
}

export interface MetricProps {
  items: MetricItem[]
}

export interface TableProps {
  title?: string
  caption?: string
  columns: string[]
  rows: string[][]
  align?: Array<'left' | 'right'>
  searchable?: boolean
  /**
   * One clickable prompt per row. `{row}` / `{row.0}` interpolate cells,
   * `{index}` is the 1-based position the user sees.
   */
  rowAction?: {
    label: string
    prompt: string
  }
}

export interface CompareProps {
  title?: string
  caption?: string
  options: string[]
  criteria: Array<{ label: string; values: string[] }>
}

export interface ActionPrompt {
  label: string
  prompt: string
  variant?: 'primary' | 'secondary'
}

export interface ActionsProps {
  title?: string
  prompts: ActionPrompt[]
}

export interface TimelineItem {
  label: string
  /** Short right-aligned note: a time, a duration, an owner. */
  meta?: string
  detail?: string
  state?: 'done' | 'current' | 'todo'
}

export interface TimelineProps {
  title?: string
  caption?: string
  /** `timeline` shows dots, `steps` numbers them. */
  variant?: 'timeline' | 'steps'
  items: TimelineItem[]
}

export interface UiNode {
  type: UiNodeType
  props: Record<string, unknown>
}

export interface TypedUiNode<T extends UiNodeType, P> extends UiNode {
  type: T
  props: P & Record<string, unknown>
}

export type StackNode = TypedUiNode<'Stack', StackProps>
export type TextNode = TypedUiNode<'Text', TextProps>
export type MetricNode = TypedUiNode<'Metric', MetricProps>
export type ChartNode = TypedUiNode<'Chart', ChartData>
export type TableNode = TypedUiNode<'Table', TableProps>
export type CompareNode = TypedUiNode<'Compare', CompareProps>
export type ActionsNode = TypedUiNode<'Actions', ActionsProps>
export type TimelineNode = TypedUiNode<'Timeline', TimelineProps>
export type GeneratedNode = TypedUiNode<'Generated', GeneratedSource>

export interface UiSpec {
  version: typeof UI_SPEC_VERSION
  /** Optional heading for the whole surface. */
  title?: string
  root: string
  elements: Record<string, UiNode>
}

export type UiSurfaceStatus = 'draft' | 'ready'

export interface UiSurface {
  id: string
  revision: number
  status: UiSurfaceStatus
  spec: UiSpec
  createdAt: number
}

export interface UiPart {
  id: string
  kind: 'surface'
  surface: UiSurface
}

export const UI_NODE_TYPES: readonly UiNodeType[] = [
  'Stack',
  'Text',
  'Metric',
  'Chart',
  'Table',
  'Compare',
  'Actions',
  'Timeline',
  'Generated'
]
