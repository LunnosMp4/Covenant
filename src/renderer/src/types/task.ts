import type { TaskActionType, TaskCategory, TaskTier } from '../../../shared/gamification'

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
