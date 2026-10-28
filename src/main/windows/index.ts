import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  Menu,
  nativeTheme,
  powerSaveBlocker,
  protocol,
  screen,
  session,
  shell,
  Tray
} from 'electron'
import { existsSync, promises as fsPromises } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { WebContents } from 'electron'
import type { AppConfig } from '../../shared/config'
import { DEFAULT_SHORTCUTS } from '../../shared/config'
import type { WindowTargetView, WindowView } from '../../shared/view'
import type { CodeActivitySummary } from '../../shared/code/code'
import type {
  InteractiveRect,
  InteractiveViewport
} from '../../shared/windows/interactive'
import { readConfig } from '../config/configStore'
import { openLogsFolder } from '../logger'
import { getPasteManager, isPasteBlurSuppressed } from '../paste/runtime'
import { checkForUpdatesManually } from '../updater'
import {
  isPointInInteractiveRegions,
  normalizeInteractiveRegions,
  normalizeInteractiveViewport,
  screenPointToViewportPoint
} from './pointerRegions'
import { buildTrayIcon, setTrayIconPaths } from './trayIcon'

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

const WINDOW_WIDTH = 800
const WINDOW_BASE_HEIGHT = 520
const WINDOW_BOTTOM_MARGIN = 48
const SETTINGS_WINDOW_WIDTH = 1024
const SETTINGS_WINDOW_HEIGHT = 576
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
let tray: Tray | null = null
let trayShortcutDisplay = 'Disabled'
// Registered once: createTray() is intentionally re-entrant (Windows ghost icons).
let trayAppearanceListenerAttached = false
let codeActivity: CodeActivitySummary | null = null
let isVisible = false
let isPinned = false
let isMeetingRecording = false
let isVoiceRecording = false
let meetingPowerBlockerId: number | null = null
// Mirror of the surface the renderer is currently showing. Only meaningful
// while the window is visible; it drives the "same shortcut again closes"
// behaviour of requestView().
let currentView: WindowView | null = null

let rendererReadyResolver: (() => void) | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

// Windows click-through is driven from the main process instead of Electron's
// `setIgnoreMouseEvents(..., { forward: true })`. Forwarding installs a global
// low-level mouse hook (WH_MOUSE_LL) on the main thread, which delays mouse
// input system-wide whenever the main process is busy. The renderer reports the
// rectangles of its interactive surfaces and a light cursor poll toggles the
// window's ignore state instead.
const POINTER_POLL_MS = 40
let pointerTimer: ReturnType<typeof setInterval> | null = null
let pointerIgnoring = false
let pointerDown = false
let interactiveRegions: InteractiveRect[] = []
let interactiveViewport: InteractiveViewport | null = null
let hasInteractiveRegions = false

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow
}

export function getMainWebContents(): WebContents | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null
}

export function getSettingsWebContents(): WebContents | null {
  return settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow.webContents : null
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

function loadRendererWindow(
  targetWindow: BrowserWindow,
  route?: 'settings',
  tab?: string
): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    if (route === 'settings') {
      const query = tab ? `?tab=${encodeURIComponent(tab)}` : ''
      targetWindow.loadURL(`${rendererUrl}#/settings${query}`)
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

  targetWindow.loadFile(rendererEntryFile)
}

/**
 * Resolve an asset bundled under `src/main/assets`. Built apps read the copy in
 * `out/main/assets`; dev runs fall back to the source folder because
 * `copyAssetsPlugin` only applies to `build`.
 */
function resolveTrayAsset(fileName: string): string | null {
  const compiledPath = join(__dirname, 'assets', fileName)
  if (existsSync(compiledPath)) return compiledPath

  const sourcePath = join(__dirname, '..', '..', 'src', 'main', 'assets', fileName)
  return existsSync(sourcePath) ? sourcePath : null
}

export function createWindow(): void {
  const layout = getMainWindowLayout()

  mainWindow = new BrowserWindow({
    width: layout.width,
    height: layout.height,
    icon: resolveTrayAsset('tray-icon-light.png') ?? undefined,
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

  // The native window stays transparent only so the rounded bar can float with
  // a CSS shadow and the reserved margins can stay click-through. Every visible
  // app surface is rendered opaque in the renderer.
  //
  // We intentionally don't use vibrancy (macOS) or backgroundMaterial
  // (Windows 11): both apply to the whole native window, and this window is
  // oversized to hold the expanded surfaces and popups. They would paint a
  // large rectangular material instead of a rounded bar. Windows 10 has no
  // supported acrylic/Mica equivalent anyway.
  if (isWindows) {
    try {
      mainWindow.setBackgroundMaterial('none')
    } catch {
      // Older Electron/Windows versions can ignore this safely.
    }

    // Re-apply transparent paint color at runtime for Windows compositors.
    mainWindow.setBackgroundColor('rgba(0, 0, 0, 0)')
  }

  if (isMac) {
    mainWindow.setBackgroundColor('rgba(0, 0, 0, 0)')
  }

  mainWindow.webContents.on('did-finish-load', () => {
    // Force renderer roots to stay transparent even in dev/HMR reloads.
    mainWindow?.webContents.insertCSS(
      'html, body, #root, :root { background: transparent !important; }'
    )
  })

  mainWindow.webContents.on('render-process-gone', () => {
    resetPointerInteraction()
    setMeetingRecordingActive(false)
    setVoiceRecordingActive(false)
  })

  mainWindow.on('ready-to-show', () => {
    // Don't show on start – wait for shortcut
  })

  mainWindow.on('blur', () => {
    // Keep the bar on screen while dictating so a stray click outside doesn't
    // dismiss the command bar mid-recording.
    if (isVisible && !isPinned && !isVoiceRecording && !isPasteBlurSuppressed()) {
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

/**
 * Grants the main command window system-audio capture for meeting recording.
 * The renderer asks for getDisplayMedia() with audio; Electron resolves it to
 * the primary screen's loopback audio (CoreAudio Tap on macOS 14.2+, WASAPI on
 * Windows).
 */
export function configureMeetingAudioCapture(): void {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const deny = (): void => callback(null as never)
    try {
      if (!request.audioRequested || !mainWindow || mainWindow.isDestroyed()) {
        deny()
        return
      }

      const mainFrame = mainWindow.webContents.mainFrame
      if (!request.frame || request.frame.top !== mainFrame) {
        deny()
        return
      }

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 }
      })
      const source = sources[0]
      if (!source) {
        deny()
        return
      }

      callback({ video: source, audio: 'loopback' })
    } catch (error) {
      console.error('Failed to resolve meeting audio capture:', error)
      deny()
    }
  })
}

export function setMeetingRecordingActive(active: boolean): void {
  const next = active === true
  if (isMeetingRecording === next) return
  isMeetingRecording = next

  const contents = getMainWebContents()
  if (contents) {
    contents.setBackgroundThrottling(!next)
  }

  if (next) {
    if (meetingPowerBlockerId === null) {
      meetingPowerBlockerId = powerSaveBlocker.start('prevent-app-suspension')
    }
  } else if (meetingPowerBlockerId !== null) {
    if (powerSaveBlocker.isStarted(meetingPowerBlockerId)) {
      powerSaveBlocker.stop(meetingPowerBlockerId)
    }
    meetingPowerBlockerId = null
  }

  refreshTray()
}

export function stopMeetingRecording(): void {
  const contents = getMainWebContents()
  if (contents && !contents.isDestroyed()) {
    contents.send('notes:meeting-stop')
  }
  // The renderer normally clears this after finalizing. If it is gone, clear it
  // now so the tray doesn't keep showing a stale mic badge.
  if (!contents || contents.isDestroyed()) {
    setMeetingRecordingActive(false)
    return
  }
  setTimeout(() => {
    if (isMeetingRecording) setMeetingRecordingActive(false)
  }, 4_000)
}

/**
 * Reflects the command-bar mic dictation (voice input) in the tray with the
 * same mic badge used for meeting recordings.
 */
export function setVoiceRecordingActive(active: boolean): void {
  const next = active === true
  if (isVoiceRecording === next) return
  isVoiceRecording = next
  refreshTray()
}

export function stopVoiceRecording(): void {
  const contents = getMainWebContents()
  if (!contents || contents.isDestroyed()) {
    setVoiceRecordingActive(false)
    return
  }
  // The renderer stops its MediaRecorder and clears the badge on stop.
  contents.send('voice:stop-recording')
}

export function disposeMeetingRecording(): void {
  if (meetingPowerBlockerId !== null && powerSaveBlocker.isStarted(meetingPowerBlockerId)) {
    powerSaveBlocker.stop(meetingPowerBlockerId)
  }
  meetingPowerBlockerId = null
  isMeetingRecording = false
  isVoiceRecording = false
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
  resetPointerInteraction()
  mainWindow.hide()
  scheduleSleepModeCleanup(mainWindow)
}

export function showWindow(view: WindowTargetView = 'bar'): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }

  // The window keeps its full expanded size at all times; only the content
  // animates inside it. Reposition it under the cursor's display.
  mainWindow.setBounds(getMainWindowLayout())
  // Start interactive so the bar responds immediately on show; the renderer
  // reports its interactive regions shortly after, and the cursor poll takes
  // over from there.
  resetPointerInteraction()

  isVisible = true
  currentView = view

  // Mount the entry surfaces in their hidden state while still off-screen.
  mainWindow.webContents.send('toggle-visibility', true, view, 'prepare')

  void waitForRendererReady().then(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !isVisible) return
    mainWindow.show()
    mainWindow.focus()
    startPointerTracking()
    mainWindow.webContents.send('toggle-visibility', true, view, 'animate')
  })
}

/**
 * Keyboard-navigation entry point. A global shortcut targets a single view:
 *  - window hidden            → open on the target view,
 *  - already on that view     → close the window,
 *  - on a different view      → switch to the target view without closing.
 * This is what makes every shortcut behave as its own toggle.
 */
export function requestView(view: WindowTargetView): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (!isVisible) {
    showWindow(view)
    return
  }

  if (currentView === view) {
    hideWindow()
    return
  }

  currentView = view
  mainWindow.webContents.send('set-view', view)
}

/** Renderer reports the surface it is currently showing (or `popup` for a
 * transient popup with no dedicated shortcut). Ignored while hidden so a
 * lingering report from the exit animation can't dirty the next show. */
export function reportView(view: WindowView): void {
  if (isVisible) currentView = view
}

export function hideWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  // Let clicks fall through while the exit animation plays; no forwarding hook
  // is installed on Windows.
  stopPointerTracking(true)
  pointerDown = false
  mainWindow.webContents.send('toggle-visibility', false)
  isVisible = false
  isPinned = false
  // Drop the mirrored view so a later show always starts from its target
  // instead of resurrecting whatever was open when the window was hidden.
  currentView = null

  // The renderer calls back via 'renderer-exit-complete' when its exit
  // animation finishes; this timer is only a safety net.
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(completeHide, RENDERER_EXIT_TIMEOUT_MS)
}

function scheduleSleepModeCleanup(win: BrowserWindow): void {
  if (win.isDestroyed()) return

  // Only drop navigation history while hidden. Clearing the HTTP cache and
  // forcing a full GC here made every dismissal hitch for no user-visible
  // benefit; V8 recycles the rest of the memory on its own.
  win.webContents.navigationHistory.clear()
}

// ---------------------------------------------------------------------------
// Click-through handling
//
// Windows cannot use `setIgnoreMouseEvents(..., { forward: true })`: Electron
// implements forwarding with a global WH_MOUSE_LL hook whose callback runs on
// the main-process thread, so any main-thread stall delays mouse input for
// every application. Instead the renderer reports the rectangles of its
// interactive surfaces; a cheap cursor poll toggles the window's ignore state.
// macOS keeps the existing forwarding path, where it is not a system-wide hook.
// ---------------------------------------------------------------------------

function applyMouseIgnore(ignore: boolean, forward: boolean): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!isWindows && !isMac) return
  try {
    if (forward) {
      mainWindow.setIgnoreMouseEvents(ignore, { forward: true })
    } else {
      mainWindow.setIgnoreMouseEvents(ignore)
    }
  } catch {
    // The window may have been destroyed between the guard and the call.
  }
}

function setWindowsIgnore(ignore: boolean): void {
  if (!isWindows) return
  if (pointerIgnoring === ignore) return
  pointerIgnoring = ignore
  applyMouseIgnore(ignore, false)
}

function tickPointer(): void {
  if (!isWindows || !mainWindow || mainWindow.isDestroyed() || !isVisible) return

  // Stay interactive until the renderer has reported its layout; otherwise a
  // click during the first frame after showing would fall through.
  if (!hasInteractiveRegions || !interactiveViewport) {
    setWindowsIgnore(false)
    return
  }

  const bounds = mainWindow.getContentBounds()
  const point = screen.getCursorScreenPoint()
  const local = screenPointToViewportPoint(point, bounds, interactiveViewport)
  const inside =
    pointerDown || isPointInInteractiveRegions(local.x, local.y, interactiveRegions)
  setWindowsIgnore(!inside)
}

function startPointerTracking(): void {
  if (!isWindows || pointerTimer) return
  pointerTimer = setInterval(tickPointer, POINTER_POLL_MS)
  pointerTimer.unref?.()
  tickPointer()
}

function stopPointerTracking(passThrough: boolean): void {
  if (pointerTimer) {
    clearInterval(pointerTimer)
    pointerTimer = null
  }
  if (isWindows) setWindowsIgnore(passThrough)
}

/** Clears all pointer state and releases any click-through mode. */
export function resetPointerInteraction(): void {
  if (pointerTimer) {
    clearInterval(pointerTimer)
    pointerTimer = null
  }
  pointerDown = false
  interactiveRegions = []
  interactiveViewport = null
  hasInteractiveRegions = false
  pointerIgnoring = false
  applyMouseIgnore(false, false)
}

/** Renderer-reported interactive surfaces, in CSS pixels relative to the viewport. */
export function setInteractiveRegions(regions: unknown, viewport: unknown): void {
  if (!isWindows || !isVisible) return
  interactiveRegions = normalizeInteractiveRegions(regions)
  interactiveViewport = normalizeInteractiveViewport(viewport) ?? interactiveViewport
  hasInteractiveRegions = true
  tickPointer()
}

/** Pauses click-through toggling while a drag or selection is in progress. */
export function setPointerDown(down: boolean): void {
  if (!isWindows) return
  pointerDown = down === true
  tickPointer()
}

export function setMainWindowIgnoreMouseEvents(ignore: boolean): void {
  // Windows uses the cursor poll above; ignore renderer-driven requests there
  // so the two paths cannot fight each other.
  if (isWindows) return
  if (!isMac) return
  applyMouseIgnore(ignore, true)
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

function openTerminalMode(): void {
  requestView('terminal')
}

function openTasksMode(): void {
  requestView('tasks')
}

export function openCodeSurface(): void {
  // Rendered in the main window, above the command bar, as the OpenCode
  // surface (no separate window).
  requestView('code')
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
  const codeLabel = codeActivity ? codeStatusLabel(codeActivity) : null
  const labels: string[] = []
  if (isMeetingRecording) labels.push('Meeting recording')
  if (isVoiceRecording) labels.push('Voice recording')
  if (codeLabel) labels.push(codeLabel)
  tray.setToolTip(
    labels.length > 0 ? `Covenant — ${labels.join(' · ')}` : `Covenant - ${trayShortcutDisplay}`
  )
}

function buildTrayContextMenu(): Menu {
  const label = codeActivity ? codeStatusLabel(codeActivity) : null
  const template: Electron.MenuItemConstructorOptions[] = []
  if (isMeetingRecording) {
    template.push({
      label: 'Stop meeting recording',
      click: () => stopMeetingRecording()
    })
    template.push({ type: 'separator' })
  }
  if (isVoiceRecording) {
    template.push({
      label: 'Stop voice recording',
      click: () => stopVoiceRecording()
    })
    template.push({ type: 'separator' })
  }
  if (label) {
    template.push({ label, enabled: false })
    template.push({ label: 'Open Code', click: () => openCodeSurface() })
    template.push({ type: 'separator' })
  }
  template.push(
    { label: 'Open Covenant', click: () => showWindow() },
    { label: 'Open Notes', click: () => requestView('notes') },
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
  const icon = buildTrayIcon(codeActivity?.state ?? 'idle', isMeetingRecording || isVoiceRecording)
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
      const ok = globalShortcut.register(shortcuts.openApp, () => requestView('bar'))
      if (!ok) {
        console.warn(`Failed to register global shortcut: ${shortcuts.openApp} (may conflict with another app)`)
      }
    } catch (error) {
      console.warn(`Error registering global shortcut '${shortcuts.openApp}':`, error)
    }
  }

  if (shortcuts.openLastConversation) {
    try {
      const ok = globalShortcut.register(shortcuts.openLastConversation, () => requestView('chat'))
      if (!ok) {
        console.warn(
          `Failed to register global shortcut: ${shortcuts.openLastConversation} (may conflict with another app)`
        )
      }
    } catch (error) {
      console.warn(`Error registering global shortcut '${shortcuts.openLastConversation}':`, error)
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
      const ok = globalShortcut.register(shortcuts.openPaste, () => requestView('paste'))
      if (!ok) {
        console.warn(`Failed to register global shortcut: ${shortcuts.openPaste} (may conflict with another app)`)
      }
    } catch (error) {
      console.warn(`Error registering global shortcut '${shortcuts.openPaste}':`, error)
    }
  }

  if (shortcuts.openNotes) {
    try {
      const ok = globalShortcut.register(shortcuts.openNotes, () => requestView('notes'))
      if (!ok) {
        console.warn(`Failed to register global shortcut: ${shortcuts.openNotes} (may conflict with another app)`)
      }
    } catch (error) {
      console.warn(`Error registering global shortcut '${shortcuts.openNotes}':`, error)
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

    // macOS gets one artwork per menu bar appearance; everything else uses the
    // light one (the Windows tray theme is fixed).
    const lightIconPath = resolveTrayAsset('tray-icon-light.png')
    const darkIconPath = resolveTrayAsset('tray-icon-dark.png')

    if (!lightIconPath && !darkIconPath) {
      console.warn('Tray icon not found in:', join(__dirname, 'assets'))
      return
    }

    setTrayIconPaths({
      light: lightIconPath ?? undefined,
      dark: darkIconPath ?? undefined
    })

    // Tooltip — registerShortcuts() refreshes it with the live shortcut.
    const config = readConfig()
    trayShortcutDisplay = getShortcutDisplay(config.shortcuts?.openApp ?? DEFAULT_SHORTCUTS.openApp)

    const initialIcon = buildTrayIcon('idle', isMeetingRecording)
    const fallbackIconPath = lightIconPath ?? darkIconPath!
    tray = initialIcon && !initialIcon.isEmpty() ? new Tray(initialIcon) : new Tray(fallbackIconPath)

    refreshTray()

    // macOS flips the menu bar between light and dark with Appearance/Auto;
    // rebuild so the matching artwork is used.
    if (isMac && !trayAppearanceListenerAttached) {
      nativeTheme.on('updated', refreshTray)
      trayAppearanceListenerAttached = true
    }

    // Left-click toggles visibility.
    tray.on('click', () => {
      if (isVisible) {
        hideWindow()
      } else {
        showWindow('bar')
      }
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

  if (trayAppearanceListenerAttached) {
    nativeTheme.removeListener('updated', refreshTray)
    trayAppearanceListenerAttached = false
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
