import type { GamificationState } from './gamification'
import type { TaskActionType, TaskCategory, TaskTier } from './gamification'

export interface Task {
  id: string
  title: string
  done: boolean
  createdAt: number
  evaluating?: boolean
  tier?: TaskTier
  xpReward?: number
  estimatedMinutes?: number
  categoryTag?: TaskCategory
  actionType?: TaskActionType
  rationale?: string
}

export interface ClearCompletedResult {
  tasks: Task[]
  gamification: GamificationState
  xpGained: number
  levelUp: boolean
  streakBonusApplied: boolean
  clearedCount: number
}