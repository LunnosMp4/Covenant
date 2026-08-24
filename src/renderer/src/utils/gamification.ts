import type { TaskTier } from '../../../shared/gamification'

export const TIER_LABELS: Record<TaskTier, string> = {
  TRIVIAL: 'Trivial',
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
  EPIC: 'Epic'
}

export const TIER_BADGE_CLASSES: Record<TaskTier, string> = {
  TRIVIAL: 'border-neutral-500/30 bg-neutral-500/10 text-neutral-400',
  EASY: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  MEDIUM: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  HARD: 'border-orange-400/30 bg-orange-400/10 text-orange-300',
  EPIC: 'border-rose-400/30 bg-rose-400/10 text-rose-300'
}

export function getTierLabel(tier: TaskTier | undefined): string {
  return tier ? TIER_LABELS[tier] : ''
}

export function getTierBadgeClass(tier: TaskTier | undefined): string {
  return tier ? TIER_BADGE_CLASSES[tier] : TIER_BADGE_CLASSES.MEDIUM
}
