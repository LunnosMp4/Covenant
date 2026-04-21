import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  hideWindow: () => ipcRenderer.send('hide-window'),
  openSettings: () => ipcRenderer.send('open-settings'),
  closeSettings: () => ipcRenderer.send('close-settings'),
  minimizeSettings: () => ipcRenderer.send('minimize-settings'),
  askPrometheus: (prompt: string) => ipcRenderer.invoke('prometheus:chat', prompt),
  onToggleVisibility: (callback: (visible: boolean) => void) => {
    ipcRenderer.on('toggle-visibility', (_event, visible: boolean) => {
      callback(visible)
    })
  }
})
