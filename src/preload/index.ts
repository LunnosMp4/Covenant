import { contextBridge, ipcRenderer } from 'electron'

interface AppConfig {
  apiKey: string
  themeGradient: string
  proxyUrl: string
}

interface Preprompt {
  id: string
  title: string
  content: string
}

interface LauncherApp {
  id: string
  title: string
  path: string
  iconBase64: string
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
    onThemeUpdated: (callback: (gradientClass: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, gradientClass: string) => {
        callback(gradientClass)
      }

      ipcRenderer.on('theme-updated', listener)

      return () => {
        ipcRenderer.removeListener('theme-updated', listener)
      }
    }
  },
  chat: {
    askPrometheus: (prompt: string) => ipcRenderer.invoke('prometheus:chat', prompt) as Promise<string>
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
    ipcRenderer.invoke('execute-workflow', workflow) as Promise<{
      success: boolean
      stdout: string
      stderr: string
      error?: string
    }>
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
  onThemeUpdated: api.config.onThemeUpdated,
  askPrometheus: api.chat.askPrometheus,
  onToggleVisibility: api.window.onToggleVisibility
})
