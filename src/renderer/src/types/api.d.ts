import type { Preprompt } from './preprompt'
import type { LauncherApp } from './launcher-app'
import type { Workflow, WorkflowLogPayload, WorkflowStatusUpdatePayload } from './workflow'

interface AppConfig {
  apiKey: string
  themeGradient: string
  proxyUrl: string
  launchOnStartup: boolean
  terminalFont: string
}

type ChatRole = 'system' | 'user' | 'assistant'

interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
}

interface ChatConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  systemPrompt?: string
}

interface TerminalStartResult {
  pid: number
  shell: string
  created: boolean
}

interface TerminalExitPayload {
  exitCode: number
  signal?: number
}

interface CovenantAPI {
  window: {
    hideWindow: () => void
    openSettings: () => void
    closeSettings: () => void
    minimizeSettings: () => void
    /** Subscribes to window show/hide events. Returns a cleanup function that removes the listener. */
    onToggleVisibility: (callback: (visible: boolean) => void) => () => void
  }
  config: {
    getConfig: () => Promise<AppConfig>
    saveApiKey: (apiKey: string) => void
    saveOpenAISettings: (settings: { apiKey: string; proxyUrl: string }) => void
    updateTheme: (gradientClass: string) => void
    updateStartupSetting: (launchOnStartup: boolean) => void
    updateTerminalFont: (terminalFont: string) => void
    getTerminalFonts: () => Promise<string[]>
    /** Subscribes to theme changes. Returns a cleanup function that removes the listener. */
    onThemeUpdated: (callback: (gradientClass: string) => void) => () => void
    /** Subscribes to terminal font changes. Returns a cleanup function that removes the listener. */
    onTerminalFontUpdated: (callback: (terminalFont: string) => void) => () => void
  }
  chat: {
    askCovenant: (messages: Array<{ role: ChatRole; content: string }>) => Promise<string>
    getConversations: () => Promise<ChatConversation[]>
    getConversation: (id: string) => Promise<ChatConversation | null>
    saveConversation: (conversation: ChatConversation) => Promise<ChatConversation[]>
  }
  terminal: {
    startTerminal: (size?: { cols?: number; rows?: number }) => Promise<TerminalStartResult>
    sendInput: (data: string) => Promise<{ success: boolean }>
    resize: (cols: number, rows: number) => Promise<{ success: boolean }>
    killTerminal: () => Promise<{ success: boolean }>
    onData: (callback: (chunk: string) => void) => () => void
    onExit: (callback: (payload: TerminalExitPayload) => void) => () => void
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
  /** Subscribes to workflow status events. Returns a cleanup function that removes the listener. */
  onWorkflowStatusUpdate: (callback: (payload: WorkflowStatusUpdatePayload) => void) => () => void
  /** Subscribes to workflow log events. Returns a cleanup function that removes the listener. */
  onWorkflowLog: (callback: (payload: WorkflowLogPayload) => void) => () => void
}

declare global {
  interface Window {
    api?: CovenantAPI
    electronAPI?: {
      hideWindow: () => void
      openSettings: () => void
      closeSettings: () => void
      minimizeSettings: () => void
      getConfig: () => Promise<AppConfig>
      saveApiKey: (apiKey: string) => void
      saveOpenAISettings: (settings: { apiKey: string; proxyUrl: string }) => void
      updateTheme: (gradientClass: string) => void
      updateStartupSetting: (launchOnStartup: boolean) => void
      updateTerminalFont: (terminalFont: string) => void
      getTerminalFonts: () => Promise<string[]>
      onThemeUpdated: (callback: (gradientClass: string) => void) => () => void
      onTerminalFontUpdated: (callback: (terminalFont: string) => void) => () => void
      askCovenant: (messages: Array<{ role: ChatRole; content: string }>) => Promise<string>
      onToggleVisibility: (callback: (visible: boolean) => void) => () => void
    }
  }
}

export {}
