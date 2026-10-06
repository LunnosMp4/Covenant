import { clipboard, contextBridge, ipcRenderer } from 'electron'
import type { AppConfig } from '../shared/config'
import type { ButtonVisibility, ReasoningEffort, ShortcutConfig } from '../shared/config'
import type { McpServer } from '../shared/mcp/mcp'
import type { ChatConversation, ChatRole, ChatStreamEvent, InputContent } from '../shared/chat/chat'
import type { LauncherApp } from '../shared/launcher/launcher-app'
import type { InstalledApp } from '../shared/launcher/launcher'
import type { Preprompt } from '../shared/domain/preprompt'
import type { TerminalExitPayload, TerminalStartResult } from '../shared/terminal/terminal'
import type { ClearCompletedResult, Task } from '../shared/tasks/task'
import type { GamificationState } from '../shared/tasks/gamification'
import type { UpdateStatus } from '../shared/system/update'
import type { UsageMetricsResult, UsageProjectsResult } from '../shared/system/usage'
import type { PasteItemDetail, PasteItemMeta, PasteManagerSettings } from '../shared/paste/paste'
import type {
  Workflow,
  WorkflowLogPayload,
  WorkflowStatusUpdatePayload
} from '../shared/domain/workflow'
import type {
  CodeAgent,
  CodeEngineEvent,
  CodeFileDiff,
  CodeModel,
  CodePermissionRequest,
  CodeProject,
  CodeSession,
  CodeSettings,
  CodeStatus,
  CodeTranscriptItem
} from '../shared/code/code'

const api = {
  platform: process.platform,
  window: {
    hideWindow: () => ipcRenderer.send('hide-window'),
    notifyReadyToShow: () => ipcRenderer.send('renderer-ready-to-show'),
    notifyExitComplete: () => ipcRenderer.send('renderer-exit-complete'),
    setPinned: (pinned: boolean) => ipcRenderer.send('set-pinned', pinned),
    setIgnoreMouseEvents: (ignore: boolean) =>
      ipcRenderer.send('set-ignore-mouse-events', ignore),
    openSettings: (tab?: string) => ipcRenderer.send('open-settings', tab),
    closeSettings: () => ipcRenderer.send('close-settings'),
    minimizeSettings: () => ipcRenderer.send('minimize-settings'),
    onOpenCode: (callback: () => void) => {
      const listener = () => {
        callback()
      }
      ipcRenderer.on('open-code', listener)
      return () => {
        ipcRenderer.removeListener('open-code', listener)
      }
    },
    onNavigateSettingsTab: (callback: (tab: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, tab: string) => {
        callback(tab)
      }
      ipcRenderer.on('navigate-settings-tab', listener)
      return () => {
        ipcRenderer.removeListener('navigate-settings-tab', listener)
      }
    },
    onSettingsShown: (callback: (isRestore: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, isRestore: boolean) => {
        callback(isRestore)
      }
      ipcRenderer.on('settings-shown', listener)
      return () => {
        ipcRenderer.removeListener('settings-shown', listener)
      }
    },
    onToggleVisibility: (
      callback: (visible: boolean, terminalMode?: boolean, phase?: 'prepare' | 'animate') => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        visible: boolean,
        terminalMode?: boolean,
        phase?: 'prepare' | 'animate'
      ) => {
        callback(visible, terminalMode, phase)
      }

      ipcRenderer.on('toggle-visibility', listener)

      return () => {
        ipcRenderer.removeListener('toggle-visibility', listener)
      }
    },
    onOpenTasks: (callback: () => void) => {
      const listener = () => {
        callback()
      }
      ipcRenderer.on('open-tasks', listener)
      return () => {
        ipcRenderer.removeListener('open-tasks', listener)
      }
    },
    onChatPrompt: (callback: (text: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, text: string) => {
        callback(text)
      }
      ipcRenderer.on('covenant:chat-prompt', listener)
      return () => {
        ipcRenderer.removeListener('covenant:chat-prompt', listener)
      }
    }
  },
  config: {
    getConfig: () => ipcRenderer.invoke('get-config') as Promise<AppConfig>,
    saveApiKey: (apiKey: string) => ipcRenderer.send('save-api-key', apiKey),
    saveOpenAISettings: (settings: { apiKey?: string; proxyUrl?: string; adminApiKey?: string }) =>
      ipcRenderer.send('save-openai-settings', settings),
    markOnboarded: () => ipcRenderer.send('mark-onboarded'),
    getMcpServers: () => ipcRenderer.invoke('get-mcp-servers') as Promise<McpServer[]>,
    saveMcpServer: (server: Partial<McpServer>) =>
      ipcRenderer.invoke('save-mcp-server', server) as Promise<McpServer[]>,
    deleteMcpServer: (serverId: string) =>
      ipcRenderer.invoke('delete-mcp-server', serverId) as Promise<McpServer[]>,
    refreshMcpServerTools: (serverId: string) =>
      ipcRenderer.invoke('refresh-mcp-server-tools', serverId) as Promise<McpServer[]>,
    testMcpServer: (payload: {
      name: string
      url: string
      auth: McpServer['auth']
      appendMcpSuffix?: boolean
    }) =>
      ipcRenderer.invoke('test-mcp-server', payload) as Promise<{
        ok: boolean
        message: string
        toolCount: number
        lastError?: string
      }>,
    updateTheme: (gradientClass: string) => ipcRenderer.send('update-theme', gradientClass),
    updateStartupSetting: (launchOnStartup: boolean) => ipcRenderer.send('update-startup-setting', launchOnStartup),
    updateTerminalFont: (terminalFont: string) => ipcRenderer.send('update-terminal-font', terminalFont),
    updatePreferredShell: (preferredShell: string) => ipcRenderer.send('update-preferred-shell', preferredShell),
    updateButtonVisibility: (buttonVisibility: Partial<ButtonVisibility>) =>
      ipcRenderer.send('update-button-visibility', buttonVisibility),
    updateLauncherShowSystemApps: (showSystemApps: boolean) =>
      ipcRenderer.send('update-launcher-show-system-apps', showSystemApps),
    updateChatModel: (chatModel: string) => ipcRenderer.send('update-chat-model', chatModel),
    updateReasoningEffort: (reasoningEffort: ReasoningEffort) =>
      ipcRenderer.send('update-reasoning-effort', reasoningEffort),
    updateWebSearch: (enableWebSearch: boolean) =>
      ipcRenderer.send('update-web-search', enableWebSearch),
    updateAutoCollapseReasoning: (autoCollapseReasoning: boolean) =>
      ipcRenderer.send('update-auto-collapse-reasoning', autoCollapseReasoning),
    updateTextureIntensity: (textureIntensity: number) =>
      ipcRenderer.send('update-texture-intensity', textureIntensity),
    updateAutoUpdate: (enabled: boolean) => ipcRenderer.send('update-auto-update', enabled),
    updateUsageProject: (projectId: string) => ipcRenderer.send('update-usage-project', projectId),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates') as Promise<UpdateStatus>,
    getUpdateStatus: () => ipcRenderer.invoke('get-update-status') as Promise<UpdateStatus>,
    installUpdate: () => ipcRenderer.send('install-update'),
    onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => {
        callback(status)
      }

      ipcRenderer.on('update-status', listener)

      return () => {
        ipcRenderer.removeListener('update-status', listener)
      }
    },
    updateShortcuts: (shortcuts: ShortcutConfig) => ipcRenderer.send('update-shortcuts', shortcuts),
    onShortcutsUpdated: (callback: (shortcuts: ShortcutConfig) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, shortcuts: ShortcutConfig) => {
        callback(shortcuts)
      }

      ipcRenderer.on('shortcuts-updated', listener)

      return () => {
        ipcRenderer.removeListener('shortcuts-updated', listener)
      }
    },
    onThemeUpdated: (callback: (gradientClass: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, gradientClass: string) => {
        callback(gradientClass)
      }

      ipcRenderer.on('theme-updated', listener)

      return () => {
        ipcRenderer.removeListener('theme-updated', listener)
      }
    },
    onTerminalFontUpdated: (callback: (terminalFont: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, terminalFont: string) => {
        callback(terminalFont)
      }

      ipcRenderer.on('terminal-font-updated', listener)

      return () => {
        ipcRenderer.removeListener('terminal-font-updated', listener)
      }
    },
    onButtonVisibilityUpdated: (callback: (buttonVisibility: ButtonVisibility) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, buttonVisibility: ButtonVisibility) => {
        callback(buttonVisibility)
      }

      ipcRenderer.on('button-visibility-updated', listener)

      return () => {
        ipcRenderer.removeListener('button-visibility-updated', listener)
      }
    },
    onLauncherShowSystemAppsUpdated: (callback: (showSystemApps: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, showSystemApps: boolean) => {
        callback(showSystemApps)
      }

      ipcRenderer.on('launcher-show-system-apps-updated', listener)

      return () => {
        ipcRenderer.removeListener('launcher-show-system-apps-updated', listener)
      }
    },
    onChatModelUpdated: (callback: (chatModel: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, chatModel: string) => {
        callback(chatModel)
      }

      ipcRenderer.on('chat-model-updated', listener)

      return () => {
        ipcRenderer.removeListener('chat-model-updated', listener)
      }
    },
    onReasoningEffortUpdated: (callback: (reasoningEffort: ReasoningEffort) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, reasoningEffort: ReasoningEffort) => {
        callback(reasoningEffort)
      }

      ipcRenderer.on('reasoning-effort-updated', listener)

      return () => {
        ipcRenderer.removeListener('reasoning-effort-updated', listener)
      }
    },
    onAutoCollapseReasoningUpdated: (callback: (autoCollapseReasoning: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, autoCollapseReasoning: boolean) => {
        callback(autoCollapseReasoning)
      }

      ipcRenderer.on('auto-collapse-reasoning-updated', listener)

      return () => {
        ipcRenderer.removeListener('auto-collapse-reasoning-updated', listener)
      }
    },
    onTextureIntensityUpdated: (callback: (textureIntensity: number) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, textureIntensity: number) => {
        callback(textureIntensity)
      }

      ipcRenderer.on('texture-intensity-updated', listener)

      return () => {
        ipcRenderer.removeListener('texture-intensity-updated', listener)
      }
    },
    getTerminalFonts: () => ipcRenderer.invoke('get-terminal-fonts') as Promise<string[]>
  },
  usage: {
    getMetrics: (rangeDays?: number, projectId?: string) =>
      ipcRenderer.invoke('usage:get-metrics', { rangeDays, projectId }) as Promise<UsageMetricsResult>,
    getProjects: () => ipcRenderer.invoke('usage:get-projects') as Promise<UsageProjectsResult>
  },
  chat: {
    askCovenant: (messages: Array<{ role: ChatRole; content: string | InputContent[] }>) =>
      ipcRenderer.invoke('covenant:chat', messages) as Promise<string>,
    askCovenantStream: (messages: Array<{ role: ChatRole; content: string | InputContent[] }>) =>
      ipcRenderer.invoke('covenant:chat-stream', messages) as Promise<{ id: string }>,
    onStreamEvent: (callback: (event: ChatStreamEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: ChatStreamEvent) => {
        callback(payload)
      }

      ipcRenderer.on('covenant:chat-stream-event', listener)

      return () => {
        ipcRenderer.removeListener('covenant:chat-stream-event', listener)
      }
    },
    cancelStream: (streamId: string) => ipcRenderer.send('covenant:chat-cancel', streamId),
    getConversations: () => ipcRenderer.invoke('get-conversations') as Promise<ChatConversation[]>,
    saveConversation: (conversation: ChatConversation) =>
      ipcRenderer.invoke('save-conversation', conversation) as Promise<ChatConversation[]>,
    deleteConversation: (id: string) =>
      ipcRenderer.invoke('delete-conversation', id) as Promise<ChatConversation[]>,
    generateConversationTitle: (prompt: string) =>
      ipcRenderer.invoke('generate-conversation-title', prompt) as Promise<string>
  },
  code: {
    subscribe: () => ipcRenderer.send('code:subscribe'),
    onEvent: (callback: (event: CodeEngineEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: CodeEngineEvent) => {
        callback(payload)
      }
      ipcRenderer.on('code:event', listener)
      return () => {
        ipcRenderer.removeListener('code:event', listener)
      }
    },
    getStatus: () =>
      ipcRenderer.invoke('code:status') as Promise<
        { success: true; status: CodeStatus & { hasApiKey: boolean } } | { success: false; error: string }
      >,
    setApiKey: (key: string) =>
      ipcRenderer.invoke('code:auth:set', { key }) as Promise<
        { success: true; status: CodeStatus & { hasApiKey: boolean } } | { success: false; error: string }
      >,
    clearApiKey: () =>
      ipcRenderer.invoke('code:auth:clear') as Promise<
        { success: true; status: CodeStatus & { hasApiKey: boolean } } | { success: false; error: string }
      >,
    testConnection: () =>
      ipcRenderer.invoke('code:auth:test') as Promise<
        { success: true; connected: boolean } | { success: false; error: string }
      >,
    listModels: () =>
      ipcRenderer.invoke('code:models') as Promise<
        { success: true; models: CodeModel[] } | { success: false; error: string }
      >,
    listAgents: () =>
      ipcRenderer.invoke('code:agents:list') as Promise<
        { success: true; agents: CodeAgent[] } | { success: false; error: string }
      >,
    switchAgent: (payload: { sessionId: string; agent: string }) =>
      ipcRenderer.invoke('code:agents:switch', payload) as Promise<
        { success: true } | { success: false; error: string }
      >,
    listProjects: () =>
      ipcRenderer.invoke('code:projects:list') as Promise<
        { success: true; projects: CodeProject[] } | { success: false; error: string }
      >,
    addProject: (directory: string, name?: string) =>
      ipcRenderer.invoke('code:projects:add', { directory, name }) as Promise<
        { success: true; projects: CodeProject[] } | { success: false; error: string }
      >,
    removeProject: (id: string) =>
      ipcRenderer.invoke('code:projects:remove', id) as Promise<
        { success: true; projects: CodeProject[] } | { success: false; error: string }
      >,
    pickDirectory: () =>
      ipcRenderer.invoke('code:pick-directory') as Promise<
        { success: true; directory?: string } | { success: false; error: string }
      >,
    listSessions: (directory?: string) =>
      ipcRenderer.invoke('code:sessions:list', { directory }) as Promise<
        { success: true; sessions: CodeSession[] } | { success: false; error: string }
      >,
    createSession: (payload: {
      directory: string
      model?: { providerID: string; id: string; variant?: string }
      agent?: string
      title?: string
    }) =>
      ipcRenderer.invoke('code:sessions:create', payload) as Promise<
        { success: true; session: CodeSession } | { success: false; error: string }
      >,
    deleteSession: (sessionId: string) =>
      ipcRenderer.invoke('code:sessions:delete', sessionId) as Promise<
        { success: true } | { success: false; error: string }
      >,
    getTranscript: (sessionId: string) =>
      ipcRenderer.invoke('code:sessions:transcript', sessionId) as Promise<
        { success: true; transcript: CodeTranscriptItem[] } | { success: false; error: string }
      >,
    prompt: (payload: { sessionId: string; text: string }) =>
      ipcRenderer.invoke('code:prompt', payload) as Promise<
        { success: true } | { success: false; error: string }
      >,
    interrupt: (sessionId: string) =>
      ipcRenderer.invoke('code:interrupt', sessionId) as Promise<
        { success: true } | { success: false; error: string }
      >,
    switchModel: (payload: { sessionId: string; model: { providerID: string; id: string; variant?: string } }) =>
      ipcRenderer.invoke('code:switch-model', payload) as Promise<
        { success: true } | { success: false; error: string }
      >,
    listPermissions: (sessionId: string) =>
      ipcRenderer.invoke('code:permissions:list', sessionId) as Promise<
        { success: true; requests: CodePermissionRequest[] } | { success: false; error: string }
      >,
    replyPermission: (payload: { sessionId: string; requestId: string; reply: 'once' | 'always' | 'reject' }) =>
      ipcRenderer.invoke('code:permissions:reply', payload) as Promise<
        { success: true } | { success: false; error: string }
      >,
    getDiff: (sessionId: string) =>
      ipcRenderer.invoke('code:diff', sessionId) as Promise<
        { success: true; diff: CodeFileDiff[] } | { success: false; error: string }
      >,
    getSettings: () =>
      ipcRenderer.invoke('code:settings:get') as Promise<
        { success: true; settings: CodeSettings } | { success: false; error: string }
      >,
    setSettings: (patch: Partial<CodeSettings>) =>
      ipcRenderer.invoke('code:settings:set', patch) as Promise<
        { success: true; settings: CodeSettings } | { success: false; error: string }
      >,
    openLogs: () =>
      ipcRenderer.invoke('code:logs:open') as Promise<
        { success: true } | { success: false; error: string }
      >,
    restartRuntime: () =>
      ipcRenderer.invoke('code:runtime:restart') as Promise<
        { success: true; status: CodeStatus & { hasApiKey: boolean } } | { success: false; error: string }
      >,
    getLogs: () =>
      ipcRenderer.invoke('code:logs') as Promise<
        { success: true; logs: string[] } | { success: false; error: string }
      >
  },
  terminal: {
    startTerminal: (size?: { cols?: number; rows?: number }) =>
      ipcRenderer.invoke('terminal:start', size) as Promise<TerminalStartResult>,
    sendInput: (sessionId: string, data: string) =>
      ipcRenderer.invoke('terminal:input', { sessionId, input: data }) as Promise<{ success: boolean }>,
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', { sessionId, cols, rows }) as Promise<{ success: boolean }>,
    killTerminal: (sessionId: string) =>
      ipcRenderer.invoke('terminal:kill', { sessionId }) as Promise<{ success: boolean }>,
    onData: (callback: (sessionId: string, chunk: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { sessionId: string; chunk: string }) => {
        callback(payload.sessionId, payload.chunk)
      }

      ipcRenderer.on('terminal:data', listener)

      return () => {
        ipcRenderer.removeListener('terminal:data', listener)
      }
    },
    onExit: (callback: (payload: TerminalExitPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: TerminalExitPayload) => {
        callback(payload)
      }

      ipcRenderer.on('terminal:exit', listener)

      return () => {
        ipcRenderer.removeListener('terminal:exit', listener)
      }
    },
    reportActiveSession: (sessionId: string) => {
      ipcRenderer.send('terminal:report-active-session', sessionId)
    },
    listSessions: () =>
      ipcRenderer.invoke('terminal:list-sessions') as Promise<Array<{ sessionId: string; shell: string }>>,
    sendToActiveSession: (code: string) =>
      ipcRenderer.invoke('terminal:send-to-active-session', { code }) as Promise<{ success: boolean; sessionId?: string; created?: boolean }>
  },
  voice: {
    transcribe: (audioBuffer: ArrayBuffer) =>
      ipcRenderer.invoke('voice:transcribe', audioBuffer) as Promise<string>
  },
  store: {
    getPreprompts: () => ipcRenderer.invoke('get-preprompts') as Promise<Preprompt[]>,
    savePreprompt: (preprompt: Partial<Preprompt>) =>
      ipcRenderer.invoke('save-preprompt', preprompt) as Promise<Preprompt[]>,
    deletePreprompt: (prepromptId: string) =>
      ipcRenderer.invoke('delete-preprompt', prepromptId) as Promise<Preprompt[]>,
    getGlobalInstructions: () => ipcRenderer.invoke('get-global-instructions') as Promise<string>,
    saveGlobalInstructions: (value: string) =>
      ipcRenderer.invoke('save-global-instructions', value) as Promise<string>,
    getApps: () => ipcRenderer.invoke('get-apps') as Promise<LauncherApp[]>,
    saveApp: (launcherApp: Partial<LauncherApp>) =>
      ipcRenderer.invoke('save-app', launcherApp) as Promise<LauncherApp[]>,
    deleteApp: (appId: string) => ipcRenderer.invoke('delete-app', appId) as Promise<LauncherApp[]>,
    getWorkflows: () => ipcRenderer.invoke('get-workflows') as Promise<Workflow[]>,
    saveWorkflow: (workflow: Partial<Workflow>) =>
      ipcRenderer.invoke('save-workflow', workflow) as Promise<Workflow[]>,
    deleteWorkflow: (workflowId: string) =>
      ipcRenderer.invoke('delete-workflow', workflowId) as Promise<Workflow[]>,
    getTasks: () => ipcRenderer.invoke('get-tasks') as Promise<Task[]>,
    getGamification: () => ipcRenderer.invoke('get-gamification') as Promise<GamificationState>,
    addTask: (title: string) => ipcRenderer.invoke('add-task', title) as Promise<Task[]>,
    toggleTask: (taskId: string) => ipcRenderer.invoke('toggle-task', taskId) as Promise<Task[]>,
    deleteTask: (taskId: string) => ipcRenderer.invoke('delete-task', taskId) as Promise<Task[]>,
    reorderTasks: (orderedIds: string[]) =>
      ipcRenderer.invoke('reorder-tasks', orderedIds) as Promise<Task[]>,
    clearCompletedTasks: () =>
      ipcRenderer.invoke('clear-completed-tasks') as Promise<ClearCompletedResult>,
    onTasksUpdated: (callback: (tasks: Task[]) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, tasks: Task[]) => {
        callback(tasks)
      }
      ipcRenderer.on('tasks:updated', listener)
      return () => {
        ipcRenderer.removeListener('tasks:updated', listener)
      }
    }
  },
  clipboard: {
    writeText: (text: string) => clipboard.writeText(text)
  },
  openExternal: (url: string) =>
    ipcRenderer.invoke('open-external', url) as Promise<{ success: boolean }>,
  excalidraw: {
    readCheckpoint: (serverId: string | undefined, checkpointId: string) =>
      ipcRenderer.invoke('excalidraw:read-checkpoint', { serverId, checkpointId }) as Promise<{
        ok: boolean
        elements?: unknown[]
        serverId?: string
        error?: string
      }>,
    exportToExcalidraw: (serverId: string | undefined, json: string) =>
      ipcRenderer.invoke('excalidraw:export', { serverId, json }) as Promise<{
        ok: boolean
        url?: string
        serverId?: string
        error?: string
      }>,
    clearStorage: () => ipcRenderer.invoke('excalidraw:clear-storage') as Promise<{ ok: boolean }>
  },
  paste: {
    list: () => ipcRenderer.invoke('paste:list') as Promise<PasteItemMeta[]>,
    getDetail: (id: string) =>
      ipcRenderer.invoke('paste:get-detail', id) as Promise<PasteItemDetail | null>,
    getSettings: () => ipcRenderer.invoke('paste:get-settings') as Promise<PasteManagerSettings>,
    updateSettings: (patch: Partial<PasteManagerSettings>) =>
      ipcRenderer.invoke('paste:update-settings', patch) as Promise<PasteManagerSettings>,
    setPinned: (id: string, pinned: boolean) =>
      ipcRenderer.invoke('paste:set-pinned', { id, pinned }) as Promise<{ success: boolean }>,
    remove: (id: string) =>
      ipcRenderer.invoke('paste:delete', id) as Promise<{ success: boolean }>,
    clear: (keepPinned: boolean) =>
      ipcRenderer.invoke('paste:clear', keepPinned) as Promise<{ removed: number }>,
    copy: (id: string, asPlainText = false) =>
      ipcRenderer.invoke('paste:copy', { id, asPlainText }) as Promise<{ success: boolean }>,
    saveImage: (id: string) =>
      ipcRenderer.invoke('paste:save-image', id) as Promise<{
        success: boolean
        path?: string
        canceled?: boolean
      }>,
    hideWindow: () => ipcRenderer.send('paste:hide-window'),
    askInChat: (text: string) => ipcRenderer.send('paste:ask-in-chat', text),
    notifyReadyToShow: () => ipcRenderer.send('paste-renderer-ready'),
    notifyExitComplete: () => ipcRenderer.send('paste-renderer-exit-complete'),
    onPrepare: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('paste:prepare', listener)
      return () => {
        ipcRenderer.removeListener('paste:prepare', listener)
      }
    },
    onHide: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('paste:hide', listener)
      return () => {
        ipcRenderer.removeListener('paste:hide', listener)
      }
    },
    onChanged: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('paste:changed', listener)
      return () => {
        ipcRenderer.removeListener('paste:changed', listener)
      }
    },
    onShown: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('paste:shown', listener)
      return () => {
        ipcRenderer.removeListener('paste:shown', listener)
      }
    },
    onSettingsUpdated: (callback: (settings: PasteManagerSettings) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, settings: PasteManagerSettings) => {
        callback(settings)
      }
      ipcRenderer.on('paste:settings-updated', listener)
      return () => {
        ipcRenderer.removeListener('paste:settings-updated', listener)
      }
    }
  },
  selectFile: () => ipcRenderer.invoke('select-file') as Promise<string>,
  getFavicon: (url: string) => ipcRenderer.invoke('get-favicon', url) as Promise<string>,
  installedApps: {
    list: () => ipcRenderer.invoke('get-installed-apps') as Promise<InstalledApp[]>,
    icon: (appPath: string) => ipcRenderer.invoke('get-app-icon', appPath) as Promise<string>
  },
  launchApp: (path: string, launchArguments: string) =>
    ipcRenderer.invoke('launch-app', {
      path,
      arguments: launchArguments
    }) as Promise<{ success: boolean; error?: string }>,
  executeWorkflow: (workflow: Partial<Workflow>) =>
    ipcRenderer.invoke('execute-workflow', workflow) as Promise<{ success: boolean; error?: string }>,
  onWorkflowStatusUpdate: (callback: (payload: WorkflowStatusUpdatePayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: WorkflowStatusUpdatePayload) => {
      callback(payload)
    }

    ipcRenderer.on('workflow-status-update', listener)

    return () => {
      ipcRenderer.removeListener('workflow-status-update', listener)
    }
  },
  onWorkflowLog: (callback: (payload: WorkflowLogPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: WorkflowLogPayload) => {
      callback(payload)
    }

    ipcRenderer.on('workflow-log', listener)

    return () => {
      ipcRenderer.removeListener('workflow-log', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
