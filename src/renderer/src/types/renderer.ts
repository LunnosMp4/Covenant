export type { GamificationState } from '../../../shared/tasks/gamification'
export type { Preprompt } from '../../../shared/domain/preprompt'
export type { ClearCompletedResult, Task } from '../../../shared/tasks/task'
export type {
  MeetingMeta,
  MeetingSegment,
  MeetingStatus,
  Note,
  NoteAiEvent,
  NoteKind,
  NoteMeetingEvent,
  NoteMeta
} from '../../../shared/notes/note'
export type { NoteAiAction, NoteAiRequest } from '../../../shared/notes/prompts'
export type {
  InteractiveRect,
  InteractiveViewport
} from '../../../shared/windows/interactive'
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
