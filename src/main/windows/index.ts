import { app, BrowserWindow, globalShortcut, Menu, protocol, screen, shell, Tray } from 'electron'
import { existsSync, promises as fsPromises } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { WebContents } from 'electron'
import type { AppConfig } from '../../shared/config'
import { DEFAULT_SHORTCUTS } from '../../shared/config'
import { readConfig } from '../config/configStore'
import { openLogsFolder } from '../logger'
import { getPasteManager, isPasteBlurSuppressed } from '../paste/runtime'
import { checkForUpdatesManually } from '../updater'

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

const WINDOW_WIDTH = 800
const WINDOW_HEIGHT = 520
const WINDOW_BOTTOM_MARGIN = 48
const SETTINGS_WINDOW_WIDTH = 1024
const SETTINGS_WINDOW_HEIGHT = 576
const PASTE_WINDOW_WIDTH = 960
const PASTE_WINDOW_HEIGHT = 600
const PASTE_PROTOCOL = 'covenant-paste'

const RENDERER_READY_TIMEOUT_MS = 160
const RENDERER_EXIT_TIMEOUT_MS = 700

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let pasteWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isVisible = false
let isPinned = false

let rendererReadyResolver: (() => void) | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow
}

export function getPasteWindow(): BrowserWindow | null {
  return pasteWindow
}

export function getMainWebContents(): WebContents | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null
}

export function getSettingsWebContents(): WebContents | null {
  return settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow.webContents : null
}

export function getPasteWebContents(): WebContents | null {
  return pasteWindow && !pasteWindow.isDestroyed() ? pasteWindow.webContents : null
}

function getWindowPosition(): { x: number; y: number } {
  const cursorPoint = screen.getCursorScreenPoint()
  const primaryDisplay = screen.getDisplayNearestPoint(cursorPoint)
  const { x: workAreaX, y: workAreaY, width: workAreaWidth, height: workAreaHeight } =
    primaryDisplay.workArea

  return {
    x: Math.round(workAreaX + (workAreaWidth - WINDOW_WIDTH) / 2),
    y: Math.round(workAreaY + workAreaHeight - WINDOW_HEIGHT - WINDOW_BOTTOM_MARGIN)
  }
}

function getSettingsWindowPosition(): { x: number; y: number } {
  // Anchor on the main Covenant window when it is visible, otherwise the cursor.
  let anchorPoint = screen.getCursorScreenPoint()
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    const bounds = mainWindow.getBounds()
    anchorPoint = {
      x: Math.round(bounds.x + bounds.width / 2),
      y: Math.round(bounds.y + bounds.height / 2)
    }
  }

  const display = screen.getDisplayNearestPoint(anchorPoint)
  const { x: workAreaX, y: workAreaY, width: workAreaWidth, height: workAreaHeight } = display.workArea

  return {
    x: Math.max(workAreaX, Math.round(workAreaX + (workAreaWidth - SETTINGS_WINDOW_WIDTH) / 2)),
    y: Math.max(workAreaY, Math.round(workAreaY + (workAreaHeight - SETTINGS_WINDOW_HEIGHT) / 2))
  }
}

function getPasteWindowPosition(): { x: number; y: number } {
  const anchorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(anchorPoint)
  const { x: workAreaX, y: workAreaY, width: workAreaWidth, height: workAreaHeight } = display.workArea

  return {
    x: Math.max(workAreaX, Math.round(workAreaX + (workAreaWidth - PASTE_WINDOW_WIDTH) / 2)),
    y: Math.max(workAreaY, Math.round(workAreaY + (workAreaHeight - PASTE_WINDOW_HEIGHT) / 2))
  }
}

function loadRendererWindow(
  targetWindow: BrowserWindow,
  route?: 'settings' | 'paste',
  tab?: string
): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    if (route === 'settings') {
      const query = tab ? `?tab=${encodeURIComponent(tab)}` : ''
      targetWindow.loadURL(`${rendererUrl}#/settings${query}`)
      return
    }
    if (route === 'paste') {
      targetWindow.loadURL(`${rendererUrl}#/paste`)
      return
    }
    targetWindow.loadURL(rendererUrl)
    return
  }

  const rendererEntryFile = join(__dirname, '../renderer/index.html')
  if (route === 'settings') {
    const hash = tab ? `settings?tab=${encodeURIComponent(tab)}` : 'settings'
    targetWindow.loadFile(rendererEntryFile, { hash })
    return
  }
  if (route === 'paste') {
    targetWindow.loadFile(rendererEntryFile, { hash: 'paste' })
    return
  }

  targetWindow.loadFile(rendererEntryFile)
}

export function createWindow(): void {
  const { x, y } = getWindowPosition()

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    icon: join(__dirname, 'assets', 'tray-icon.png'),
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    backgroundMaterial: isWindows ? 'none' : undefined,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    thickFrame: isWindows ? false : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Throttle timers/animations in the background to save CPU.
      backgroundThrottling: true
    }
  })

  // Keep the full window transparent. Renderer-level styling handles the frosted bar.
  if (isWindows) {
    try {
      mainWindow.setBackgroundMaterial('none')
    } catch {
      // Older Electron/Windows versions can ignore this safely.
    }

    // Re-apply transparent paint color at runtime for Windows compositors.
    mainWindow.setBackgroundColor('rgba(0, 0, 0, 0)')
  }

  // macOS: Don't use vibrancy as it overrides transparency. Use backgroundColor instead.
  if (isMac) {
    mainWindow.setBackgroundColor('rgba(0, 0, 0, 0)')
  }

  mainWindow.webContents.on('did-finish-load', () => {
    // Force renderer roots to stay transparent even in dev/HMR reloads.
    mainWindow?.webContents.insertCSS(
      'html, body, #root, :root { background: transparent !important; }'
    )
  })

  mainWindow.on('ready-to-show', () => {
    // Don't show on start – wait for shortcut
  })

  mainWindow.on('blur', () => {
    if (isVisible && !isPinned) {
      hideWindow()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRendererWindow(mainWindow)
}

export function createSettingsWindow(tab?: string): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (tab) {
      settingsWindow.webContents.send('navigate-settings-tab', tab)
    }
    const { x, y } = getSettingsWindowPosition()
    settingsWindow.setPosition(x, y)
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore()
    } else {
      settingsWindow.show()
    }
    settingsWindow.focus()
    return
  }

  const { x, y } = getSettingsWindowPosition()

  settingsWindow = new BrowserWindow({
    width: SETTINGS_WINDOW_WIDTH,
    height: SETTINGS_WINDOW_HEIGHT,
    x,
    y,
    minWidth: 800,
    minHeight: 450,
    title: 'Covenant Settings',
    show: false,
    // macOS gets the native traffic-light controls; Windows keeps the custom
    // frameless chrome rendered by the settings UI.
    ...(isMac
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 12, y: 14 } }
      : { frame: false }),
    transparent: true,
    autoHideMenuBar: true,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  settingsWindow.setAspectRatio(16 / 9)

  settingsWindow.on('ready-to-show', () => {
    settingsWindow?.show()
    settingsWindow?.focus()
  })

  settingsWindow.on('show', () => {
    settingsWindow?.webContents.send('settings-shown', false)
  })

  settingsWindow.on('restore', () => {
    settingsWindow?.webContents.send('settings-shown', true)
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  settingsWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRendererWindow(settingsWindow, 'settings', tab)
}

function createPasteWindow(): BrowserWindow {
  if (pasteWindow && !pasteWindow.isDestroyed()) return pasteWindow

  const { x, y } = getPasteWindowPosition()

  pasteWindow = new BrowserWindow({
    width: PASTE_WINDOW_WIDTH,
    height: PASTE_WINDOW_HEIGHT,
    x,
    y,
    minWidth: 640,
    minHeight: 400,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    title: 'Covenant Paste Manager',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Throttle timers/animations when hidden to save CPU.
      backgroundThrottling: true
    }
  })

  if (isMac) {
    pasteWindow.setBackgroundColor('rgba(0, 0, 0, 0)')
  }

  pasteWindow.on('ready-to-show', () => {
    pasteWindow?.show()
    pasteWindow?.focus()
  })

  pasteWindow.on('blur', () => {
    if (!isPasteBlurSuppressed() && pasteWindow && !pasteWindow.isDestroyed()) {
      hidePasteWindow()
    }
  })

  pasteWindow.on('closed', () => {
    pasteWindow = null
  })

  pasteWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRendererWindow(pasteWindow, 'paste')
  return pasteWindow
}

export function showPasteWindow(): void {
  const win = createPasteWindow()
  const { x, y } = getPasteWindowPosition()
  win.setBounds({ x, y, width: PASTE_WINDOW_WIDTH, height: PASTE_WINDOW_HEIGHT })

  if (win.isMinimized()) win.restore()

  // First open: `ready-to-show` reveals the window once the renderer is ready.
  if (win.webContents.isLoading()) return

  win.show()
  win.focus()
  win.webContents.send('paste:shown')
}

export function hidePasteWindow(): void {
  if (!pasteWindow || pasteWindow.isDestroyed()) return
  pasteWindow.hide()
  scheduleSleepModeCleanup(pasteWindow)
}

export function togglePasteWindow(): void {
  const config = readConfig()
  if (!config.pasteManager?.enabled) return

  if (pasteWindow && !pasteWindow.isDestroyed() && pasteWindow.isVisible()) {
    hidePasteWindow()
  } else {
    showPasteWindow()
  }
}

function pasteImageContentType(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/png'
}

export function registerPasteProtocol(): void {
  try {
    protocol.handle(PASTE_PROTOCOL, async (request) => {
      try {
        const url = new URL(request.url)
        const kind = url.hostname === 'thumb' ? 'thumb' : 'full'
        const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
        const manager = getPasteManager()
        if (!manager || !id) {
          return new Response('Not found', { status: 404 })
        }

        const filePath = manager.getImageFilePath(id, kind)
        if (!filePath) {
          return new Response('Not found', { status: 404 })
        }

        const data = await fsPromises.readFile(filePath)
        return new Response(data, {
          headers: { 'content-type': pasteImageContentType(filePath), 'cache-control': 'no-cache' }
        })
      } catch {
        return new Response('Error', { status: 500 })
      }
    })
  } catch (error) {
    console.error('Failed to register paste protocol handler:', error)
  }
}

// ---------------------------------------------------------------------------
// Two-phase window show/hide
//
// The window is transparent and frameless, so calling show() before the
// renderer has painted its entry frame makes the OS composite a stale/blank
// frame — the "blink" seen just before an animation starts. Instead we:
//   1. ask the renderer to mount its entry surfaces in their hidden state
//      ('prepare'),
//   2. wait for it to confirm the frame is ready (with a safety timeout),
//   3. show + focus the window, then tell the renderer to run the animation
//      ('animate').
// Hiding mirrors this: the renderer plays its exit animation and calls back
// when it finishes, so the native window disappears exactly in sync.
// ---------------------------------------------------------------------------

export function markRendererReady(): void {
  if (rendererReadyResolver) {
    const resolve = rendererReadyResolver
    rendererReadyResolver = null
    resolve()
  }
}

function waitForRendererReady(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      if (rendererReadyResolver === finish) rendererReadyResolver = null
      resolve()
    }

    rendererReadyResolver = finish
    setTimeout(finish, RENDERER_READY_TIMEOUT_MS)
  })
}

export function completeHide(): void {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  if (isVisible || !mainWindow || mainWindow.isDestroyed()) return
  mainWindow.hide()
  scheduleSleepModeCleanup(mainWindow)
}

export function showWindow(terminalMode = false): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }

  const { x, y } = getWindowPosition()
  mainWindow.setBounds({ x, y, width: WINDOW_WIDTH, height: WINDOW_HEIGHT })

  isVisible = true

  // Mount the entry surfaces in their hidden state while still off-screen.
  mainWindow.webContents.send('toggle-visibility', true, terminalMode, 'prepare')

  void waitForRendererReady().then(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !isVisible) return
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('toggle-visibility', true, terminalMode, 'animate')
  })
}

export function hideWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('toggle-visibility', false)
  isVisible = false
  isPinned = false

  // The renderer calls back via 'renderer-exit-complete' when its exit
  // animation finishes; this timer is only a safety net.
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(completeHide, RENDERER_EXIT_TIMEOUT_MS)
}

function scheduleSleepModeCleanup(win: BrowserWindow): void {
  if (win.isDestroyed()) return

  win.webContents.navigationHistory.clear()

  void win.webContents.session.clearCache().catch(() => {
    // Non-fatal — ignore cache-clear failures.
  })

  // global.gc is available when --expose_gc is passed via js-flags.
  try {
    if (typeof (global as Record<string, unknown>).gc === 'function') {
      ;(global as Record<string, unknown>).gc as () => void
      ;((global as Record<string, unknown>).gc as () => void)()
    }
  } catch {
    // Ignore if GC is unavailable in this build.
  }
}

function getExpandedHeight(): number {
  if (!mainWindow) return 0
  const bounds = mainWindow.getBounds()
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y })
  return Math.round(display.workArea.height * 0.8)
}

function applyWindowHeight(height: number): void {
  if (!mainWindow) return
  const bounds = mainWindow.getBounds()
  const bottomY = bounds.y + bounds.height
  const newY = bottomY - height
  mainWindow.setBounds({
    x: bounds.x,
    y: Math.max(newY, 0),
    width: WINDOW_WIDTH,
    height
  })
}

export function setWindowExpanded(expanded: boolean): void {
  const height = expanded ? getExpandedHeight() : WINDOW_HEIGHT
  applyWindowHeight(height)
}

export function setPinned(pinned: boolean): void {
  isPinned = typeof pinned === 'boolean' ? pinned : false
}

export function closeSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close()
  }
}

export function minimizeSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.minimize()
  }
}

function toggleWindow(): void {
  if (isVisible) {
    hideWindow()
  } else {
    showWindow()
  }
}

function openTerminalMode(): void {
  if (!mainWindow) return

  if (!isVisible) {
    showWindow(true)
  } else {
    mainWindow.webContents.send('toggle-visibility', true, true)
  }
}

function openTasksMode(): void {
  if (!mainWindow) return

  if (!isVisible) {
    showWindow()
  } else {
    mainWindow.webContents.send('toggle-visibility', true)
  }

  mainWindow.webContents.send('open-tasks')
}

function getShortcutDisplay(shortcut: string): string {
  return shortcut || 'Disabled'
}

function updateTrayTooltip(shortcut: string): void {
  if (tray && !tray.isDestroyed()) {
    const display = getShortcutDisplay(shortcut)
    tray.setToolTip(`Covenant - ${display}`)
  }
}

export function registerShortcuts(config: AppConfig): void {
  globalShortcut.unregisterAll()

  const shortcuts = config.shortcuts ?? DEFAULT_SHORTCUTS

  if (shortcuts.openApp) {
    try {
      const ok = globalShortcut.register(shortcuts.openApp, toggleWindow)
      if (!ok) {
        console.warn(`Failed to register global shortcut: ${shortcuts.openApp} (may conflict with another app)`)
      }
    } catch (error) {
      console.warn(`Error registering global shortcut '${shortcuts.openApp}':`, error)
    }
  }

  if (shortcuts.openAppTerminal) {
    try {
      const ok = globalShortcut.register(shortcuts.openAppTerminal, openTerminalMode)
      if (!ok) {
        console.warn(`Failed to register global shortcut: ${shortcuts.openAppTerminal} (may conflict with another app)`)
      }
    } catch (error) {
      console.warn(`Error registering global shortcut '${shortcuts.openAppTerminal}':`, error)
    }
  }

  if (shortcuts.openTasks) {
    try {
      const ok = globalShortcut.register(shortcuts.openTasks, openTasksMode)
      if (!ok) {
        console.warn(`Failed to register global shortcut: ${shortcuts.openTasks} (may conflict with another app)`)
      }
    } catch (error) {
      console.warn(`Error registering global shortcut '${shortcuts.openTasks}':`, error)
    }
  }

  if (shortcuts.openPaste && config.pasteManager?.enabled) {
    try {
      const ok = globalShortcut.register(shortcuts.openPaste, togglePasteWindow)
      if (!ok) {
        console.warn(`Failed to register global shortcut: ${shortcuts.openPaste} (may conflict with another app)`)
      }
    } catch (error) {
      console.warn(`Error registering global shortcut '${shortcuts.openPaste}':`, error)
    }
  }

  updateTrayTooltip(shortcuts.openApp)
}

export function createTray(): void {
  try {
    // Try to find and load tray icon
    let trayIconPath: string | null = null

    // Primary path: compiled assets
    const compiledPngPath = join(__dirname, 'assets', 'tray-icon.png')
    if (existsSync(compiledPngPath)) {
      trayIconPath = compiledPngPath
    }

    // Fallback: source assets (development)
    if (!trayIconPath) {
      const srcPngPath = join(__dirname, '..', '..', 'src', 'main', 'assets', 'tray-icon.png')
      if (existsSync(srcPngPath)) {
        trayIconPath = srcPngPath
      }
    }

    if (!trayIconPath) {
      console.warn('Tray icon not found at:', compiledPngPath)
      return
    }

    tray = new Tray(trayIconPath)

    // Set tooltip — will be updated by registerShortcuts() once config is loaded
    const config = readConfig()
    tray.setToolTip(`Covenant - ${getShortcutDisplay(config.shortcuts?.openApp ?? DEFAULT_SHORTCUTS.openApp)}`)

    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Covenant',
        click: () => {
          showWindow()
        }
      },
      {
        label: 'Settings',
        click: () => {
          createSettingsWindow()
        }
      },
      { type: 'separator' },
      {
        label: 'Check for Updates…',
        click: () => {
          checkForUpdatesManually()
        }
      },
      {
        label: 'Open logs folder',
        click: () => {
          openLogsFolder()
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Covenant',
        click: () => {
          app.quit()
        }
      }
    ])

    // Set context menu for right-click
    tray.setContextMenu(contextMenu)

    // Left-click toggles visibility
    tray.on('click', () => {
      toggleWindow()
    })
  } catch (error) {
    console.error('Failed to create tray:', error)
  }
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

export function assertMainWindowSender(sender: WebContents): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    throw new Error('Main window is unavailable.')
  }

  if (sender.id !== mainWindow.webContents.id) {
    throw new Error('Terminal access is restricted to the main command window.')
  }
}
