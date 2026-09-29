export type {
  Workflow,
  WorkflowLanguage,
  WorkflowLogPayload,
  WorkflowStatusUpdatePayload
} from '../../../shared/workflow'

export type WorkflowExecutionStatus = 'idle' | 'running' | 'success' | 'error'

export interface WorkflowExecutionState {
  status: WorkflowExecutionStatus
  logs: string[]
}