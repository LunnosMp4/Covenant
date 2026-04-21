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
      ipcRenderer.invoke('delete-preprompt', prepromptId) as Promise<Preprompt[]>
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
  onThemeUpdated: api.config.onThemeUpdated,
  askPrometheus: api.chat.askPrometheus,
  onToggleVisibility: api.window.onToggleVisibility
})
