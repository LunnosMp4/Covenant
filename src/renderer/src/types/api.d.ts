import type { Preprompt } from './preprompt'
import type { LauncherApp } from './launcher-app'
import type { Workflow, WorkflowLogPayload, WorkflowStatusUpdatePayload } from './workflow'

interface AppConfig {
  apiKey: string
  themeGradient: string
  proxyUrl: string
}

interface PrometheusAPI {
  window: {
    hideWindow: () => void
    openSettings: () => void
    closeSettings: () => void
    minimizeSettings: () => void
    onToggleVisibility: (callback: (visible: boolean) => void) => (() => void) | void
  }
  config: {
    getConfig: () => Promise<AppConfig>
    saveApiKey: (apiKey: string) => void
    saveOpenAISettings: (settings: { apiKey: string; proxyUrl: string }) => void
    updateTheme: (gradientClass: string) => void
    onThemeUpdated: (callback: (gradientClass: string) => void) => (() => void) | void
  }
  chat: {
    askPrometheus: (prompt: string) => Promise<string>
  }
  store: {
    getPreprompts: () => Promise<Preprompt[]>
    savePreprompt: (preprompt: Partial<Preprompt>) => Promise<Preprompt[]>
    deletePreprompt: (prepromptId: string) => Promise<Preprompt[]>
    getApps: () => Promise<LauncherApp[]>
    saveApp: (launcherApp: Partial<LauncherApp>) => Promise<LauncherApp[]>
    deleteApp: (appId: string) => Promise<LauncherApp[]>
    getWorkflows: () => Promise<Workflow[]>
    saveWorkflow: (workflow: Partial<Workflow>) => Promise<Workflow[]>
    deleteWorkflow: (workflowId: string) => Promise<Workflow[]>
  }
  selectFile: () => Promise<string>
  getFileIcon: (filePath: string) => Promise<string>
  launchApp: (path: string, launchArguments: string) => Promise<{ success: boolean; error?: string }>
  executeWorkflow: (workflow: Partial<Workflow>) => Promise<{ success: boolean; error?: string }>
  onWorkflowStatusUpdate: (callback: (payload: WorkflowStatusUpdatePayload) => void) => (() => void) | void
  onWorkflowLog: (callback: (payload: WorkflowLogPayload) => void) => (() => void) | void
}

declare global {
  interface Window {
    api?: PrometheusAPI
    electronAPI?: {
      hideWindow: () => void
      openSettings: () => void
      closeSettings: () => void
      minimizeSettings: () => void
      getConfig: () => Promise<AppConfig>
      saveApiKey: (apiKey: string) => void
      saveOpenAISettings: (settings: { apiKey: string; proxyUrl: string }) => void
      updateTheme: (gradientClass: string) => void
      onThemeUpdated: (callback: (gradientClass: string) => void) => (() => void) | void
      askPrometheus: (prompt: string) => Promise<string>
      onToggleVisibility: (callback: (visible: boolean) => void) => (() => void) | void
    }
  }
}

export {}
