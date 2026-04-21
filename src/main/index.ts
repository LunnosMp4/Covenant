import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
  shell,
  type WebContents
} from 'electron'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, promises as fsPromises, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
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

type WorkflowLanguage = 'powershell' | 'cmd' | 'python' | 'nodejs' | 'shell' | 'custom'

interface Workflow {
  id: string
  title: string
  language: WorkflowLanguage
  customCommand?: string
  content: string
}

interface LauncherApp {
  id: string
  title: string
  path: string
  iconBase64: string
  arguments: string
}

interface AppStoreSchema {
  preprompts: Preprompt[]
  apps: LauncherApp[]
  workflows: Workflow[]
}

const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  themeGradient: 'from-neutral-900/95 to-neutral-900/95',
  proxyUrl: ''
}

const WORKFLOW_LANGUAGE_SET = new Set<WorkflowLanguage>([
  'powershell',
  'cmd',
  'python',
  'nodejs',
  'shell',
  'custom'
])

const runningWorkflowIds = new Set<string>()

const StoreClass =
  (ElectronStore as typeof ElectronStore & { default?: typeof ElectronStore }).default ??
  ElectronStore

const appStore = new StoreClass<AppStoreSchema>({
  name: 'preprompts',
  defaults: {
    preprompts: [],
    apps: [],
    workflows: []
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
    },
    apps: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          path: { type: 'string' },
          iconBase64: { type: 'string' },
          arguments: { type: 'string' }
        },
        required: ['id', 'title', 'path', 'iconBase64', 'arguments']
      }
    },
    workflows: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          language: {
            type: 'string',
            enum: ['powershell', 'cmd', 'python', 'nodejs', 'shell', 'custom']
          },
          customCommand: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['id', 'title', 'language', 'content']
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

function getApps(): LauncherApp[] {
  return appStore.get('apps', [])
}

function saveApp(payload: Partial<LauncherApp>): LauncherApp[] {
  const normalizedTitle = typeof payload.title === 'string' ? payload.title.trim() : ''
  const normalizedPath = typeof payload.path === 'string' ? payload.path.trim() : ''
  const normalizedArguments = typeof payload.arguments === 'string' ? payload.arguments.trim() : ''

  if (!normalizedTitle || !normalizedPath) {
    throw new Error('Application title and path are required.')
  }

  const apps = getApps()
  const existingId = typeof payload.id === 'string' ? payload.id.trim() : ''

  if (existingId && apps.some((item) => item.id === existingId)) {
    const updated = apps.map((item) =>
      item.id === existingId
        ? {
            ...item,
            title: normalizedTitle,
            path: normalizedPath,
            iconBase64: '',
            arguments: normalizedArguments
          }
        : item
    )

    appStore.set('apps', updated)
    return updated
  }

  const created: LauncherApp = {
    id: existingId || randomUUID(),
    title: normalizedTitle,
    path: normalizedPath,
    iconBase64: '',
    arguments: normalizedArguments
  }

  const nextApps = [...apps, created]
  appStore.set('apps', nextApps)
  return nextApps
}

function deleteApp(id: string): LauncherApp[] {
  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId) {
    return getApps()
  }

  const nextApps = getApps().filter((item) => item.id !== normalizedId)
  appStore.set('apps', nextApps)
  return nextApps
}

function normalizeWorkflowLanguage(language: string | undefined): WorkflowLanguage {
  const normalizedLanguage = typeof language === 'string' ? language.trim().toLowerCase() : ''
  if (!WORKFLOW_LANGUAGE_SET.has(normalizedLanguage as WorkflowLanguage)) {
    throw new Error('Workflow language is invalid.')
  }

  return normalizedLanguage as WorkflowLanguage
}

function getWorkflows(): Workflow[] {
  return appStore.get('workflows', [])
}

function saveWorkflow(payload: Partial<Workflow>): Workflow[] {
  const normalizedTitle = typeof payload.title === 'string' ? payload.title.trim() : ''
  const normalizedContent = typeof payload.content === 'string' ? payload.content : ''
  const normalizedCustomCommand =
    typeof payload.customCommand === 'string' ? payload.customCommand.trim() : ''
  const normalizedLanguage = normalizeWorkflowLanguage(payload.language)

  if (!normalizedTitle) {
    throw new Error('Workflow title is required.')
  }

  if (!normalizedContent.trim()) {
    throw new Error('Workflow content is required.')
  }

  if (normalizedLanguage === 'custom' && !normalizedCustomCommand) {
    throw new Error('Custom command is required for custom workflows.')
  }

  const workflows = getWorkflows()
  const existingId = typeof payload.id === 'string' ? payload.id.trim() : ''

  if (existingId && workflows.some((item) => item.id === existingId)) {
    const updated = workflows.map((item) =>
      item.id === existingId
        ? {
            ...item,
            title: normalizedTitle,
            language: normalizedLanguage,
            customCommand: normalizedLanguage === 'custom' ? normalizedCustomCommand : '',
            content: normalizedContent
          }
        : item
    )

    appStore.set('workflows', updated)
    return updated
  }

  const created: Workflow = {
    id: existingId || randomUUID(),
    title: normalizedTitle,
    language: normalizedLanguage,
    customCommand: normalizedLanguage === 'custom' ? normalizedCustomCommand : '',
    content: normalizedContent
  }

  const nextWorkflows = [...workflows, created]
  appStore.set('workflows', nextWorkflows)
  return nextWorkflows
}

function deleteWorkflow(id: string): Workflow[] {
  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId) {
    return getWorkflows()
  }

  const nextWorkflows = getWorkflows().filter((item) => item.id !== normalizedId)
  appStore.set('workflows', nextWorkflows)
  return nextWorkflows
}

function parseLaunchArguments(rawArguments: string): string[] {
  if (!rawArguments.trim()) {
    return []
  }

  const args: string[] = []
  const tokenPattern = /"([^"]*)"|'([^']*)'|([^\s]+)/g
  let match: RegExpExecArray | null = tokenPattern.exec(rawArguments)

  while (match !== null) {
    args.push(match[1] ?? match[2] ?? match[3])
    match = tokenPattern.exec(rawArguments)
  }

  return args
}

function resolveWorkflowRuntime(workflow: Workflow): {
  extension: string
  command: string
  baseArgs: string[]
} {
  if (workflow.language === 'python') {
    return { extension: '.py', command: 'python', baseArgs: [] }
  }

  if (workflow.language === 'nodejs') {
    return { extension: '.js', command: 'node', baseArgs: [] }
  }

  if (workflow.language === 'powershell') {
    return {
      extension: '.ps1',
      command: isWindows ? 'powershell' : 'pwsh',
      baseArgs: isWindows ? ['-ExecutionPolicy', 'Bypass', '-File'] : ['-File']
    }
  }

  if (workflow.language === 'cmd') {
    if (!isWindows) {
      throw new Error('CMD workflows are supported only on Windows.')
    }

    return { extension: '.bat', command: 'cmd', baseArgs: ['/c'] }
  }

  if (workflow.language === 'shell') {
    return { extension: '.sh', command: isWindows ? 'bash' : 'sh', baseArgs: [] }
  }

  const customTokens = parseLaunchArguments(workflow.customCommand?.trim() || '')
  if (customTokens.length === 0) {
    throw new Error('Custom run command is required for custom workflows.')
  }

  const [command, ...baseArgs] = customTokens
  return {
    extension: '.tmp',
    command,
    baseArgs
  }
}

function emitWorkflowStatus(
  sender: WebContents,
  payload: { id: string; status: 'running' | 'success' | 'error' }
): void {
  if (sender.isDestroyed()) return
  sender.send('workflow-status-update', payload)
}

function emitWorkflowLog(
  sender: WebContents,
  payload: { id: string; type: 'info' | 'error'; text: string }
): void {
  if (sender.isDestroyed()) return
  sender.send('workflow-log', payload)
}

async function executeWorkflowScript(
  sender: WebContents,
  payload: Partial<Workflow>
): Promise<{ success: boolean; error?: string }> {
  const normalizedLanguage = normalizeWorkflowLanguage(payload.language)
  const normalizedContent = typeof payload.content === 'string' ? payload.content : ''
  const normalizedTitle = typeof payload.title === 'string' ? payload.title.trim() : 'Workflow'
  const normalizedCustomCommand =
    typeof payload.customCommand === 'string' ? payload.customCommand.trim() : ''
  const normalizedId = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID()

  if (!normalizedContent.trim()) {
    throw new Error('Workflow content is required.')
  }

  const normalizedWorkflow: Workflow = {
    id: normalizedId,
    title: normalizedTitle || 'Workflow',
    language: normalizedLanguage,
    customCommand: normalizedCustomCommand,
    content: normalizedContent
  }

  if (runningWorkflowIds.has(normalizedWorkflow.id)) {
    const message = 'Workflow is already running.'
    emitWorkflowLog(sender, {
      id: normalizedWorkflow.id,
      type: 'error',
      text: message
    })
    return {
      success: false,
      error: message
    }
  }

  const runtime = resolveWorkflowRuntime(normalizedWorkflow)
  const tempFilePath = join(
    tmpdir(),
    `prometheus-workflow-${Date.now()}-${randomUUID()}${runtime.extension}`
  )

  await fsPromises.writeFile(tempFilePath, normalizedWorkflow.content, { encoding: 'utf-8' })
  const executionArgs = [...runtime.baseArgs, tempFilePath]

  let childProcess

  try {
    childProcess = spawn(runtime.command, executionArgs, {
      windowsHide: true,
      shell: false
    })
  } catch (error) {
    await fsPromises.unlink(tempFilePath).catch(() => {
      // Ignore cleanup errors in temp directory.
    })
    throw error
  }

  runningWorkflowIds.add(normalizedWorkflow.id)
  emitWorkflowStatus(sender, {
    id: normalizedWorkflow.id,
    status: 'running'
  })

  emitWorkflowLog(sender, {
    id: normalizedWorkflow.id,
    type: 'info',
    text: `$ ${runtime.command} ${executionArgs.join(' ')}`
  })

  const cleanupTempFile = (): void => {
    void fsPromises.unlink(tempFilePath).catch(() => {
      // Ignore cleanup errors in temp directory.
    })
  }

  childProcess.stdout?.on('data', (data) => {
    const text = data.toString()
    if (!text) return

    emitWorkflowLog(sender, {
      id: normalizedWorkflow.id,
      type: 'info',
      text
    })
  })

  childProcess.stderr?.on('data', (data) => {
    const text = data.toString()
    if (!text) return

    emitWorkflowLog(sender, {
      id: normalizedWorkflow.id,
      type: 'error',
      text
    })
  })

  childProcess.once('error', (error) => {
    const message = error instanceof Error ? error.message : 'Unable to execute workflow.'
    runningWorkflowIds.delete(normalizedWorkflow.id)

    emitWorkflowLog(sender, {
      id: normalizedWorkflow.id,
      type: 'error',
      text: message
    })

    emitWorkflowStatus(sender, {
      id: normalizedWorkflow.id,
      status: 'error'
    })

    cleanupTempFile()
  })

  childProcess.once('close', (code) => {
    runningWorkflowIds.delete(normalizedWorkflow.id)

    if (code === 0) {
      emitWorkflowStatus(sender, {
        id: normalizedWorkflow.id,
        status: 'success'
      })

      emitWorkflowLog(sender, {
        id: normalizedWorkflow.id,
        type: 'info',
        text: 'Workflow completed successfully.'
      })
    } else {
      emitWorkflowLog(sender, {
        id: normalizedWorkflow.id,
        type: 'error',
        text: `Workflow exited with code ${code ?? -1}.`
      })

      emitWorkflowStatus(sender, {
        id: normalizedWorkflow.id,
        status: 'error'
      })
    }

    cleanupTempFile()
  })

  return { success: true }
}

function spawnDetached(command: string, args: string[], options?: { windowsHide?: boolean }): Promise<void> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: options?.windowsHide ?? true
    })

    childProcess.once('spawn', () => {
      childProcess.unref()
      resolve()
    })

    childProcess.once('error', (error) => {
      reject(error)
    })
  })
}

async function launchSavedApp(payload: { path?: string; arguments?: string }): Promise<void> {
  const normalizedPath = typeof payload.path === 'string' ? payload.path.trim() : ''
  const normalizedArguments = typeof payload.arguments === 'string' ? payload.arguments : ''

  if (!normalizedPath) {
    throw new Error('Application path is required.')
  }

  if (!existsSync(normalizedPath)) {
    throw new Error('The saved application path no longer exists.')
  }

  const parsedArguments = parseLaunchArguments(normalizedArguments)

  if (isMac && normalizedPath.toLowerCase().endsWith('.app')) {
    const openArguments = ['-a', normalizedPath]
    if (parsedArguments.length > 0) {
      openArguments.push('--args', ...parsedArguments)
    }

    await spawnDetached('open', openArguments, { windowsHide: false })
    return
  }

  await spawnDetached(normalizedPath, parsedArguments)
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

ipcMain.handle('get-apps', () => {
  return getApps()
})

ipcMain.handle('save-app', (_event, payload: Partial<LauncherApp>) => {
  return saveApp(payload)
})

ipcMain.handle('delete-app', (_event, appId: string) => {
  return deleteApp(appId)
})

ipcMain.handle('get-workflows', () => {
  return getWorkflows()
})

ipcMain.handle('save-workflow', (_event, payload: Partial<Workflow>) => {
  return saveWorkflow(payload)
})

ipcMain.handle('delete-workflow', (_event, workflowId: string) => {
  return deleteWorkflow(workflowId)
})

ipcMain.handle('execute-workflow', async (event, workflowPayload: Partial<Workflow>) => {
  try {
    return await executeWorkflowScript(event.sender, workflowPayload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to execute workflow.'
    const workflowId = typeof workflowPayload.id === 'string' ? workflowPayload.id.trim() : ''

    if (workflowId) {
      emitWorkflowLog(event.sender, {
        id: workflowId,
        type: 'error',
        text: message
      })

      emitWorkflowStatus(event.sender, {
        id: workflowId,
        status: 'error'
      })
    }

    return {
      success: false,
      error: message
    }
  }
})

ipcMain.handle('select-file', async () => {
  const fileFilters = isWindows
    ? [{ name: 'Applications', extensions: ['exe'] }]
    : isMac
      ? [{ name: 'Applications', extensions: ['app'] }]
      : [{ name: 'Applications', extensions: ['*'] }]

  const result = await dialog.showOpenDialog({
    title: 'Select an application',
    properties: ['openFile'],
    filters: fileFilters,
    ...(isMac ? { treatPackageAsDirectory: false } : {})
  })

  if (result.canceled || result.filePaths.length === 0) {
    return ''
  }

  return result.filePaths[0]
})

ipcMain.handle('get-file-icon', async (_event, filePath: string) => {
  const normalizedPath = typeof filePath === 'string' ? filePath.trim() : ''
  if (!normalizedPath) {
    throw new Error('File path is required.')
  }

  if (!existsSync(normalizedPath)) {
    throw new Error('The selected file no longer exists.')
  }

  const icon = await app.getFileIcon(normalizedPath, { size: 'normal' })
  return icon.isEmpty() ? '' : icon.toDataURL()
})

ipcMain.on('launch-app', (_event, payload: { path?: string; arguments?: string }) => {
  void launchSavedApp(payload).catch((error) => {
    console.error('Failed to launch app:', error)
  })
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
