export type TaskTier = 'TRIVIAL' | 'EASY' | 'MEDIUM' | 'HARD' | 'EPIC'

export type TaskCategory =
  | 'Dev'
  | 'DevOps'
  | 'SysAdmin'
  | 'Writing'
  | 'Design'
  | 'Admin'
  | 'Personal'
  | 'Health'
  | 'General'

export type TaskActionType =
  | 'terminal_command'
  | 'code_refactor'
  | 'quick_action'
  | 'deep_work'
  | 'communication'
  | 'maintenance'

export interface TaskEvaluation {
  tier: TaskTier
  xpReward: number
  estimatedMinutes: number
  categoryTag: TaskCategory
  actionType: TaskActionType
  rationale: string
}

export interface GamificationState {
  currentLevel: number
  currentXP: number
  totalLifetimeXP: number
  streakDays: number
  lastActiveDate: string | null
}

export interface TierRange {
  min: number
  max: number
}

export const TIER_RANGES: Record<TaskTier, TierRange> = {
  TRIVIAL: { min: 15, max: 30 },
  EASY: { min: 35, max: 70 },
  MEDIUM: { min: 75, max: 150 },
  HARD: { min: 160, max: 300 },
  EPIC: { min: 320, max: 500 }
}

export const TASK_TIER_SET = new Set<TaskTier>(['TRIVIAL', 'EASY', 'MEDIUM', 'HARD', 'EPIC'])

export const TASK_CATEGORY_SET = new Set<TaskCategory>([
  'Dev',
  'DevOps',
  'SysAdmin',
  'Writing',
  'Design',
  'Admin',
  'Personal',
  'Health',
  'General'
])

export const TASK_ACTION_TYPE_SET = new Set<TaskActionType>([
  'terminal_command',
  'code_refactor',
  'quick_action',
  'deep_work',
  'communication',
  'maintenance'
])

export const DEFAULT_GAMIFICATION: GamificationState = {
  currentLevel: 1,
  currentXP: 0,
  totalLifetimeXP: 0,
  streakDays: 0,
  lastActiveDate: null
}

// XP required (cumulative lifetime XP) to reach a given level L.
// Late levels grow super-linearly so grinding toward the cap takes a long time.
export function getXpForLevel(level: number): number {
  if (level <= 0) return 0
  return Math.floor(100 * Math.pow(level, 1.45))
}

export interface LevelProgress {
  level: number
  currentXP: number
  xpToNext: number
  xpForCurrentLevel: number
}

export function calculateLevelFromTotalXp(totalXp: number): LevelProgress {
  const safeTotal = Math.max(0, Math.floor(totalXp))
  let level = 1
  while (getXpForLevel(level + 1) <= safeTotal) {
    level += 1
  }

  const xpForCurrentLevel = getXpForLevel(level)
  const xpToNext = getXpForLevel(level + 1) - xpForCurrentLevel
  const currentXP = Math.max(0, safeTotal - xpForCurrentLevel)

  return { level, currentXP, xpToNext, xpForCurrentLevel }
}

export function applyStreakBonus(baseXp: number, streakDays: number): number {
  const safeBase = Math.max(0, baseXp)
  const safeStreak = Math.max(0, streakDays)
  const bonusRatio = Math.min(0.2, safeStreak * 0.02)
  return Math.round(safeBase * (1 + bonusRatio))
}

const RANK_TITLES: Array<{ minLevel: number; title: string }> = [
  { minLevel: 40, title: 'Grandmaster' },
  { minLevel: 30, title: 'Master' },
  { minLevel: 22, title: 'Veteran' },
  { minLevel: 16, title: 'Adept' },
  { minLevel: 11, title: 'Journeyman' },
  { minLevel: 7, title: 'Apprentice' },
  { minLevel: 3, title: 'Initiate' },
  { minLevel: 1, title: 'Novice' }
]

export function getRankTitle(level: number): string {
  const safeLevel = Math.max(1, Math.floor(level))
  const match = RANK_TITLES.find((entry) => safeLevel >= entry.minLevel)
  return match?.title ?? 'Novice'
}
