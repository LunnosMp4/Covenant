import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  shell
} from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import ElectronStore from 'electron-store'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import { ProxyAgent } from 'undici'

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let isVisible = false

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

const WINDOW_WIDTH = 800
const WINDOW_HEIGHT = 420
const WINDOW_BOTTOM_MARGIN = 48
const SETTINGS_WINDOW_WIDTH = 1024
const SETTINGS_WINDOW_HEIGHT = 576

interface AppConfig {
  apiKey: string
  themeGradient: string
  proxyUrl: string
}

interface Preprompt {
  id: string
  title: string
  content: string
}

interface AppStoreSchema {
  preprompts: Preprompt[]
}

const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  themeGradient: 'from-neutral-900/95 to-neutral-900/95',
  proxyUrl: ''
}

const StoreClass =
  (ElectronStore as typeof ElectronStore & { default?: typeof ElectronStore }).default ??
  ElectronStore

const appStore = new StoreClass<AppStoreSchema>({
  name: 'preprompts',
  defaults: {
    preprompts: []
  },
  schema: {
    preprompts: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['id', 'title', 'content']
      }
    }
  }
})

function getPreprompts(): Preprompt[] {
  return appStore.get('preprompts', [])
}

function savePreprompt(payload: Partial<Preprompt>): Preprompt[] {
  const normalizedTitle = typeof payload.title === 'string' ? payload.title.trim() : ''
  const normalizedContent = typeof payload.content === 'string' ? payload.content.trim() : ''

  if (!normalizedTitle || !normalizedContent) {
    throw new Error('Preprompt title and content are required.')
  }

  const preprompts = getPreprompts()
  const existingId = typeof payload.id === 'string' ? payload.id.trim() : ''

  if (existingId) {
    const updated = preprompts.map((item) =>
      item.id === existingId ? { ...item, title: normalizedTitle, content: normalizedContent } : item
    )

    appStore.set('preprompts', updated)
    return updated
  }

  const created: Preprompt = {
    id: randomUUID(),
    title: normalizedTitle,
    content: normalizedContent
  }

  const nextPreprompts = [...preprompts, created]
  appStore.set('preprompts', nextPreprompts)
  return nextPreprompts
}

function deletePreprompt(id: string): Preprompt[] {
  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId) {
    return getPreprompts()
  }

  const nextPreprompts = getPreprompts().filter((item) => item.id !== normalizedId)
  appStore.set('preprompts', nextPreprompts)
  return nextPreprompts
}

dotenv.config({ path: join(process.cwd(), '.env') })

function resolveOpenAIProxyUrl(configProxyUrl?: string): string | undefined {
  const proxyCandidates = [
    configProxyUrl,
    process.env.OPENAI_PROXY_URL,
    process.env.HTTPS_PROXY,
    process.env.HTTP_PROXY
  ]

  for (const candidate of proxyCandidates) {
    const trimmedCandidate = candidate?.trim()
    if (trimmedCandidate) {
      return trimmedCandidate
    }
  }

  return undefined
}

function getWindowPosition(): { x: number; y: number } {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { x: workAreaX, y: workAreaY, width: workAreaWidth, height: workAreaHeight } =
    primaryDisplay.workArea

  return {
    x: Math.round(workAreaX + (workAreaWidth - WINDOW_WIDTH) / 2),
    y: Math.round(workAreaY + workAreaHeight - WINDOW_HEIGHT - WINDOW_BOTTOM_MARGIN)
  }
}

function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function normalizeConfig(rawConfig: Partial<AppConfig> | null | undefined): AppConfig {
  return {
    apiKey: typeof rawConfig?.apiKey === 'string' ? rawConfig.apiKey : DEFAULT_CONFIG.apiKey,
    themeGradient:
      typeof rawConfig?.themeGradient === 'string' && rawConfig.themeGradient.trim()
        ? rawConfig.themeGradient
        : DEFAULT_CONFIG.themeGradient,
    proxyUrl:
      typeof rawConfig?.proxyUrl === 'string' && rawConfig.proxyUrl.trim()
        ? rawConfig.proxyUrl.trim()
        : DEFAULT_CONFIG.proxyUrl
  }
}

function writeConfig(config: AppConfig): void {
  const configPath = getConfigPath()
  const userDataDirectory = app.getPath('userData')

  if (!existsSync(userDataDirectory)) {
    mkdirSync(userDataDirectory, { recursive: true })
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf-8' })
}

function readConfig(): AppConfig {
  const configPath = getConfigPath()

  try {
    if (!existsSync(configPath)) {
      writeConfig(DEFAULT_CONFIG)
      return DEFAULT_CONFIG
    }

    const rawFile = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(rawFile) as Partial<AppConfig>
    const normalized = normalizeConfig(parsed)

    // Keep file schema aligned when new defaults are introduced.
    writeConfig(normalized)
    return normalized
  } catch {
    writeConfig(DEFAULT_CONFIG)
    return DEFAULT_CONFIG
  }
}

function updateConfig(configPatch: Partial<AppConfig>): AppConfig {
  const current = readConfig()
  const merged = normalizeConfig({ ...current, ...configPatch })
  writeConfig(merged)
  return merged
}

function loadRendererWindow(targetWindow: BrowserWindow, route?: 'settings'): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    const targetUrl = route === 'settings' ? `${rendererUrl}#/settings` : rendererUrl
    targetWindow.loadURL(targetUrl)
    return
  }

  const rendererEntryFile = join(__dirname, '../renderer/index.html')
  if (route === 'settings') {
    targetWindow.loadFile(rendererEntryFile, { hash: 'settings' })
    return
  }

  targetWindow.loadFile(rendererEntryFile)
}

function createWindow(): void {
  const { x, y } = getWindowPosition()

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
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
    titleBarStyle: isMac ? 'hidden' : undefined,
    thickFrame: isWindows ? false : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // macOS vibrancy effect
  if (isMac) {
    mainWindow.setVibrancy('fullscreen-ui')
  }

  // Keep the full window transparent. Renderer-level styling handles the frosted bar.
  if (isWindows) {
    try {
      mainWindow.setBackgroundMaterial('acrylic')
    } catch {
      // Older Electron/Windows versions can ignore this safely.
    }

    // Re-apply transparent paint color at runtime for Windows compositors.
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
    if (isVisible) {
      hideWindow()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRendererWindow(mainWindow)
}

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: SETTINGS_WINDOW_WIDTH,
    height: SETTINGS_WINDOW_HEIGHT,
    minWidth: 800,
    minHeight: 450,
    title: 'Prometheus Settings',
    show: false,
    frame: false,
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

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  settingsWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRendererWindow(settingsWindow, 'settings')
}

function showWindow(): void {
  if (!mainWindow) return

  const { x, y } = getWindowPosition()
  mainWindow.setPosition(x, y, false)

  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send('toggle-visibility', true)
  isVisible = true
}

function hideWindow(): void {
  if (!mainWindow) return
  mainWindow.webContents.send('toggle-visibility', false)
  isVisible = false

  // Give the exit animation time to play before hiding
  setTimeout(() => {
    if (!isVisible && mainWindow) {
      mainWindow.hide()
    }
  }, 250)
}

function toggleWindow(): void {
  if (isVisible) {
    hideWindow()
  } else {
    showWindow()
  }
}

app.whenReady().then(() => {
  readConfig()
  createWindow()

  globalShortcut.register('Alt+Space', toggleWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// IPC: renderer can request hide (after close animation)
ipcMain.on('hide-window', () => {
  isVisible = false
  if (mainWindow) {
    mainWindow.hide()
  }
})

ipcMain.on('open-settings', () => {
  createSettingsWindow()
})

ipcMain.on('close-settings', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close()
  }
})

ipcMain.on('minimize-settings', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.minimize()
  }
})

ipcMain.handle('get-config', () => {
  return readConfig()
})

ipcMain.handle('get-preprompts', () => {
  return getPreprompts()
})

ipcMain.handle('save-preprompt', (_event, payload: Partial<Preprompt>) => {
  return savePreprompt(payload)
})

ipcMain.handle('delete-preprompt', (_event, prepromptId: string) => {
  return deletePreprompt(prepromptId)
})

ipcMain.on('save-api-key', (_event, key: string) => {
  const apiKey = typeof key === 'string' ? key.trim() : ''
  updateConfig({ apiKey })
})

ipcMain.on('save-openai-settings', (_event, payload: { apiKey?: string; proxyUrl?: string }) => {
  const apiKey = typeof payload?.apiKey === 'string' ? payload.apiKey.trim() : ''
  const proxyUrl = typeof payload?.proxyUrl === 'string' ? payload.proxyUrl.trim() : ''
  updateConfig({ apiKey, proxyUrl })
})

ipcMain.on('update-theme', (_event, gradientClass: string) => {
  const nextTheme =
    typeof gradientClass === 'string' && gradientClass.trim()
      ? gradientClass.trim()
      : DEFAULT_CONFIG.themeGradient

  updateConfig({ themeGradient: nextTheme })

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme-updated', nextTheme)
  }
})

ipcMain.handle('prometheus:chat', async (_event, userPrompt: string) => {
  const prompt = userPrompt?.trim()
  if (!prompt) {
    throw new Error('Prompt cannot be empty.')
  }

  const storedConfig = readConfig()
  const apiKey = storedConfig.apiKey || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OpenAI API key is missing. Add it in Settings > General or set OPENAI_API_KEY.')
  }

  const proxyUrl = resolveOpenAIProxyUrl(storedConfig.proxyUrl)
  const openAIProxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined

  const client = new OpenAI({
    apiKey,
    fetchOptions: openAIProxyAgent
      ? {
          dispatcher: openAIProxyAgent
        }
      : undefined
  })
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          "You are Prometheus, a helpful, concise AI assistant integrated into a user's operating system. Keep your answers brief and to the point."
      },
      { role: 'user', content: prompt }
    ]
  })

  return completion.choices[0]?.message?.content?.trim() || 'No response from model.'
})
