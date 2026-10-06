import { app, BrowserWindow, globalShortcut, protocol } from 'electron'
import { join } from 'path'
import dotenv from 'dotenv'
import { readConfig, updateConfig } from './config/configStore'
import { CodeService, getCodeService, setCodeService } from './code/codeService'
import { warmInstalledAppsCache } from './installedApps'
import { registerIpc } from './ipc'
import { setupLogger } from './logger'
import { PasteManager } from './paste/pasteManager'
import { getPasteManager, setPasteManager } from './paste/runtime'
import { applySessionProxy, resolveOpenAIProxyUrl } from './proxy'
import { configureMcpClient, configureMcpProxy } from './services/mcpClient'
import { terminalManager } from './terminalManager'
import { setupAutoUpdater } from './updater'
import {
  createTray,
  createWindow,
  destroyTray,
  getMainWindow,
  getPasteWindow,
  getMainWebContents,
  getPasteWebContents,
  getSettingsWebContents,
  registerPasteProtocol,
  registerShortcuts,
  showWindow
} from './windows'
import { setBroadcastProviders } from './windows/broadcast'

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

// Expose V8's garbage collector so we can force a collection on window hide.
// Must be set before app.whenReady() — top-level module scope satisfies this.
app.commandLine.appendSwitch('js-flags', '--expose_gc')

// Custom scheme for serving clipboard image blobs to the paste window renderer
// without base64-in-IPC. Must be registered before app.whenReady().
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'covenant-paste',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

dotenv.config({ path: join(process.cwd(), '.env') })

setupLogger()

setBroadcastProviders({
  main: getMainWebContents,
  settings: getSettingsWebContents,
  paste: getPasteWebContents
})

registerIpc()

app.whenReady().then(() => {
  // Implement single instance lock
  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    // Another instance is already running, quit this one
    app.quit()
    return
  }

  // Handle second instance attempt
  app.on('second-instance', () => {
    if (getMainWindow()) {
      showWindow()
    }
  })

  // Covenant is a background command-bar app. On macOS, hide the Dock icon and
  // application menu so it never appears as a regular foreground "Electron"
  // app. Packaged builds enforce this via LSUIElement; this covers dev too.
  if (isMac) {
    app.dock?.hide()
  }

  const config = readConfig()

  configureMcpClient({ name: 'Covenant', version: app.getVersion() })
  configureMcpProxy(resolveOpenAIProxyUrl(config.proxyUrl))
  void applySessionProxy(resolveOpenAIProxyUrl(config.proxyUrl))

  setupAutoUpdater(() => readConfig().autoUpdate === true)

  // Apply login item settings from config
  if (isWindows || process.platform === 'darwin') {
    try {
      app.setLoginItemSettings({
        openAtLogin: config.launchOnStartup,
        openAsHidden: true,
        path: process.execPath
      })
    } catch (error) {
      console.error('Failed to set login item settings on app ready:', error)
    }
  }

  createWindow()
  createTray()

  // Build the application index in the background so the first keystroke in
  // the search field is already instant.
  warmInstalledAppsCache(config.launcherShowSystemApps === true)

  // Initialize the Paste Manager (clipboard history). The watcher only starts
  // when the feature is enabled in config.
  const manager = new PasteManager({
    baseDir: join(app.getPath('userData'), 'paste'),
    getSettings: () => readConfig().pasteManager,
    saveSettings: (settings) => {
      updateConfig({ pasteManager: settings })
    },
    getOpenAIConfig: () => {
      const current = readConfig()
      return {
        apiKey: current.apiKey || process.env.OPENAI_API_KEY || '',
        proxyUrl: resolveOpenAIProxyUrl(current.proxyUrl)
      }
    },
    onChanged: () => {
      // Only push live updates while the window is actually open; on show the
      // renderer reloads the full list anyway.
      const pasteWindow = getPasteWindow()
      if (pasteWindow && !pasteWindow.isDestroyed() && pasteWindow.isVisible()) {
        pasteWindow.webContents.send('paste:changed')
      }
    }
  })
  setPasteManager(manager)
  void manager.init()
  registerPasteProtocol()

  // Covenant Code: owns the OpenCode runtime. Starts lazily on first use unless
  // autoStart is enabled in settings.
  const codeService = new CodeService()
  setCodeService(codeService)
  codeService.init()
  if (config.code.autoStart) {
    void codeService.isConnectedOrConnect()
  }

  registerShortcuts(config)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      createTray()
    }
  })
})

app.on('window-all-closed', () => {
  // Don't quit the app when windows are closed - keep it running in tray
  // Only quit when user explicitly clicks "Quit" in tray menu
  if (process.platform === 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()

  void getPasteManager()?.dispose()
  setPasteManager(null)

  void getCodeService()?.dispose()
  setCodeService(null)

  terminalManager.disposeAll()

  // Cleanup tray
  destroyTray()
})
