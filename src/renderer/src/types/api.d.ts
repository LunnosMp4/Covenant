import type { AppConfig, ButtonVisibility, ReasoningEffort } from '../../../shared/config'
import type { McpServer } from '../../../shared/mcp'
import type { Preprompt } from './preprompt'
import type { LauncherApp } from './launcher-app'
import type { Workflow, WorkflowLogPayload, WorkflowStatusUpdatePayload } from './workflow'

type ChatRole = 'system' | 'user' | 'assistant'

interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  reasoning?: string
  usage?: ChatUsage
  model?: string
}

interface ChatUsage {
  promptTokens?: number
  cachedPromptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

interface ChatStreamEvent {
  id: string
  type: 'content' | 'reasoning' | 'done' | 'error'
  delta?: string
  usage?: ChatUsage
  error?: string
  model?: string
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
    onToggleVisibility: (callback: (visible: boolean) => void) => () => void
  }
  config: {
    getConfig: () => Promise<AppConfig>
    saveApiKey: (apiKey: string) => void
    saveOpenAISettings: (settings: { apiKey: string; proxyUrl: string }) => void
    getMcpServers: () => Promise<McpServer[]>
    saveMcpServer: (server: Partial<McpServer>) => Promise<McpServer[]>
    deleteMcpServer: (serverId: string) => Promise<McpServer[]>
    refreshMcpServerTools: (serverId: string) => Promise<McpServer[]>
    updateTheme: (gradientClass: string) => void
    updateStartupSetting: (launchOnStartup: boolean) => void
    updateTerminalFont: (terminalFont: string) => void
    updatePreferredShell: (preferredShell: string) => void
    updateButtonVisibility: (buttonVisibility: Partial<ButtonVisibility>) => void
    updateChatModel: (chatModel: string) => void
    updateReasoningEffort: (reasoningEffort: ReasoningEffort) => void
    getTerminalFonts: () => Promise<string[]>
    onThemeUpdated: (callback: (gradientClass: string) => void) => () => void
    onTerminalFontUpdated: (callback: (terminalFont: string) => void) => () => void
    onPreferredShellUpdated: (callback: (preferredShell?: string) => void) => () => void
    onButtonVisibilityUpdated: (callback: (buttonVisibility: ButtonVisibility) => void) => () => void
    onChatModelUpdated: (callback: (chatModel: string) => void) => () => void
    onReasoningEffortUpdated: (callback: (reasoningEffort: ReasoningEffort) => void) => () => void
  }
  chat: {
    askCovenant: (messages: Array<{ role: ChatRole; content: string }>) => Promise<string>
    askCovenantStream: (messages: Array<{ role: ChatRole; content: string }>) => Promise<{ id: string }>
    onStreamEvent: (callback: (event: ChatStreamEvent) => void) => () => void
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
  onWorkflowStatusUpdate: (callback: (payload: WorkflowStatusUpdatePayload) => void) => () => void
  onWorkflowLog: (callback: (payload: WorkflowLogPayload) => void) => () => void
}

declare global {
  interface Window {
    api?: CovenantAPI
    electronAPI?: {
      hideWindow: () => void
      setPinned: (pinned: boolean) => void
      openSettings: () => void
      closeSettings: () => void
      minimizeSettings: () => void
      getConfig: () => Promise<AppConfig>
      saveApiKey: (apiKey: string) => void
      saveOpenAISettings: (settings: { apiKey: string; proxyUrl: string }) => void
      getMcpServers: () => Promise<McpServer[]>
      saveMcpServer: (server: Partial<McpServer>) => Promise<McpServer[]>
      deleteMcpServer: (serverId: string) => Promise<McpServer[]>
      refreshMcpServerTools: (serverId: string) => Promise<McpServer[]>
      updateTheme: (gradientClass: string) => void
      updateStartupSetting: (launchOnStartup: boolean) => void
      updateTerminalFont: (terminalFont: string) => void
      updatePreferredShell: (preferredShell: string) => void
      updateButtonVisibility: (buttonVisibility: Partial<ButtonVisibility>) => void
      updateChatModel: (chatModel: string) => void
      updateReasoningEffort: (reasoningEffort: ReasoningEffort) => void
      getTerminalFonts: () => Promise<string[]>
      onThemeUpdated: (callback: (gradientClass: string) => void) => () => void
      onTerminalFontUpdated: (callback: (terminalFont: string) => void) => () => void
      onPreferredShellUpdated: (callback: (preferredShell?: string) => void) => () => void
      onButtonVisibilityUpdated: (callback: (buttonVisibility: ButtonVisibility) => void) => () => void
      onChatModelUpdated: (callback: (chatModel: string) => void) => () => void
      onReasoningEffortUpdated: (callback: (reasoningEffort: ReasoningEffort) => void) => () => void
      askCovenant: (messages: Array<{ role: ChatRole; content: string }>) => Promise<string>
      onToggleVisibility: (callback: (visible: boolean) => void) => () => void
    }
  }
}

export {}
