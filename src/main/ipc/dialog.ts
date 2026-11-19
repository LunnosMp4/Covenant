import { ipcMain, shell } from 'electron'
import { launchSavedApp } from '../features/appLauncher'

const faviconCache = new Map<string, string>()
const MAX_FAVICON_CACHE_ENTRIES = 200

function rememberFavicon(url: string, dataUrl: string): void {
  faviconCache.set(url, dataUrl)
  if (faviconCache.size > MAX_FAVICON_CACHE_ENTRIES) {
    const oldestKey = faviconCache.keys().next().value
    if (oldestKey !== undefined) faviconCache.delete(oldestKey)
  }
}

export function registerDialogIpc(): void {
  ipcMain.handle('get-favicon', async (_event, rawUrl: unknown) => {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : ''
    if (!url) return ''

    const cached = faviconCache.get(url)
    if (cached) return cached

    try {
      const parsed = new URL(url)
      const faviconUrl = `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      let response: Response
      try {
        response = await fetch(faviconUrl, { signal: controller.signal })
      } finally {
        clearTimeout(timeout)
      }

      if (!response.ok) return ''
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length === 0) return ''

      const contentType = response.headers.get('content-type') || 'image/png'
      const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`
      rememberFavicon(url, dataUrl)
      return dataUrl
    } catch {
      return ''
    }
  })

  ipcMain.handle('launch-app', async (_event, payload: { path?: string; arguments?: string }) => {
    try {
      await launchSavedApp(payload)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to launch application.'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('open-external', async (_event, rawUrl: unknown) => {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : ''
    if (!url) return { success: false }

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return { success: false }
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { success: false }
    }

    try {
      await shell.openExternal(parsed.toString())
      return { success: true }
    } catch {
      return { success: false }
    }
  })
}
