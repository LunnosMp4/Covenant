import type { GamificationState } from '../../../shared/tasks/gamification'

export const DEFAULT_GAMIFICATION_STATE: GamificationState = {
  currentLevel: 1,
  currentXP: 0,
  totalLifetimeXP: 0,
  streakDays: 0,
  lastActiveDate: null
}

export const MAX_WORKFLOW_LOG_LINES = 200
export const CHAT_SCROLL_HEIGHT = 300
export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const MAX_ATTACHED_IMAGES = 10
