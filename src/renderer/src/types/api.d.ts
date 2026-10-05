import type { AppConfig, ButtonVisibility, ReasoningEffort, ShortcutConfig } from '../../../shared/config'
import type { McpServer } from '../../../shared/mcp'
import type { Preprompt } from './preprompt'
import type { LauncherApp } from './launcher-app'
import type { InstalledApp } from '../../../shared/launcher'
import type { Workflow, WorkflowLogPayload, WorkflowStatusUpdatePayload } from './workflow'
import type { Task } from './task'
import type { ClearCompletedResult, GamificationState } from './gamification'
import type { ChatConversation, ChatRole, ChatStreamEvent, InputContent } from '../../../shared/chat'
import type { TerminalExitPayload, TerminalStartResult } from '../../../shared/terminal'
import type { UpdateStatus } from '../../../shared/update'
import type { PasteItemDetail, PasteItemMeta, PasteManagerSettings } from '../../../shared/paste'
import type { UsageMetricsResult, UsageProjectsResult } from '../../../shared/usage'

interface CovenantAPI {
  platform: string
  window: {
    hideWindow: () => void
    notifyReadyToShow: () => void
    notifyExitComplete: () => void
    setPinned: (pinned: boolean) => void
    openSettings: (tab?: string) => void
    closeSettings: () => void
    minimizeSettings: () => void
    setExpanded: (expanded: boolean) => void
    onNavigateSettingsTab: (callback: (tab: string) => void) => () => void
    onSettingsShown: (callback: (isRestore: boolean) => void) => () => void
    onToggleVisibility: (
      callback: (visible: boolean, terminalMode?: boolean, phase?: 'prepare' | 'animate') => void
    ) => () => void
    onOpenTasks: (callback: () => void) => () => void
    onChatPrompt: (callback: (text: string) => void) => () => void
  }
  config: {
    getConfig: () => Promise<AppConfig>
      saveApiKey: (apiKey: string) => void
      saveOpenAISettings: (settings: { apiKey?: string; proxyUrl?: string; adminApiKey?: string }) => void
      markOnboarded: () => void
    getMcpServers: () => Promise<McpServer[]>
    saveMcpServer: (server: Partial<McpServer>) => Promise<McpServer[]>
deleteMcpServer: (serverId: string) => Promise<McpServer[]>
      refreshMcpServerTools: (serverId: string) => Promise<McpServer[]>
      testMcpServer: (payload: {
        name: string
        url: string
        auth: McpServer['auth']
        appendMcpSuffix?: boolean
      }) => Promise<{ ok: boolean; message: string; toolCount: number; lastError?: string }>
      updateTheme: (gradientClass: string) => void
    updateStartupSetting: (launchOnStartup: boolean) => void
    updateTerminalFont: (terminalFont: string) => void
    updatePreferredShell: (preferredShell: string) => void
    updateButtonVisibility: (buttonVisibility: Partial<ButtonVisibility>) => void
    updateLauncherShowSystemApps: (showSystemApps: boolean) => void
    updateChatModel: (chatModel: string) => void
    updateReasoningEffort: (reasoningEffort: ReasoningEffort) => void
    updateWebSearch: (enableWebSearch: boolean) => void
    updateAutoCollapseReasoning: (autoCollapseReasoning: boolean) => void
    updateTextureIntensity: (textureIntensity: number) => void
    updateAutoUpdate: (enabled: boolean) => void
    updateUsageProject: (projectId: string) => void
    checkForUpdates: () => Promise<UpdateStatus>
    getUpdateStatus: () => Promise<UpdateStatus>
    installUpdate: () => void
    onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
    updateShortcuts: (shortcuts: ShortcutConfig) => void
    getTerminalFonts: () => Promise<string[]>
    onThemeUpdated: (callback: (gradientClass: string) => void) => () => void
    onTerminalFontUpdated: (callback: (terminalFont: string) => void) => () => void
    onPreferredShellUpdated: (callback: (preferredShell?: string) => void) => () => void
    onButtonVisibilityUpdated: (callback: (buttonVisibility: ButtonVisibility) => void) => () => void
    onLauncherShowSystemAppsUpdated: (callback: (showSystemApps: boolean) => void) => () => void
    onChatModelUpdated: (callback: (chatModel: string) => void) => () => void
    onReasoningEffortUpdated: (callback: (reasoningEffort: ReasoningEffort) => void) => () => void
    onWebSearchUpdated: (callback: (enableWebSearch: boolean) => void) => () => void
    onAutoCollapseReasoningUpdated: (callback: (autoCollapseReasoning: boolean) => void) => () => void
    onTextureIntensityUpdated: (callback: (textureIntensity: number) => void) => () => void
    onShortcutsUpdated: (callback: (shortcuts: ShortcutConfig) => void) => () => void
  }
  usage: {
    getMetrics: (rangeDays?: number, projectId?: string) => Promise<UsageMetricsResult>
    getProjects: () => Promise<UsageProjectsResult>
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
    getGlobalInstructions: () => Promise<string>
    saveGlobalInstructions: (value: string) => Promise<string>
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
  installedApps: {
    list: () => Promise<InstalledApp[]>
    icon: (appPath: string) => Promise<string>
  }
  launchApp: (path: string, launchArguments: string) => Promise<{ success: boolean; error?: string }>
  executeWorkflow: (workflow: Partial<Workflow>) => Promise<{ success: boolean; error?: string }>
  onWorkflowStatusUpdate: (callback: (payload: WorkflowStatusUpdatePayload) => void) => () => void
  onWorkflowLog: (callback: (payload: WorkflowLogPayload) => void) => () => void
  clipboard: {
    writeText: (text: string) => void
  }
  openExternal: (url: string) => Promise<{ success: boolean }>
  excalidraw: {
    readCheckpoint: (
      serverId: string | undefined,
      checkpointId: string
    ) => Promise<{ ok: boolean; elements?: unknown[]; serverId?: string; error?: string }>
    exportToExcalidraw: (
      serverId: string | undefined,
      json: string
    ) => Promise<{ ok: boolean; url?: string; serverId?: string; error?: string }>
    clearStorage: () => Promise<{ ok: boolean }>
  }
  paste: {
    list: () => Promise<PasteItemMeta[]>
    getDetail: (id: string) => Promise<PasteItemDetail | null>
    getSettings: () => Promise<PasteManagerSettings>
    updateSettings: (patch: Partial<PasteManagerSettings>) => Promise<PasteManagerSettings>
    setPinned: (id: string, pinned: boolean) => Promise<{ success: boolean }>
    remove: (id: string) => Promise<{ success: boolean }>
    clear: (keepPinned: boolean) => Promise<{ removed: number }>
    copy: (id: string, asPlainText?: boolean) => Promise<{ success: boolean }>
    saveImage: (id: string) => Promise<{ success: boolean; path?: string; canceled?: boolean }>
    hideWindow: () => void
    askInChat: (text: string) => void
    onChanged: (callback: () => void) => () => void
    onShown: (callback: () => void) => () => void
    onSettingsUpdated: (callback: (settings: PasteManagerSettings) => void) => () => void
  }
}

declare global {
  interface Window {
    api?: CovenantAPI
    electronAPI?: {
      hideWindow: () => void
      notifyReadyToShow: () => void
      notifyExitComplete: () => void
      setPinned: (pinned: boolean) => void
      setExpanded: (expanded: boolean) => void
      openSettings: (tab?: string) => void
      closeSettings: () => void
      minimizeSettings: () => void
      getConfig: () => Promise<AppConfig>
      saveApiKey: (apiKey: string) => void
    saveOpenAISettings: (settings: { apiKey?: string; proxyUrl?: string; adminApiKey?: string }) => void
      markOnboarded: () => void
      getMcpServers: () => Promise<McpServer[]>
      saveMcpServer: (server: Partial<McpServer>) => Promise<McpServer[]>
      deleteMcpServer: (serverId: string) => Promise<McpServer[]>
refreshMcpServerTools: (serverId: string) => Promise<McpServer[]>
    testMcpServer: (payload: {
      name: string
      url: string
      auth: McpServer['auth']
      appendMcpSuffix?: boolean
    }) => Promise<{ ok: boolean; message: string; toolCount: number; lastError?: string }>
      updateTheme: (gradientClass: string) => void
      updateStartupSetting: (launchOnStartup: boolean) => void
      updateTerminalFont: (terminalFont: string) => void
      updatePreferredShell: (preferredShell: string) => void
      updateButtonVisibility: (buttonVisibility: Partial<ButtonVisibility>) => void
      updateLauncherShowSystemApps: (showSystemApps: boolean) => void
      updateChatModel: (chatModel: string) => void
      updateReasoningEffort: (reasoningEffort: ReasoningEffort) => void
      updateWebSearch: (enableWebSearch: boolean) => void
      updateAutoCollapseReasoning: (autoCollapseReasoning: boolean) => void
      updateTextureIntensity: (textureIntensity: number) => void
      onTextureIntensityUpdated: (callback: (textureIntensity: number) => void) => () => void
    updateAutoUpdate: (enabled: boolean) => void
    updateUsageProject: (projectId: string) => void
      checkForUpdates: () => Promise<UpdateStatus>
      getUpdateStatus: () => Promise<UpdateStatus>
      installUpdate: () => void
      onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
      updateShortcuts: (shortcuts: ShortcutConfig) => void
      getTerminalFonts: () => Promise<string[]>
      onThemeUpdated: (callback: (gradientClass: string) => void) => () => void
      onTerminalFontUpdated: (callback: (terminalFont: string) => void) => () => void
      onPreferredShellUpdated: (callback: (preferredShell?: string) => void) => () => void
      onButtonVisibilityUpdated: (callback: (buttonVisibility: ButtonVisibility) => void) => () => void
      onLauncherShowSystemAppsUpdated: (callback: (showSystemApps: boolean) => void) => () => void
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
