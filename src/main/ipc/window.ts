import { ipcMain } from 'electron'
import {
  closeSettingsWindow,
  completeHide,
  createSettingsWindow,
  hideWindow,
  markRendererReady,
  minimizeSettingsWindow,
  setMainWindowIgnoreMouseEvents,
  setPinned
} from '../windows'

export function registerWindowIpc(): void {
  // Renderer confirms it has mounted its entry surfaces in the hidden state, so
  // the window can safely be shown.
  ipcMain.on('renderer-ready-to-show', () => {
    markRendererReady()
  })

  // Renderer's exit animation has finished — hide the native window now.
  ipcMain.on('renderer-exit-complete', () => {
    completeHide()
  })

  ipcMain.on('hide-window', () => {
    hideWindow()
  })

  ipcMain.on('set-pinned', (_event, pinned: boolean) => {
    setPinned(pinned)
  })

  ipcMain.on('set-ignore-mouse-events', (_event, ignore: boolean) => {
    setMainWindowIgnoreMouseEvents(ignore)
  })

  ipcMain.on('open-settings', (_event, tab?: string) => {
    createSettingsWindow(tab)
  })

  ipcMain.on('close-settings', () => {
    closeSettingsWindow()
  })

  ipcMain.on('minimize-settings', () => {
    minimizeSettingsWindow()
  })
}
