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
  | 'Generated'

/** Nodes the model may no longer author but old conversations may still replay. */
export const RETIRED_UI_NODE_TYPES: readonly UiNodeType[] = []

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
  maxCompareOptions: 4,
  maxCompareCriteria: 8,
  maxActionPrompts: 4,
  maxActionLabelLength: 60,
  maxPromptLength: 600
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
  'Generated'
]

export function isAuthoringNodeType(type: unknown): type is UiNodeType {
  return typeof type === 'string' && UI_NODE_TYPES.includes(type as UiNodeType)
}

export function isReplayNodeType(type: unknown): type is UiNodeType {
  return (
    typeof type === 'string' &&
    (UI_NODE_TYPES.includes(type as UiNodeType) ||
      RETIRED_UI_NODE_TYPES.includes(type as UiNodeType))
  )
}

export function countSurfaceBytes(surfaces: readonly UiSurface[]): number {
  try {
    return JSON.stringify(surfaces).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}
