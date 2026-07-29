import type { AppConfig, ButtonVisibility, ReasoningEffort, ShortcutConfig } from '../../../shared/config'
import type { McpServer } from '../../../shared/mcp'
import type { Preprompt } from './preprompt'
import type { LauncherApp } from './launcher-app'
import type { Workflow, WorkflowLogPayload, WorkflowStatusUpdatePayload } from './workflow'

type ChatRole = 'system' | 'user' | 'assistant'

type InputImageContent = { type: 'input_image'; image_url: string }
type InputTextContent = { type: 'input_text'; text: string }
type InputContent = InputTextContent | InputImageContent

interface ChatMessageImage {
  base64: string
  fileName: string
  mimeType: string
}

interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  reasoning?: string
  reasoningTitle?: string
  usage?: ChatUsage
  model?: string
  sources?: Source[]
  images?: ChatMessageImage[]
}

interface ChatUsage {
  promptTokens?: number
  cachedPromptTokens?: number
  completionTokens?: number
  totalTokens?: number
  reasoningTokens?: number
}

interface Source {
  title: string
  url: string
}

interface ChatStreamEvent {
  id: string
  type: 'content' | 'reasoning' | 'done' | 'error'
    | 'reasoning-start' | 'reasoning-title' | 'reasoning-delta' | 'reasoning-end'
    | 'tool-start' | 'sources'
  delta?: string
  usage?: ChatUsage
  error?: string
  model?: string
  itemId?: string
  title?: string
  toolType?: string
  toolName?: string
  actionType?: string
  query?: string
  sources?: Source[]
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
  sessionId: string
  pid: number
  shell: string
  created: boolean
  error?: string
}

interface TerminalExitPayload {
  sessionId: string
  exitCode: number
  signal?: number
}

interface CovenantAPI {
  window: {
    hideWindow: () => void
    setPinned: (pinned: boolean) => void
    openSettings: (tab?: string) => void
    closeSettings: () => void
    minimizeSettings: () => void
    setExpanded: (expanded: boolean) => void
    onNavigateSettingsTab: (callback: (tab: string) => void) => () => void
    onToggleVisibility: (callback: (visible: boolean, terminalMode?: boolean) => void) => () => void
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
    updateWebSearch: (enableWebSearch: boolean) => void
    updateAutoCollapseReasoning: (autoCollapseReasoning: boolean) => void
    updateShortcuts: (shortcuts: ShortcutConfig) => void
    getTerminalFonts: () => Promise<string[]>
    onThemeUpdated: (callback: (gradientClass: string) => void) => () => void
    onTerminalFontUpdated: (callback: (terminalFont: string) => void) => () => void
    onPreferredShellUpdated: (callback: (preferredShell?: string) => void) => () => void
    onButtonVisibilityUpdated: (callback: (buttonVisibility: ButtonVisibility) => void) => () => void
    onChatModelUpdated: (callback: (chatModel: string) => void) => () => void
    onReasoningEffortUpdated: (callback: (reasoningEffort: ReasoningEffort) => void) => () => void
    onWebSearchUpdated: (callback: (enableWebSearch: boolean) => void) => () => void
    onAutoCollapseReasoningUpdated: (callback: (autoCollapseReasoning: boolean) => void) => () => void
    onShortcutsUpdated: (callback: (shortcuts: ShortcutConfig) => void) => () => void
  }
  chat: {
    askCovenant: (messages: Array<{ role: ChatRole; content: string | InputContent[] }>) => Promise<string>
    askCovenantStream: (messages: Array<{ role: ChatRole; content: string | InputContent[] }>) => Promise<{ id: string }>
    onStreamEvent: (callback: (event: ChatStreamEvent) => void) => () => void
    getConversations: () => Promise<ChatConversation[]>
    getConversation: (id: string) => Promise<ChatConversation | null>
    saveConversation: (conversation: ChatConversation) => Promise<ChatConversation[]>
  }
  terminal: {
    startTerminal: (size?: { cols?: number; rows?: number }) => Promise<TerminalStartResult>
    sendInput: (sessionId: string, data: string) => Promise<{ success: boolean }>
    resize: (sessionId: string, cols: number, rows: number) => Promise<{ success: boolean }>
    killTerminal: (sessionId: string) => Promise<{ success: boolean }>
    onData: (callback: (sessionId: string, chunk: string) => void) => () => void
    onExit: (callback: (payload: TerminalExitPayload) => void) => () => void
    reportActiveSession: (sessionId: string) => void
    listSessions: () => Promise<Array<{ sessionId: string; shell: string }>>
    sendToActiveSession: (code: string) => Promise<{ success: boolean; sessionId?: string; created?: boolean }>
  }
  voice: {
    transcribe: (audioBuffer: ArrayBuffer) => Promise<string>
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
      setExpanded: (expanded: boolean) => void
      openSettings: (tab?: string) => void
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
      updateWebSearch: (enableWebSearch: boolean) => void
      updateAutoCollapseReasoning: (autoCollapseReasoning: boolean) => void
      updateShortcuts: (shortcuts: ShortcutConfig) => void
      getTerminalFonts: () => Promise<string[]>
      onThemeUpdated: (callback: (gradientClass: string) => void) => () => void
      onTerminalFontUpdated: (callback: (terminalFont: string) => void) => () => void
      onPreferredShellUpdated: (callback: (preferredShell?: string) => void) => () => void
      onButtonVisibilityUpdated: (callback: (buttonVisibility: ButtonVisibility) => void) => () => void
      onChatModelUpdated: (callback: (chatModel: string) => void) => () => void
      onReasoningEffortUpdated: (callback: (reasoningEffort: ReasoningEffort) => void) => () => void
      askCovenant: (messages: Array<{ role: ChatRole; content: string | InputContent[] }>) => Promise<string>
      transcribe: (audioBuffer: ArrayBuffer) => Promise<string>
    onToggleVisibility: (callback: (visible: boolean) => void) => () => void
    }
  }
}

export {}
