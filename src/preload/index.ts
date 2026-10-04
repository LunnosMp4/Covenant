import { clipboard, contextBridge, ipcRenderer } from 'electron'
import type { AppConfig } from '../shared/config'
import type { ButtonVisibility, ReasoningEffort, ShortcutConfig } from '../shared/config'
import type { McpServer } from '../shared/mcp'
import type { ChatConversation, ChatRole, ChatStreamEvent, InputContent } from '../shared/chat'
import type { LauncherApp } from '../shared/launcher-app'
import type { InstalledApp } from '../shared/launcher'
import type { Preprompt } from '../shared/preprompt'
import type { TerminalExitPayload, TerminalStartResult } from '../shared/terminal'
import type { ClearCompletedResult, Task } from '../shared/task'
import type { GamificationState } from '../shared/gamification'
import type { UpdateStatus } from '../shared/update'
import type {
  Workflow,
  WorkflowLogPayload,
  WorkflowStatusUpdatePayload
} from '../shared/workflow'

const api = {
  platform: process.platform,
  window: {
    hideWindow: () => ipcRenderer.send('hide-window'),
    setPinned: (pinned: boolean) => ipcRenderer.send('set-pinned', pinned),
    setExpanded: (expanded: boolean) => ipcRenderer.send('set-window-expanded', expanded),
    openSettings: (tab?: string) => ipcRenderer.send('open-settings', tab),
    closeSettings: () => ipcRenderer.send('close-settings'),
    minimizeSettings: () => ipcRenderer.send('minimize-settings'),
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
    onToggleVisibility: (callback: (visible: boolean, terminalMode?: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, visible: boolean, terminalMode?: boolean) => {
        callback(visible, terminalMode)
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
    }
  },
  config: {
    getConfig: () => ipcRenderer.invoke('get-config') as Promise<AppConfig>,
    saveApiKey: (apiKey: string) => ipcRenderer.send('save-api-key', apiKey),
    saveOpenAISettings: (settings: { apiKey: string; proxyUrl: string }) =>
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
    updateAutoUpdate: (enabled: boolean) => ipcRenderer.send('update-auto-update', enabled),
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
    onPreferredShellUpdated: (callback: (preferredShell?: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, preferredShell?: string) => {
        callback(preferredShell)
      }

      ipcRenderer.on('preferred-shell-updated', listener)

      return () => {
        ipcRenderer.removeListener('preferred-shell-updated', listener)
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
    onWebSearchUpdated: (callback: (enableWebSearch: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, enableWebSearch: boolean) => {
        callback(enableWebSearch)
      }

      ipcRenderer.on('web-search-updated', listener)

      return () => {
        ipcRenderer.removeListener('web-search-updated', listener)
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
    getTerminalFonts: () => ipcRenderer.invoke('get-terminal-fonts') as Promise<string[]>
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
    getConversation: (id: string) => ipcRenderer.invoke('get-conversation', id) as Promise<ChatConversation | null>,
    saveConversation: (conversation: ChatConversation) =>
      ipcRenderer.invoke('save-conversation', conversation) as Promise<ChatConversation[]>,
    deleteConversation: (id: string) =>
      ipcRenderer.invoke('delete-conversation', id) as Promise<ChatConversation[]>,
    generateConversationTitle: (prompt: string) =>
      ipcRenderer.invoke('generate-conversation-title', prompt) as Promise<string>
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

contextBridge.exposeInMainWorld('electronAPI', {
  hideWindow: api.window.hideWindow,
  setPinned: api.window.setPinned,
  setExpanded: api.window.setExpanded,
  openSettings: api.window.openSettings,
  closeSettings: api.window.closeSettings,
  minimizeSettings: api.window.minimizeSettings,
  getConfig: api.config.getConfig,
  saveApiKey: api.config.saveApiKey,
  saveOpenAISettings: api.config.saveOpenAISettings,
  markOnboarded: api.config.markOnboarded,
  getMcpServers: api.config.getMcpServers,
  saveMcpServer: api.config.saveMcpServer,
  deleteMcpServer: api.config.deleteMcpServer,
  refreshMcpServerTools: api.config.refreshMcpServerTools,
  testMcpServer: api.config.testMcpServer,
  updateTheme: api.config.updateTheme,
  updateStartupSetting: api.config.updateStartupSetting,
  updateTerminalFont: api.config.updateTerminalFont,
  updatePreferredShell: api.config.updatePreferredShell,
  updateButtonVisibility: api.config.updateButtonVisibility,
  updateLauncherShowSystemApps: api.config.updateLauncherShowSystemApps,
  updateChatModel: api.config.updateChatModel,
  updateReasoningEffort: api.config.updateReasoningEffort,
  updateWebSearch: api.config.updateWebSearch,
  updateAutoCollapseReasoning: api.config.updateAutoCollapseReasoning,
  updateAutoUpdate: api.config.updateAutoUpdate,
  checkForUpdates: api.config.checkForUpdates,
  getUpdateStatus: api.config.getUpdateStatus,
  installUpdate: api.config.installUpdate,
  onUpdateStatus: api.config.onUpdateStatus,
  updateShortcuts: api.config.updateShortcuts,
  getTerminalFonts: api.config.getTerminalFonts,
  onThemeUpdated: api.config.onThemeUpdated,
  onTerminalFontUpdated: api.config.onTerminalFontUpdated,
  onPreferredShellUpdated: api.config.onPreferredShellUpdated,
  onButtonVisibilityUpdated: api.config.onButtonVisibilityUpdated,
  onLauncherShowSystemAppsUpdated: api.config.onLauncherShowSystemAppsUpdated,
  onChatModelUpdated: api.config.onChatModelUpdated,
  onReasoningEffortUpdated: api.config.onReasoningEffortUpdated,
  askCovenant: api.chat.askCovenant,
  transcribe: api.voice.transcribe,
  onToggleVisibility: api.window.onToggleVisibility,
  writeText: api.clipboard.writeText
})
