import type { AppConfig, ButtonVisibility, ReasoningEffort, ShortcutConfig } from '../../../shared/config'
import type { McpServer } from '../../../shared/mcp/mcp'
import type { InstalledApp } from '../../../shared/launcher/launcher'
import type {
  ClearCompletedResult,
  GamificationState,
  LauncherApp,
  Preprompt,
  Task,
  Workflow,
  WorkflowLogPayload,
  WorkflowStatusUpdatePayload
} from './renderer'
import type { ChatConversation, ChatRole, ChatStreamEvent, InputContent } from '../../../shared/chat/chat'
import type { TerminalExitPayload, TerminalStartResult } from '../../../shared/terminal/terminal'
import type { UpdateStatus } from '../../../shared/system/update'
import type { PasteItemDetail, PasteItemMeta, PasteManagerSettings } from '../../../shared/paste/paste'
import type { UsageMetricsResult, UsageProjectsResult } from '../../../shared/system/usage'
import type {
  CodeEngineEvent,
  CodeFileDiff,
  CodeModel,
  CodePermissionRequest,
  CodeProject,
  CodeSession,
  CodeSettings,
  CodeStatus,
  CodeTranscriptItem
} from '../../../shared/code/code'

type CodeResult<T> = ({ success: true } & T) | { success: false; error: string }

interface CovenantAPI {
  platform: string
  window: {
    hideWindow: () => void
    notifyReadyToShow: () => void
    notifyExitComplete: () => void
    setPinned: (pinned: boolean) => void
    setIgnoreMouseEvents: (ignore: boolean) => void
    openSettings: (tab?: string) => void
    closeSettings: () => void
    minimizeSettings: () => void
    openCode: () => void
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
    onButtonVisibilityUpdated: (callback: (buttonVisibility: ButtonVisibility) => void) => () => void
    onLauncherShowSystemAppsUpdated: (callback: (showSystemApps: boolean) => void) => () => void
    onChatModelUpdated: (callback: (chatModel: string) => void) => () => void
    onReasoningEffortUpdated: (callback: (reasoningEffort: ReasoningEffort) => void) => () => void
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
    notifyReadyToShow: () => void
    notifyExitComplete: () => void
    onPrepare: (callback: () => void) => () => void
    onHide: (callback: () => void) => () => void
    onChanged: (callback: () => void) => () => void
    onShown: (callback: () => void) => () => void
    onSettingsUpdated: (callback: (settings: PasteManagerSettings) => void) => () => void
  }
  code: {
    subscribe: () => void
    onEvent: (callback: (event: CodeEngineEvent) => void) => () => void
    getStatus: () => Promise<CodeResult<{ status: CodeStatus & { hasApiKey: boolean } }>>
    setApiKey: (key: string) => Promise<CodeResult<{ status: CodeStatus & { hasApiKey: boolean } }>>
    clearApiKey: () => Promise<CodeResult<{ status: CodeStatus & { hasApiKey: boolean } }>>
    testConnection: () => Promise<CodeResult<{ connected: boolean }>>
    listModels: () => Promise<CodeResult<{ models: CodeModel[] }>>
    listProjects: () => Promise<CodeResult<{ projects: CodeProject[] }>>
    addProject: (directory: string, name?: string) => Promise<CodeResult<{ projects: CodeProject[] }>>
    removeProject: (id: string) => Promise<CodeResult<{ projects: CodeProject[] }>>
    pickDirectory: () => Promise<CodeResult<{ directory?: string }>>
    listSessions: (directory?: string) => Promise<CodeResult<{ sessions: CodeSession[] }>>
    createSession: (payload: {
      directory: string
      model?: { providerID: string; id: string; variant?: string }
      agent?: string
      title?: string
    }) => Promise<CodeResult<{ session: CodeSession }>>
    deleteSession: (sessionId: string) => Promise<CodeResult<Record<string, never>>>
    getTranscript: (sessionId: string) => Promise<CodeResult<{ transcript: CodeTranscriptItem[] }>>
    prompt: (payload: { sessionId: string; text: string }) => Promise<CodeResult<Record<string, never>>>
    interrupt: (sessionId: string) => Promise<CodeResult<Record<string, never>>>
    switchModel: (payload: {
      sessionId: string
      model: { providerID: string; id: string; variant?: string }
    }) => Promise<CodeResult<Record<string, never>>>
    listPermissions: (sessionId: string) => Promise<CodeResult<{ requests: CodePermissionRequest[] }>>
    replyPermission: (payload: {
      sessionId: string
      requestId: string
      reply: 'once' | 'always' | 'reject'
    }) => Promise<CodeResult<Record<string, never>>>
    getDiff: (sessionId: string) => Promise<CodeResult<{ diff: CodeFileDiff[] }>>
    getSettings: () => Promise<CodeResult<{ settings: CodeSettings }>>
    setSettings: (patch: Partial<CodeSettings>) => Promise<CodeResult<{ settings: CodeSettings }>>
    openLogs: () => Promise<CodeResult<Record<string, never>>>
    restartRuntime: () => Promise<CodeResult<{ status: CodeStatus & { hasApiKey: boolean } }>>
    getLogs: () => Promise<CodeResult<{ logs: string[] }>>
  }
}

declare global {
  interface Window {
    api?: CovenantAPI
  }
}

export {}
