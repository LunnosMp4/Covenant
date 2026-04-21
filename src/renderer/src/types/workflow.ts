export type WorkflowLanguage = 'powershell' | 'cmd' | 'python' | 'nodejs' | 'shell' | 'custom'

export interface Workflow {
  id: string
  title: string
  language: WorkflowLanguage
  customCommand?: string
  content: string
}
