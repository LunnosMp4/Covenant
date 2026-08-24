import type { GamificationState } from '../../../shared/gamification'
import type { Task } from './task'

export type { GamificationState }

export interface ClearCompletedResult {
  tasks: Task[]
  gamification: GamificationState
  xpGained: number
  levelUp: boolean
  streakBonusApplied: boolean
  clearedCount: number
}

export interface XpToastState {
  id: number
  xpGained: number
  levelUp: boolean
  newLevel: number
  streakDays: number
  streakBonusApplied: boolean
}
