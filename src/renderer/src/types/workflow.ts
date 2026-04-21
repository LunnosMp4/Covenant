export type WorkflowLanguage = 'powershell' | 'cmd' | 'python' | 'nodejs' | 'shell' | 'custom'

export type WorkflowExecutionStatus = 'idle' | 'running' | 'success' | 'error'

export interface WorkflowStatusUpdatePayload {
  id: string
  status: 'running' | 'success' | 'error'
}

export interface WorkflowLogPayload {
  id: string
  type: 'info' | 'error'
  text: string
}

export interface WorkflowExecutionState {
  status: WorkflowExecutionStatus
  logs: string[]
}

export interface Workflow {
  id: string
  title: string
  language: WorkflowLanguage
  customCommand?: string
  content: string
}
