import { contextBridge, ipcRenderer } from 'electron'

interface AppConfig {
  apiKey: string
  themeGradient: string
  proxyUrl: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  hideWindow: () => ipcRenderer.send('hide-window'),
  openSettings: () => ipcRenderer.send('open-settings'),
  closeSettings: () => ipcRenderer.send('close-settings'),
  minimizeSettings: () => ipcRenderer.send('minimize-settings'),
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
  },
  askPrometheus: (prompt: string) => ipcRenderer.invoke('prometheus:chat', prompt),
  onToggleVisibility: (callback: (visible: boolean) => void) => {
    ipcRenderer.on('toggle-visibility', (_event, visible: boolean) => {
      callback(visible)
    })
  }
})
