export type { GamificationState } from '../../../shared/tasks/gamification'
export type { LauncherApp, LauncherAppTarget } from '../../../shared/launcher/launcher-app'
export type { Preprompt } from '../../../shared/domain/preprompt'
export type { ClearCompletedResult, Task } from '../../../shared/tasks/task'
export type {
  Workflow,
  WorkflowLanguage,
  WorkflowLogPayload,
  WorkflowStatusUpdatePayload
} from '../../../shared/domain/workflow'

export type WorkflowExecutionStatus = 'idle' | 'running' | 'success' | 'error'

export interface WorkflowExecutionState {
  status: WorkflowExecutionStatus
  logs: string[]
}

export interface XpToastState {
  id: number
  xpGained: number
  levelUp: boolean
  newLevel: number
  streakDays: number
  streakBonusApplied: boolean
}
