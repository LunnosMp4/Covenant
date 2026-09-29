export type { GamificationState } from '../../../shared/gamification'

export interface XpToastState {
  id: number
  xpGained: number
  levelUp: boolean
  newLevel: number
  streakDays: number
  streakBonusApplied: boolean
}