import { ipcMain } from 'electron'
import {
  closeSettingsWindow,
  completeHide,
  createSettingsWindow,
  hideWindow,
  markRendererReady,
  minimizeSettingsWindow,
  reportView,
  setMainWindowIgnoreMouseEvents,
  setPinned
} from '../windows'
import type { WindowView } from '../../shared/view'

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

  // Renderer reports the surface it is currently showing so global shortcuts
  // can tell a repeat press (close) from a switch to another view.
  ipcMain.on('report-view', (_event, view: WindowView) => {
    reportView(view)
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
