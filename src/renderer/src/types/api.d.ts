import type { AppConfig, ButtonVisibility, ReasoningEffort, ShortcutConfig } from '../../../shared/config'
import type { McpServer } from '../../../shared/mcp'
import type { Preprompt } from './preprompt'
import type { LauncherApp } from './launcher-app'
import type { Workflow, WorkflowLogPayload, WorkflowStatusUpdatePayload } from './workflow'
import type { Task } from './task'
import type { ClearCompletedResult, GamificationState } from './gamification'
import type { ChatConversation, ChatRole, ChatStreamEvent, InputContent } from '../../../shared/chat'
import type { TerminalExitPayload, TerminalStartResult } from '../../../shared/terminal'

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
    onOpenTasks: (callback: () => void) => () => void
  }
  config: {
    getConfig: () => Promise<AppConfig>
    saveApiKey: (apiKey: string) => void
    saveOpenAISettings: (settings: { apiKey: string; proxyUrl: string }) => void
    markOnboarded: () => void
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
    updateAutoUpdate: (enabled: boolean) => void
    checkForUpdates: () => Promise<boolean>
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
    cancelStream: (streamId: string) => void
    getConversations: () => Promise<ChatConversation[]>
    getConversation: (id: string) => Promise<ChatConversation | null>
    saveConversation: (conversation: ChatConversation) => Promise<ChatConversation[]>
    deleteConversation: (id: string) => Promise<ChatConversation[]>
    generateConversationTitle: (prompt: string) => Promise<string>
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
    getTasks: () => Promise<Task[]>
    getGamification: () => Promise<GamificationState>
    addTask: (title: string) => Promise<Task[]>
    toggleTask: (taskId: string) => Promise<Task[]>
    deleteTask: (taskId: string) => Promise<Task[]>
    reorderTasks: (orderedIds: string[]) => Promise<Task[]>
    clearCompletedTasks: () => Promise<ClearCompletedResult>
    onTasksUpdated: (callback: (tasks: Task[]) => void) => () => void
  }
  selectFile: () => Promise<string>
  getFavicon: (url: string) => Promise<string>
  launchApp: (path: string, launchArguments: string) => Promise<{ success: boolean; error?: string }>
  executeWorkflow: (workflow: Partial<Workflow>) => Promise<{ success: boolean; error?: string }>
  onWorkflowStatusUpdate: (callback: (payload: WorkflowStatusUpdatePayload) => void) => () => void
  onWorkflowLog: (callback: (payload: WorkflowLogPayload) => void) => () => void
  clipboard: {
    writeText: (text: string) => void
  }
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
      markOnboarded: () => void
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
    writeText: (text: string) => void
    }
  }
}

export {}
