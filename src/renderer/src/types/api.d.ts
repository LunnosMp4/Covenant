import type { AppConfig, ButtonVisibility, NotesSettings, ReasoningEffort, ShortcutConfig } from '../../../shared/config'
import type { WindowView } from '../../../shared/view'
import type { McpServer } from '../../../shared/mcp/mcp'
import type { InstalledApp } from '../../../shared/launcher/launcher'
import type {
  ClearCompletedResult,
  GamificationState,
  Preprompt,
  Task,
  Workflow,
  WorkflowLogPayload,
  WorkflowStatusUpdatePayload
} from './renderer'
import type { ChatConversation, ChatRole, ChatStreamEvent, InputContent } from '../../../shared/chat/chat'
import type {
  TerminalApprovalReply,
  TerminalApprovalRequest,
  TerminalCommandResult,
  TerminalExitPayload,
  TerminalSessionState,
  TerminalStartResult
} from '../../../shared/terminal/terminal'
import type { UpdateStatus } from '../../../shared/system/update'
import type { PasteItemDetail, PasteItemMeta, PasteManagerSettings } from '../../../shared/paste/paste'
import type {
  Note,
  NoteAiEvent,
  NoteCreateInput,
  NoteMeetingEvent,
  NoteMeta,
  NoteSaveInput
} from '../../../shared/notes/note'
import type { NoteAiRequest } from '../../../shared/notes/prompts'
import type { UsageMetricsResult, UsageProjectsResult } from '../../../shared/system/usage'
import type {
  CodeActivitySummary,
  CodeAgent,
  CodeEngineEvent,
  CodeFileDiff,
  CodeFormRequest,
  CodeFormValue,
  CodeModel,
  CodePermissionRequest,
  CodeProject,
  CodeSession,
  CodeSettings,
  CodeStatus,
  CodeTranscriptItem
} from '../../../shared/code/code'
import type {
  CodeConnection,
  CodeConnectionStatus,
  RemoteBrowseResult
} from '../../../shared/code/connection'

type CodeResult<T> = ({ success: true } & T) | { success: false; error: string }

type CodeStatusWithConnection = CodeStatus & {
  hasApiKey: boolean
  connectionId?: string
  connectionKind?: 'local' | 'ssh'
  connectionName?: string
}

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
    reportView: (view: WindowView) => void
    onSetView: (callback: (view: WindowView) => void) => () => void
    onToggleCodeMode: (callback: () => void) => () => void
    onNavigateSettingsTab: (callback: (tab: string) => void) => () => void
    onSettingsShown: (callback: (isRestore: boolean) => void) => () => void
    onToggleVisibility: (
      callback: (visible: boolean, view?: WindowView, phase?: 'prepare' | 'animate') => void
    ) => () => void
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
    updateNotesSettings: (settings: Partial<NotesSettings>) => void
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
    onNotesSettingsUpdated: (callback: (settings: NotesSettings) => void) => () => void
    onShortcutsUpdated: (callback: (shortcuts: ShortcutConfig) => void) => () => void
  }
  usage: {
    getMetrics: (rangeDays?: number, projectId?: string) => Promise<UsageMetricsResult>
    getProjects: () => Promise<UsageProjectsResult>
  }
  chat: {
    askCovenant: (
      messages: Array<{ role: ChatRole; content: string | InputContent[] }>,
      options?: { terminalSessionId?: string }
    ) => Promise<string>
    askCovenantStream: (
      messages: Array<{ role: ChatRole; content: string | InputContent[] }>,
      options?: { terminalSessionId?: string }
    ) => Promise<{ id: string }>
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
    listSessions: () => Promise<Array<{ sessionId: string; shell: string; cwd: string }>>
    sendToActiveSession: (code: string) => Promise<{ success: boolean; sessionId?: string; created?: boolean }>
    getState: (sessionId: string) => Promise<
      { success: true; state: TerminalSessionState } | { success: false; error: string }
    >
    read: (sessionId: string, lines?: number) => Promise<
      { success: true; output: string } | { success: false; error: string }
    >
    runCommand: (sessionId: string, command: string) => Promise<
      (TerminalCommandResult & { sessionId?: string }) | { success: false; error: string }
    >
    onStateChanged: (
      callback: (payload: { sessionId: string; state: TerminalSessionState }) => void
    ) => () => void
    onApprovalRequest: (callback: (request: TerminalApprovalRequest) => void) => () => void
    replyApproval: (
      requestId: string,
      reply: TerminalApprovalReply
    ) => Promise<{ success: boolean }>
  }
  voice: {
    transcribe: (audioBuffer: ArrayBuffer) => Promise<string>
    setRecordingActive: (active: boolean) => void
    onStopRequest: (callback: () => void) => () => void
  }
  store: {
    getPreprompts: () => Promise<Preprompt[]>
    savePreprompt: (preprompt: Partial<Preprompt>) => Promise<Preprompt[]>
    deletePreprompt: (prepromptId: string) => Promise<Preprompt[]>
    getGlobalInstructions: () => Promise<string>
    saveGlobalInstructions: (value: string) => Promise<string>
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
    askInChat: (text: string) => void
    onChanged: (callback: () => void) => () => void
    onSettingsUpdated: (callback: (settings: PasteManagerSettings) => void) => () => void
  }
  notes: {
    list: () => Promise<NoteMeta[]>
    get: (id: string) => Promise<Note | null>
    create: (input: NoteCreateInput) => Promise<Note>
    save: (input: NoteSaveInput) => Promise<Note | null>
    delete: (id: string) => Promise<NoteMeta[]>
    getSettings: () => Promise<NotesSettings>
    onChanged: (callback: (metas: NoteMeta[]) => void) => () => void
    meeting: {
      start: (input: { captureSystemAudio?: boolean }) => Promise<Note>
      appendSegment: (payload: {
        noteId: string
        index: number
        durationMs: number
        data: ArrayBuffer
      }) => Promise<{ success: boolean; error?: string }>
      finish: (payload: { noteId: string; durationMs: number }) => Promise<Note | null>
      cancel: (noteId: string) => Promise<void>
      summarize: (noteId: string) => Promise<Note | null>
      retranscribe: (noteId: string) => Promise<Note | null>
      setActive: (active: boolean) => void
      onEvent: (callback: (event: NoteMeetingEvent) => void) => () => void
      onStopRequest: (callback: () => void) => () => void
    }
    ai: {
      run: (request: NoteAiRequest) => Promise<{ id: string }>
      cancel: (id: string) => void
      onEvent: (callback: (event: NoteAiEvent) => void) => () => void
    }
  }
  code: {
    subscribe: () => void
    onEvent: (callback: (event: CodeEngineEvent) => void) => () => void
    onActivityStatus: (callback: (summary: CodeActivitySummary) => void) => () => void
    ackActivity: () => Promise<CodeResult<Record<string, never>>>
    getStatus: () => Promise<CodeResult<{ status: CodeStatusWithConnection }>>
    setApiKey: (key: string) => Promise<CodeResult<{ status: CodeStatusWithConnection }>>
    clearApiKey: () => Promise<CodeResult<{ status: CodeStatusWithConnection }>>
    testConnection: () => Promise<CodeResult<{ connected: boolean }>>
    listModels: () => Promise<CodeResult<{ models: CodeModel[] }>>
    listAgents: () => Promise<CodeResult<{ agents: CodeAgent[] }>>
    switchAgent: (payload: {
      sessionId: string
      agent: string
    }) => Promise<CodeResult<Record<string, never>>>
    listProjects: () => Promise<CodeResult<{ projects: CodeProject[] }>>
    addProject: (
      directory: string,
      name?: string,
      connectionId?: string
    ) => Promise<CodeResult<{ projects: CodeProject[] }>>
    removeProject: (id: string) => Promise<CodeResult<{ projects: CodeProject[] }>>
    pickDirectory: () => Promise<CodeResult<{ directory?: string }>>
    pickFile: () => Promise<CodeResult<{ path?: string }>>
    listConnections: () => Promise<
      CodeResult<{ connections: CodeConnection[]; activeConnectionId: string }>
    >
    addConnection: (payload: {
      name?: string
      host: string
      port?: number
      username: string
      authMethod: 'password' | 'key' | 'agent'
      privateKeyPath?: string
    }) => Promise<CodeResult<{ connections: CodeConnection[]; activeConnectionId: string }>>
    updateConnection: (
      id: string,
      patch: Partial<{
        name: string
        host: string
        port: number
        username: string
        authMethod: 'password' | 'key' | 'agent'
        privateKeyPath: string
        hostKeyFingerprint: string
      }>
    ) => Promise<CodeResult<{ connections: CodeConnection[] }>>
    removeConnection: (id: string) => Promise<
      CodeResult<{ connections: CodeConnection[]; activeConnectionId: string }>
    >
    selectConnection: (id: string) => Promise<CodeResult<{ activeConnectionId: string }>>
    testMachine: (id: string) => Promise<CodeResult<{ status: CodeConnectionStatus }>>
    setConnectionCredential: (payload: {
      id: string
      password?: string
      passphrase?: string
    }) => Promise<CodeResult<Record<string, never>>>
    browseRemote: (
      connectionId: string,
      path?: string
    ) => Promise<({ success: true } & RemoteBrowseResult) | { success: false; error: string }>
    listSessions: (directory?: string) => Promise<CodeResult<{ sessions: CodeSession[] }>>
    createSession: (payload: {
      directory: string
      model?: { providerID: string; id: string; variant?: string }
      agent?: string
      title?: string
    }) => Promise<CodeResult<{ session: CodeSession }>>
    deleteSession: (sessionId: string) => Promise<CodeResult<Record<string, never>>>
    getTranscript: (sessionId: string) => Promise<CodeResult<{ transcript: CodeTranscriptItem[] }>>
    prompt: (payload: { sessionId: string; text: string }) => Promise<CodeResult<{ userMessageId?: string }>>
    interrupt: (sessionId: string) => Promise<CodeResult<Record<string, never>>>
    stageRevert: (payload: {
      sessionId: string
      messageId: string
    }) => Promise<CodeResult<{ messageId: string }>>
    clearRevert: (sessionId: string) => Promise<CodeResult<Record<string, never>>>
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
    listForms: (sessionId: string) => Promise<CodeResult<{ forms: CodeFormRequest[] }>>
    replyForm: (payload: {
      sessionId: string
      formId: string
      answer: Record<string, CodeFormValue>
    }) => Promise<CodeResult<Record<string, never>>>
    cancelForm: (payload: {
      sessionId: string
      formId: string
      message?: string
    }) => Promise<CodeResult<Record<string, never>>>
    getDiff: (sessionId: string) => Promise<CodeResult<{ diff: CodeFileDiff[] }>>
    getSettings: () => Promise<CodeResult<{ settings: CodeSettings }>>
    setSettings: (patch: Partial<CodeSettings>) => Promise<CodeResult<{ settings: CodeSettings }>>
    openLogs: () => Promise<CodeResult<Record<string, never>>>
    restartRuntime: () => Promise<CodeResult<{ status: CodeStatusWithConnection }>>
    getLogs: () => Promise<CodeResult<{ logs: string[] }>>
  }
}

declare global {
  interface Window {
    api?: CovenantAPI
  }
}

export {}
