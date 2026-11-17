import { UI_SPEC_VERSION, type UiSpec } from '../../shared/ui/spec'
import { validateGeneratedSource } from '../../shared/ui/generated'
import type { BuiltinToolHandler, BuiltinToolResult } from '../services/builtinTools'
import { createSurfacePublisher, publishFailure, publishSuccess } from './publish'

function parseArguments(rawArguments: string): Record<string, unknown> {
  if (!rawArguments.trim()) return {}
  try {
    const parsed = JSON.parse(rawArguments) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function wrapGenerated(source: Record<string, unknown>): UiSpec {
  return {
    version: UI_SPEC_VERSION,
    root: 'visual',
    elements: {
      visual: { type: 'Generated', props: source }
    }
  }
}

/**
 * UI tools are builtin: they publish a validated surface as a stream side
 * effect. They never execute anything the model authored.
 */
export function createUiToolHandlers(): BuiltinToolHandler[] {
  const publisher = createSurfacePublisher()

  return [
    {
      name: 'render_ui',
      toolType: 'ui',
      async execute(rawArguments): Promise<BuiltinToolResult> {
        const args = parseArguments(rawArguments)
        if (!args.spec || typeof args.spec !== 'object') {
          return { content: 'render_ui needs a `spec` object.', isError: true }
        }

        const result = publisher.publish(args.spec)
        if (!result.ok) {
          return { content: publishFailure(result.issues), isError: true }
        }

        return { content: publishSuccess(result.part), isError: false, part: result.part }
      }
    },
    {
      name: 'render_generated',
      toolType: 'ui',
      async execute(rawArguments): Promise<BuiltinToolResult> {
        const args = parseArguments(rawArguments)
        const source = args.source
        if (!source || typeof source !== 'object') {
          return { content: 'render_generated needs a `source` object.', isError: true }
        }

        const structural = validateGeneratedSource(source)
        if (structural.length > 0) {
          return { content: publishFailure(structural), isError: true }
        }

        const result = publisher.publish(wrapGenerated(source as Record<string, unknown>))
        if (!result.ok) {
          return { content: publishFailure(result.issues), isError: true }
        }

        return { content: publishSuccess(result.part), isError: false, part: result.part }
      }
    }
  ]
}

const NODE_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['Stack', 'Text', 'Metric', 'Chart', 'Table', 'Compare', 'Actions', 'Timeline', 'Generated']
    },
    props: { type: 'object', additionalProperties: true }
  },
  required: ['type', 'props'],
  additionalProperties: false
} as const

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    version: { type: 'string', enum: [UI_SPEC_VERSION] },
    title: { type: 'string' },
    root: { type: 'string' },
    elements: {
      type: 'object',
      additionalProperties: NODE_SCHEMA
    }
  },
  required: ['version', 'root', 'elements'],
  additionalProperties: false
} as const

const GENERATED_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    html: { type: 'string' },
    css: { type: 'string' },
    javascript: { type: 'string' },
    fallback: { type: 'string' },
    height: { type: 'number' },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          label: { type: 'string' },
          type: { type: 'string', enum: ['text', 'number', 'select', 'boolean'] },
          required: { type: 'boolean' },
          options: { type: 'array', items: { type: 'string' } },
          min: { type: 'number' },
          max: { type: 'number' }
        },
        required: ['name', 'label', 'type'],
        additionalProperties: false
      }
    }
  },
  required: ['title', 'html', 'fallback'],
  additionalProperties: false
} as const

export function buildUiToolDefinitions(): Array<Record<string, unknown>> {
  return [
    {
      type: 'function',
      name: 'render_ui',
      description:
        'Publish a visual answer built from known UI nodes (Chart, Metric, Table, Compare, Text, Stack, Actions). ' +
        'Use it proactively when data shape, comparison, composition, or a set of headline numbers is the answer. ' +
        'Never ask permission first. The spec is validated; invalid specs return repair instructions and publish nothing. ' +
        'Call this before writing your closing text, and do not repeat the visual values in the text.',
      parameters: {
        type: 'object',
        properties: { spec: SPEC_SCHEMA },
        required: ['spec'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'render_generated',
      description:
        'Publish a bespoke visual answer as an isolated HTML/CSS/JS surface. Use only when the composition or interaction cannot be expressed with the native nodes: ' +
        'a coordinated dashboard-style layout, a chart type outside line/area/bar/pie/donut, custom SVG, or local what-if controls. ' +
        'The surface runs sandboxed with no network, storage, filesystem or tool access. Always include a readable fallback with every value. ' +
        'Use design tokens and the shared Covenant runtime; never literal colours, fonts or radii.',
      parameters: {
        type: 'object',
        properties: { source: GENERATED_SCHEMA },
        required: ['source'],
        additionalProperties: false
      }
    }
  ]
}
