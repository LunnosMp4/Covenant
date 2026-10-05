import { dialog, ipcMain } from 'electron'
import type { PasteManagerSettings } from '../../shared/paste/paste'
import { readConfig } from '../config/configStore'
import { getPasteManager, setPasteBlurSuppressed } from '../paste/runtime'
import {
  completeHidePasteWindow,
  getMainWindow,
  getPasteWindow,
  hidePasteWindow,
  markPasteRendererReady,
  registerShortcuts,
  showWindow
} from '../windows'
import { sendToMain, sendToPaste, sendToSettings } from '../windows/broadcast'

function broadcastPasteSettings(settings: PasteManagerSettings): void {
  sendToMain('paste:settings-updated', settings)
  sendToSettings('paste:settings-updated', settings)
  sendToPaste('paste:settings-updated', settings)
}

export function registerPasteIpc(): void {
  ipcMain.handle('paste:list', () => {
    return getPasteManager()?.list() ?? []
  })

  ipcMain.handle('paste:get-detail', (_event, rawId: unknown) => {
    const id = typeof rawId === 'string' ? rawId : ''
    const manager = getPasteManager()
    if (!id || !manager) return null
    return manager.getDetail(id)
  })

  ipcMain.handle('paste:get-settings', () => {
    return readConfig().pasteManager
  })

  ipcMain.handle('paste:update-settings', (_event, rawPatch: unknown) => {
    const manager = getPasteManager()
    if (!manager) return readConfig().pasteManager
    const patch = rawPatch && typeof rawPatch === 'object' ? (rawPatch as Partial<PasteManagerSettings>) : {}
    const settings = manager.updateSettings(patch)
    registerShortcuts(readConfig())
    broadcastPasteSettings(settings)
    return settings
  })

  ipcMain.handle('paste:set-pinned', (_event, payload: { id?: unknown; pinned?: unknown }) => {
    const id = typeof payload?.id === 'string' ? payload.id : ''
    const manager = getPasteManager()
    if (!id || !manager) return { success: false }
    return { success: manager.setPinned(id, payload?.pinned === true) }
  })

  ipcMain.handle('paste:delete', async (_event, rawId: unknown) => {
    const id = typeof rawId === 'string' ? rawId : ''
    const manager = getPasteManager()
    if (!id || !manager) return { success: false }
    return { success: await manager.delete(id) }
  })

  ipcMain.handle('paste:clear', async (_event, rawKeepPinned: unknown) => {
    const manager = getPasteManager()
    if (!manager) return { removed: 0 }
    const removed = await manager.clear(rawKeepPinned === true)
    return { removed }
  })

  ipcMain.handle('paste:copy', async (_event, payload: { id?: unknown; asPlainText?: unknown }) => {
    const id = typeof payload?.id === 'string' ? payload.id : ''
    const manager = getPasteManager()
    if (!id || !manager) return { success: false }
    const success = await manager.copy(id, payload?.asPlainText === true)
    return { success }
  })

  ipcMain.handle('paste:save-image', async (_event, rawId: unknown) => {
    const id = typeof rawId === 'string' ? rawId : ''
    const manager = getPasteManager()
    const meta = manager?.getMeta(id)
    if (!manager || !meta || meta.type !== 'image') {
      return { success: false }
    }

    const defaultName = `${(meta.preview || 'clipboard-image').replace(/[\\/:*?"<>|]/g, '_')}.png`
    const options = {
      title: 'Save image',
      defaultPath: defaultName,
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    }

    setPasteBlurSuppressed(true)
    try {
      const pasteWindow = getPasteWindow()
      const result =
        pasteWindow && !pasteWindow.isDestroyed()
          ? await dialog.showSaveDialog(pasteWindow, options)
          : await dialog.showSaveDialog(options)

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true }
      }

      const success = await manager.saveImage(id, result.filePath)
      return { success, path: result.filePath }
    } finally {
      setPasteBlurSuppressed(false)
    }
  })

  ipcMain.on('paste:hide-window', () => {
    hidePasteWindow()
  })

  // Renderer confirms it has mounted the paste surfaces in their hidden entry
  // state, so the native window can safely be shown without blinking.
  ipcMain.on('paste-renderer-ready', () => {
    markPasteRendererReady()
  })

  // Renderer's exit animation finished and its frame is blank — hide now.
  ipcMain.on('paste-renderer-exit-complete', () => {
    completeHidePasteWindow()
  })

  ipcMain.on('paste:ask-in-chat', (_event, rawText: unknown) => {
    const text = typeof rawText === 'string' ? rawText.trim() : ''
    if (!text) return

    hidePasteWindow()
    showWindow()
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('covenant:chat-prompt', text)
    }
  })
}
