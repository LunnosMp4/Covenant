import { contextBridge, ipcRenderer } from 'electron'

interface AppConfig {
  apiKey: string
  themeGradient: string
  proxyUrl: string
  launchOnStartup: boolean
  terminalFont: string
}

interface Preprompt {
  id: string
  title: string
  content: string
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

interface LauncherApp {
  id: string
  title: string
  iconBase64: string
  targets: LauncherAppTarget[]
  path?: string
  arguments?: string
}

interface LauncherAppTarget {
  path: string
  arguments: string
}

type WorkflowLanguage = 'powershell' | 'cmd' | 'python' | 'nodejs' | 'shell' | 'custom'

interface Workflow {
  id: string
  title: string
  language: WorkflowLanguage
  customCommand?: string
  content: string
}

interface WorkflowStatusUpdatePayload {
  id: string
  status: 'running' | 'success' | 'error'
}

interface WorkflowLogPayload {
  id: string
  type: 'info' | 'error'
  text: string
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

const api = {
  window: {
    hideWindow: () => ipcRenderer.send('hide-window'),
    openSettings: () => ipcRenderer.send('open-settings'),
    closeSettings: () => ipcRenderer.send('close-settings'),
    minimizeSettings: () => ipcRenderer.send('minimize-settings'),
    onToggleVisibility: (callback: (visible: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, visible: boolean) => {
        callback(visible)
      }

      ipcRenderer.on('toggle-visibility', listener)

      return () => {
        ipcRenderer.removeListener('toggle-visibility', listener)
      }
    }
  },
  config: {
    getConfig: () => ipcRenderer.invoke('get-config') as Promise<AppConfig>,
    saveApiKey: (apiKey: string) => ipcRenderer.send('save-api-key', apiKey),
    saveOpenAISettings: (settings: { apiKey: string; proxyUrl: string }) =>
      ipcRenderer.send('save-openai-settings', settings),
    updateTheme: (gradientClass: string) => ipcRenderer.send('update-theme', gradientClass),
    updateStartupSetting: (launchOnStartup: boolean) => ipcRenderer.send('update-startup-setting', launchOnStartup),
    updateTerminalFont: (terminalFont: string) => ipcRenderer.send('update-terminal-font', terminalFont),
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
    getTerminalFonts: () => ipcRenderer.invoke('get-terminal-fonts') as Promise<string[]>
  },
  chat: {
    askCovenant: (messages: Array<{ role: ChatRole; content: string }>) =>
      ipcRenderer.invoke('covenant:chat', messages) as Promise<string>,
    getConversations: () => ipcRenderer.invoke('get-conversations') as Promise<ChatConversation[]>,
    getConversation: (id: string) => ipcRenderer.invoke('get-conversation', id) as Promise<ChatConversation | null>,
    saveConversation: (conversation: ChatConversation) =>
      ipcRenderer.invoke('save-conversation', conversation) as Promise<ChatConversation[]>
  },
  terminal: {
    startTerminal: (size?: { cols?: number; rows?: number }) =>
      ipcRenderer.invoke('terminal:start', size) as Promise<TerminalStartResult>,
    sendInput: (data: string) =>
      ipcRenderer.invoke('terminal:input', data) as Promise<{ success: boolean }>,
    resize: (cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', { cols, rows }) as Promise<{ success: boolean }>,
    killTerminal: () => ipcRenderer.invoke('terminal:kill') as Promise<{ success: boolean }>,
    onData: (callback: (chunk: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, chunk: string) => {
        callback(chunk)
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
    }
  },
  store: {
    getPreprompts: () => ipcRenderer.invoke('get-preprompts') as Promise<Preprompt[]>,
    savePreprompt: (preprompt: Partial<Preprompt>) =>
      ipcRenderer.invoke('save-preprompt', preprompt) as Promise<Preprompt[]>,
    deletePreprompt: (prepromptId: string) =>
      ipcRenderer.invoke('delete-preprompt', prepromptId) as Promise<Preprompt[]>,
    getApps: () => ipcRenderer.invoke('get-apps') as Promise<LauncherApp[]>,
    saveApp: (launcherApp: Partial<LauncherApp>) =>
      ipcRenderer.invoke('save-app', launcherApp) as Promise<LauncherApp[]>,
    deleteApp: (appId: string) => ipcRenderer.invoke('delete-app', appId) as Promise<LauncherApp[]>,
    getWorkflows: () => ipcRenderer.invoke('get-workflows') as Promise<Workflow[]>,
    saveWorkflow: (workflow: Partial<Workflow>) =>
      ipcRenderer.invoke('save-workflow', workflow) as Promise<Workflow[]>,
    deleteWorkflow: (workflowId: string) =>
      ipcRenderer.invoke('delete-workflow', workflowId) as Promise<Workflow[]>
  },
  selectFile: () => ipcRenderer.invoke('select-file') as Promise<string>,
  getFileIcon: (filePath: string) => ipcRenderer.invoke('get-file-icon', filePath) as Promise<string>,
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

// Backward compatibility for existing renderer usage.
contextBridge.exposeInMainWorld('electronAPI', {
  hideWindow: api.window.hideWindow,
  openSettings: api.window.openSettings,
  closeSettings: api.window.closeSettings,
  minimizeSettings: api.window.minimizeSettings,
  getConfig: api.config.getConfig,
  saveApiKey: api.config.saveApiKey,
  saveOpenAISettings: api.config.saveOpenAISettings,
  updateTheme: api.config.updateTheme,
  updateStartupSetting: api.config.updateStartupSetting,
  updateTerminalFont: api.config.updateTerminalFont,
  getTerminalFonts: api.config.getTerminalFonts,
  onThemeUpdated: api.config.onThemeUpdated,
  onTerminalFontUpdated: api.config.onTerminalFontUpdated,
  askCovenant: api.chat.askCovenant,
  onToggleVisibility: api.window.onToggleVisibility
})
