import { app, BrowserWindow, globalShortcut, Menu, protocol, screen, shell, Tray } from 'electron'
import { existsSync, promises as fsPromises } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { WebContents } from 'electron'
import type { AppConfig } from '../../shared/config'
import { DEFAULT_SHORTCUTS } from '../../shared/config'
import type { CodeActivitySummary } from '../../shared/code/code'
import { readConfig } from '../config/configStore'
import { openLogsFolder } from '../logger'
import { getPasteManager, isPasteBlurSuppressed } from '../paste/runtime'
import { checkForUpdatesManually } from '../updater'
import { buildTrayIcon, setTrayIconPath } from './trayIcon'

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

const WINDOW_WIDTH = 800
const WINDOW_BASE_HEIGHT = 520
const WINDOW_BOTTOM_MARGIN = 48
const SETTINGS_WINDOW_WIDTH = 1024
const SETTINGS_WINDOW_HEIGHT = 576
const PASTE_WINDOW_WIDTH = 960
const PASTE_WINDOW_HEIGHT = 600
const PASTE_PROTOCOL = 'covenant-paste'

const RENDERER_READY_TIMEOUT_MS = 160
const RENDERER_EXIT_TIMEOUT_MS = 700
// The main window reserves room for the expanded layout (both axes) at all
// times and only the content animates inside it. Resizing the native
// (transparent) window while it is visible both flashes and makes the content
// jitter, so the window itself never changes size while shown.
const WINDOW_EXPANDED_RATIO = 0.8

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let pasteWindow: BrowserWindow | null = null
let tray: Tray | null = null
let trayShortcutDisplay = 'Disabled'
let codeActivity: CodeActivitySummary | null = null
let isVisible = false
let isPinned = false
let isPasteVisible = false

let rendererReadyResolver: (() => void) | null = null
let pasteReadyResolver: (() => void) | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let pasteHideTimer: ReturnType<typeof setTimeout> | null = null

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

function getMainWindowLayout(): { x: number; y: number; width: number; height: number } {
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { x: workAreaX, y: workAreaY, width: workAreaWidth, height: workAreaHeight } =
    display.workArea

  const width = Math.max(WINDOW_WIDTH, Math.round(workAreaWidth * WINDOW_EXPANDED_RATIO))
  const height = Math.max(WINDOW_BASE_HEIGHT, Math.round(workAreaHeight * WINDOW_EXPANDED_RATIO))

  return {
    x: Math.round(workAreaX + (workAreaWidth - width) / 2),
    y: Math.round(workAreaY + workAreaHeight - height - WINDOW_BOTTOM_MARGIN),
    width,
    height
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
  const layout = getMainWindowLayout()

  mainWindow = new BrowserWindow({
    width: layout.width,
    height: layout.height,
    icon: join(__dirname, 'assets', 'tray-icon.png'),
    x: layout.x,
    y: layout.y,
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
    backgroundMaterial: isWindows ? 'none' : undefined,
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

  if (isWindows) {
    try {
      pasteWindow.setBackgroundMaterial('none')
    } catch {
      // Older Electron/Windows versions can ignore this safely.
    }
    pasteWindow.setBackgroundColor('rgba(0, 0, 0, 0)')
  }

  if (isMac) {
    pasteWindow.setBackgroundColor('rgba(0, 0, 0, 0)')
  }

  // Keep renderer roots transparent so the OS never composites a white frame
  // while the paste window is being shown.
  pasteWindow.webContents.on('did-finish-load', () => {
    pasteWindow?.webContents.insertCSS(
      'html, body, #root, :root { background: transparent !important; }'
    )
  })

  pasteWindow.on('blur', () => {
    if (!isPasteBlurSuppressed() && pasteWindow && !pasteWindow.isDestroyed()) {
      hidePasteWindow()
    }
  })

  pasteWindow.on('closed', () => {
    if (pasteHideTimer) {
      clearTimeout(pasteHideTimer)
      pasteHideTimer = null
    }
    isPasteVisible = false
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

  // Cancel any in-flight hide so it can't slam the window shut mid-reveal.
  if (pasteHideTimer) {
    clearTimeout(pasteHideTimer)
    pasteHideTimer = null
  }
  isPasteVisible = true

  // Two-phase reveal (mirrors the main window): mount the surfaces in their
  // hidden entry state while the window is still off-screen, wait for the
  // renderer to confirm the frame is ready, then show + animate. Showing before
  // the renderer has painted makes the OS composite a stale/blank frame — the
  // "blink" seen when the Paste Manager opens.
  win.webContents.send('paste:prepare')

  void waitForPasteRendererReady().then(() => {
    if (!isPasteVisible || !pasteWindow || pasteWindow.isDestroyed()) return
    pasteWindow.show()
    pasteWindow.focus()
    pasteWindow.webContents.send('paste:shown')
  })
}

export function hidePasteWindow(): void {
  if (!pasteWindow || pasteWindow.isDestroyed()) return
  isPasteVisible = false

  // Let the renderer animate out and blank its frame while still visible, then
  // hide. Hiding first would leave the last painted (fully visible) frame in
  // the compositor, which the OS shows for a frame on the next open — the
  // "blink".
  pasteWindow.webContents.send('paste:hide')

  if (pasteHideTimer) clearTimeout(pasteHideTimer)
  pasteHideTimer = setTimeout(completeHidePasteWindow, RENDERER_EXIT_TIMEOUT_MS)
}

export function completeHidePasteWindow(): void {
  if (pasteHideTimer) {
    clearTimeout(pasteHideTimer)
    pasteHideTimer = null
  }
  if (isPasteVisible || !pasteWindow || pasteWindow.isDestroyed()) return
  pasteWindow.hide()
  scheduleSleepModeCleanup(pasteWindow)
}

export function togglePasteWindow(): void {
  const config = readConfig()
  if (!config.pasteManager?.enabled) return

  if (isPasteVisible) {
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

export function markPasteRendererReady(): void {
  if (pasteReadyResolver) {
    const resolve = pasteReadyResolver
    pasteReadyResolver = null
    resolve()
  }
}

function waitForPasteRendererReady(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      if (pasteReadyResolver === finish) pasteReadyResolver = null
      resolve()
    }

    pasteReadyResolver = finish
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

  // The window keeps its full expanded size at all times; only the content
  // animates inside it. Reposition it under the cursor's display.
  mainWindow.setBounds(getMainWindowLayout())
  // Start interactive so the bar responds immediately on show; the renderer
  // re-enables click-through once the pointer moves over empty space.
  setMainWindowIgnoreMouseEvents(false)

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

// Toggles click-through for the transparent regions of the window. The renderer
// drives this from mousemove so the reserved (empty) area stays usable while the
// content region remains interactive. `forward` keeps mouse-move messages coming
// to the renderer while the window is ignoring mouse events. Only Windows and
// macOS can forward mouse moves, so other platforms stay interactive.
export function setMainWindowIgnoreMouseEvents(ignore: boolean): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!isWindows && !isMac) return
  mainWindow.setIgnoreMouseEvents(ignore, { forward: true })
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

export function openCodeSurface(): void {
  if (!mainWindow) return

  if (!isVisible) {
    showWindow()
  } else {
    mainWindow.webContents.send('toggle-visibility', true)
  }

  // Render this in the main window, above the command bar, as the OpenCode
  // surface (no separate window).
  mainWindow.webContents.send('open-code')
}

function toggleCodeMode(): void {
  if (!mainWindow) return
  mainWindow.webContents.send('toggle-code-mode')
}

function getShortcutDisplay(shortcut: string): string {
  return shortcut || 'Disabled'
}

function codeStatusLabel(summary: CodeActivitySummary): string | null {
  switch (summary.state) {
    case 'awaiting':
      return `Code: needs your input${summary.awaitingCount > 1 ? ` (${summary.awaitingCount})` : ''}`
    case 'error':
      return `Code: session error${summary.errorCount > 1 ? ` (${summary.errorCount})` : ''}`
    case 'running':
      return `Code: running${summary.runningCount > 1 ? ` (${summary.runningCount})` : ''}`
    case 'finished':
      return `Code: finished${summary.finishedCount > 1 ? ` (${summary.finishedCount})` : ''}`
    default:
      return null
  }
}

function refreshTrayTooltip(): void {
  if (!tray || tray.isDestroyed()) return
  const label = codeActivity ? codeStatusLabel(codeActivity) : null
  tray.setToolTip(label ? `Covenant — ${label}` : `Covenant - ${trayShortcutDisplay}`)
}

function buildTrayContextMenu(): Menu {
  const label = codeActivity ? codeStatusLabel(codeActivity) : null
  const template: Electron.MenuItemConstructorOptions[] = []
  if (label) {
    template.push({ label, enabled: false })
    template.push({ label: 'Open Code', click: () => openCodeSurface() })
    template.push({ type: 'separator' })
  }
  template.push(
    { label: 'Open Covenant', click: () => showWindow() },
    { label: 'Settings', click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: 'Check for Updates…', click: () => checkForUpdatesManually() },
    { label: 'Open logs folder', click: () => openLogsFolder() },
    { type: 'separator' },
    { label: 'Quit Covenant', click: () => app.quit() }
  )
  return Menu.buildFromTemplate(template)
}

function refreshTray(): void {
  if (!tray || tray.isDestroyed()) return
  const icon = buildTrayIcon(codeActivity?.state ?? 'idle')
  if (icon && !icon.isEmpty()) tray.setImage(icon)
  refreshTrayTooltip()
  tray.setContextMenu(buildTrayContextMenu())
}

/** Reflect the current Covenant Code activity in the tray (icon, tooltip, menu). */
export function applyCodeActivityStatus(summary: CodeActivitySummary): void {
  codeActivity = summary
  refreshTray()
}

function updateTrayTooltip(shortcut: string): void {
  trayShortcutDisplay = getShortcutDisplay(shortcut)
  refreshTrayTooltip()
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

  if (shortcuts.openCode) {
    try {
      const ok = globalShortcut.register(shortcuts.openCode, openCodeSurface)
      if (!ok) {
        console.warn(`Failed to register global shortcut: ${shortcuts.openCode} (may conflict with another app)`)
      }
    } catch (error) {
      console.warn(`Error registering global shortcut '${shortcuts.openCode}':`, error)
    }
  }

  if (shortcuts.toggleCodeMode) {
    try {
      const ok = globalShortcut.register(shortcuts.toggleCodeMode, toggleCodeMode)
      if (!ok) {
        console.warn(`Failed to register global shortcut: ${shortcuts.toggleCodeMode} (may conflict with another app)`)
      }
    } catch (error) {
      console.warn(`Error registering global shortcut '${shortcuts.toggleCodeMode}':`, error)
    }
  }

  updateTrayTooltip(shortcuts.openApp)
}

export function createTray(): void {
  try {
    // Idempotent: never accumulate Tray instances (Windows keeps "ghost" icons
    // for any tray that isn't cleanly destroyed).
    if (tray && !tray.isDestroyed()) {
      tray.destroy()
      tray = null
    }

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

    setTrayIconPath(trayIconPath)

    // Tooltip — registerShortcuts() refreshes it with the live shortcut.
    const config = readConfig()
    trayShortcutDisplay = getShortcutDisplay(config.shortcuts?.openApp ?? DEFAULT_SHORTCUTS.openApp)

    const initialIcon = buildTrayIcon('idle')
    tray = initialIcon && !initialIcon.isEmpty() ? new Tray(initialIcon) : new Tray(trayIconPath)

    refreshTray()

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
