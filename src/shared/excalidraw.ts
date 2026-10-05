import type { ReasoningStep } from './chat'

export interface ExcalidrawCheckpoint {
  checkpointId: string
  serverId?: string
}

export const EXCALIDRAW_CREATE_VIEW_TOOL = 'create_view'
export const EXCALIDRAW_READ_CHECKPOINT_TOOL = 'read_checkpoint'
export const EXCALIDRAW_EXPORT_TOOL = 'export_to_excalidraw'

const CHECKPOINT_ID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/

export function sanitizeCheckpointId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return CHECKPOINT_ID_PATTERN.test(trimmed) ? trimmed : null
}

function findCheckpointIdInValue(value: unknown, depth: number): string | null {
  if (depth > 3 || value === null || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const direct = sanitizeCheckpointId(record.checkpointId)
  if (direct) return direct

  for (const key of ['structuredContent', 'result', 'data']) {
    const nested = findCheckpointIdInValue(record[key], depth + 1)
    if (nested) return nested
  }

  return null
}

export function extractExcalidrawCheckpointId(content: string | undefined): string | null {
  if (typeof content !== 'string' || !content.trim()) return null
  const trimmed = content.trim()

  try {
    const fromParsed = findCheckpointIdInValue(JSON.parse(trimmed) as unknown, 0)
    if (fromParsed) return fromParsed
  } catch {
    // Not JSON, fall through to the text patterns below.
  }

  const jsonMatch = /"checkpointId"\s*:\s*"([^"]+)"/.exec(trimmed)
  if (jsonMatch) {
    const id = sanitizeCheckpointId(jsonMatch[1])
    if (id) return id
  }

  const textMatch = /checkpoint\s*id["'`\s:]*["'`]?([A-Za-z0-9_-]{6,128})/i.exec(trimmed)
  if (textMatch) {
    const id = sanitizeCheckpointId(textMatch[1])
    if (id) return id
  }

  return null
}

type ToolStep = Extract<ReasoningStep, { type: 'tool' }>

export function isExcalidrawCreateViewStep(step: ReasoningStep): step is ToolStep {
  if (step.type !== 'tool') return false
  const haystack = `${step.name ?? ''} ${step.query ?? ''}`.toLowerCase()
  return haystack.includes(EXCALIDRAW_CREATE_VIEW_TOOL)
}

export function collectExcalidrawCheckpoints(
  steps: ReasoningStep[] | undefined
): ExcalidrawCheckpoint[] {
  if (!Array.isArray(steps)) return []

  const seen = new Set<string>()
  const checkpoints: ExcalidrawCheckpoint[] = []

  for (const step of steps) {
    if (!isExcalidrawCreateViewStep(step) || step.status === 'error') continue
    const checkpointId = extractExcalidrawCheckpointId(step.content)
    if (!checkpointId || seen.has(checkpointId)) continue
    seen.add(checkpointId)
    checkpoints.push({ checkpointId, serverId: step.serverId })
  }

  return checkpoints
}
