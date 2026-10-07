import type { CodeFileDiff } from '../../../shared/code/code'
import type { ToolCard } from './types'

export type ToolKind =
  | 'read'
  | 'search'
  | 'list'
  | 'edit'
  | 'command'
  | 'fetch'
  | 'task'
  | 'todo'
  | 'other'

export interface ToolSummary {
  kind: ToolKind
  /** Verb shown before the target, e.g. `Read`, `$`, `Search`. */
  label: string
  /** Primary target: file, command, pattern, url… */
  target: string
  /** Optional secondary detail. */
  detail?: string
}

export type ToolTimelineItem =
  | { type: 'group'; id: string; tools: ToolCard[] }
  | { type: 'tool'; id: string; tool: ToolCard }

const EXPLORATION_KINDS = new Set<ToolKind>(['read', 'search', 'list'])

function normalizedName(tool: ToolCard): string {
  return (tool.name || '').toLowerCase().replace(/^.*[./]/, '')
}

export function parseToolInput(tool: ToolCard): Record<string, unknown> {
  if (!tool.input) return {}
  try {
    const parsed = JSON.parse(tool.input)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

export function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

export function summarizeTool(tool: ToolCard): ToolSummary {
  const name = normalizedName(tool)
  const input = parseToolInput(tool)
  const filePath = firstString(input.filePath, input.file, input.path, input.target)
  const title = tool.title?.trim()

  if (name === 'bash' || name === 'shell' || name === 'command' || input.command) {
    return {
      kind: 'command',
      label: '$',
      target: firstString(input.command, title) ?? 'command'
    }
  }
  if (name === 'edit' || name === 'write' || name === 'patch' || name === 'multiedit') {
    return {
      kind: 'edit',
      label: name === 'write' ? 'Write' : name === 'patch' ? 'Patch' : 'Edit',
      target: filePath ? basename(filePath) : title ?? name
    }
  }
  if (name === 'read' || name === 'view' || name === 'open') {
    return { kind: 'read', label: 'Read', target: filePath ? basename(filePath) : title ?? 'file' }
  }
  if (name === 'grep' || name === 'search' || name === 'rg') {
    const pattern = firstString(input.pattern, input.query)
    return {
      kind: 'search',
      label: 'Search',
      target: pattern ? `"${pattern}"` : title ?? 'pattern',
      detail: firstString(input.include, input.path)
    }
  }
  if (name === 'glob' || name === 'find' || name === 'ls') {
    const pattern = firstString(input.pattern, input.query, input.glob)
    return { kind: 'search', label: 'Find', target: pattern ?? title ?? 'files' }
  }
  if (name === 'list' || name === 'tree') {
    return { kind: 'list', label: 'List', target: filePath ?? title ?? '.' }
  }
  if (name === 'webfetch' || name === 'fetch' || name === 'websearch') {
    return {
      kind: 'fetch',
      label: name === 'websearch' ? 'Web search' : 'Fetch',
      target: firstString(input.url, input.query) ?? title ?? 'url'
    }
  }
  if (name === 'task' || name === 'agent') {
    return { kind: 'task', label: 'Task', target: firstString(input.description, title) ?? 'task' }
  }
  if (name === 'todowrite' || name === 'todoread' || name === 'todo') {
    return { kind: 'todo', label: 'Todos', target: name === 'todoread' ? 'read' : 'update' }
  }

  const fallbackTarget = firstString(filePath, input.pattern, input.query, input.command, title)
  return { kind: 'other', label: tool.name || 'Tool', target: fallbackTarget ?? '' }
}

export function isExploration(tool: ToolCard): boolean {
  return EXPLORATION_KINDS.has(summarizeTool(tool).kind)
}

export function toolFilePath(tool: ToolCard): string | null {
  const input = parseToolInput(tool)
  return firstString(input.filePath, input.file, input.path) ?? null
}

/** Groups consecutive exploration tools (read/search/list) into sections. */
export function groupTools(tools: ToolCard[]): ToolTimelineItem[] {
  const items: ToolTimelineItem[] = []
  let group: ToolCard[] = []

  const flush = (): void => {
    if (group.length === 0) return
    if (group.length === 1) {
      items.push({ type: 'tool', id: group[0].callId, tool: group[0] })
    } else {
      items.push({ type: 'group', id: `group-${group[0].callId}`, tools: group })
    }
    group = []
  }

  for (const tool of tools) {
    if (isExploration(tool)) {
      group.push(tool)
    } else {
      flush()
      items.push({ type: 'tool', id: tool.callId, tool })
    }
  }
  flush()
  return items
}

export function describeGroup(tools: ToolCard[]): string {
  let reads = 0
  let searches = 0
  for (const tool of tools) {
    const kind = summarizeTool(tool).kind
    if (kind === 'search') searches += 1
    else reads += 1
  }
  const parts: string[] = []
  if (reads > 0) parts.push(`${reads} ${reads === 1 ? 'file' : 'files'}`)
  if (searches > 0) parts.push(`${searches} ${searches === 1 ? 'search' : 'searches'}`)
  return parts.join(' · ') || `${tools.length} steps`
}

/** Finds the session diff matching a tool's edited file (by path suffix). */
export function findDiffForTool(
  tool: ToolCard,
  diffs: CodeFileDiff[]
): CodeFileDiff | undefined {
  const target = toolFilePath(tool)
  if (!target) return undefined
  const normalizedTarget = target.replace(/\\/g, '/')
  const targetBase = basename(normalizedTarget)
  return (
    diffs.find((diff) => {
      const file = diff.file.replace(/\\/g, '/')
      return file === normalizedTarget || file.endsWith(`/${normalizedTarget}`)
    }) ??
    diffs.find((diff) => basename(diff.file.replace(/\\/g, '/')) === targetBase)
  )
}
