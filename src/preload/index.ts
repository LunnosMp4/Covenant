import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  hideWindow: () => ipcRenderer.send('hide-window'),
  onToggleVisibility: (callback: (visible: boolean) => void) => {
    ipcRenderer.on('toggle-visibility', (_event, visible: boolean) => {
      callback(visible)
    })
  }
})
