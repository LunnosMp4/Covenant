import type { TaskTier } from '../../../../shared/tasks/gamification'

export const TIER_LABELS: Record<TaskTier, string> = {
  TRIVIAL: 'Trivial',
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
  EPIC: 'Epic'
}

export function getTierLabel(tier: TaskTier | undefined): string {
  return tier ? TIER_LABELS[tier] : ''
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '').trim()
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized

  if (full.length !== 6) {
    return `rgba(255,255,255,${alpha})`
  }

  const parsed = parseInt(full, 16)
  if (Number.isNaN(parsed)) {
    return `rgba(255,255,255,${alpha})`
  }

  const r = (parsed >> 16) & 255
  const g = (parsed >> 8) & 255
  const b = parsed & 255
  return `rgba(${r},${g},${b},${alpha})`
}
