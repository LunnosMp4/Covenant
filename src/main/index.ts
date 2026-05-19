import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  screen,
  shell,
  Tray,
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
import { terminalManager, type TerminalExitPayload } from './terminalManager'
import { getTerminalFonts } from './fontManager'

// Expose V8's garbage collector so we can force a collection on window hide.
// Must be set before app.whenReady() — top-level module scope satisfies this.
app.commandLine.appendSwitch('js-flags', '--expose_gc')

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
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
  launchOnStartup: boolean
  terminalFont: string
}

interface Preprompt {
  id: string
  title: string
  content: string
}

type ChatRole = 'system' | 'user' | 'assistant'

interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
}

interface ChatConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  systemPrompt?: string
}

type WorkflowLanguage = 'powershell' | 'cmd' | 'python' | 'nodejs' | 'shell' | 'custom'

interface Workflow {
  id: string
  title: string
  language: WorkflowLanguage
  customCommand?: string
  content: string
}

interface LauncherAppTarget {
  path: string
  arguments: string
}

interface LauncherApp {
  id: string
  title: string
  iconBase64: string
  targets: LauncherAppTarget[]
  path?: string
  arguments?: string
}

interface AppStoreSchema {
  preprompts: Preprompt[]
  apps: LauncherApp[]
  workflows: Workflow[]
  conversations: ChatConversation[]
}

const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  themeGradient: 'from-neutral-900/95 to-[#1c0f03]',
  proxyUrl: '',
  launchOnStartup: true,
  terminalFont: 'Cascadia Mono, Consolas, "Courier New", monospace'
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
const terminalSubscribers = new Set<WebContents>()
const MAX_CONVERSATIONS = 20
const CHAT_ROLE_SET = new Set<ChatRole>(['system', 'user', 'assistant'])

const MAX_TERMINAL_INPUT_CHUNK = 8192
const DEFAULT_TERMINAL_COLS = 120
const DEFAULT_TERMINAL_ROWS = 30
const MIN_TERMINAL_COLS = 20
const MAX_TERMINAL_COLS = 400
const MIN_TERMINAL_ROWS = 5
const MAX_TERMINAL_ROWS = 200

function sanitizeTerminalDimension(
  rawValue: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return fallback
  }

  const integerValue = Math.floor(rawValue)
  return Math.min(max, Math.max(min, integerValue))
}

function sanitizeTerminalInput(rawInput: unknown): string {
  if (typeof rawInput !== 'string' || !rawInput) {
    return ''
  }

  if (rawInput.length <= MAX_TERMINAL_INPUT_CHUNK) {
    return rawInput
  }

  return rawInput.slice(0, MAX_TERMINAL_INPUT_CHUNK)
}

function attachTerminalSubscriber(sender: WebContents): void {
  if (sender.isDestroyed() || terminalSubscribers.has(sender)) {
    return
  }

  terminalSubscribers.add(sender)

  sender.once('destroyed', () => {
    terminalSubscribers.delete(sender)
  })
}

function assertMainWindowSender(sender: WebContents): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    throw new Error('Main window is unavailable.')
  }

  if (sender.id !== mainWindow.webContents.id) {
    throw new Error('Terminal access is restricted to the main command window.')
  }
}

function emitTerminalEvent(channel: 'terminal:data' | 'terminal:exit', payload: unknown): void {
  terminalSubscribers.forEach((subscriber) => {
    if (subscriber.isDestroyed()) {
      terminalSubscribers.delete(subscriber)
      return
    }

    subscriber.send(channel, payload)
  })
}

terminalManager.onData((chunk) => {
  emitTerminalEvent('terminal:data', chunk)
})

terminalManager.onExit((payload: TerminalExitPayload) => {
  emitTerminalEvent('terminal:exit', payload)
})

const StoreClass =
  (ElectronStore as typeof ElectronStore & { default?: typeof ElectronStore }).default ??
  ElectronStore

const appStore = new StoreClass<AppStoreSchema>({
  name: 'preprompts',
  defaults: {
    preprompts: [],
    apps: [],
    workflows: [],
    conversations: []
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
    },
    conversations: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          createdAt: { type: 'number' },
          updatedAt: { type: 'number' },
          systemPrompt: { type: 'string' },
          messages: {
            type: 'array',
            default: [],
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                role: { type: 'string', enum: ['system', 'user', 'assistant'] },
                content: { type: 'string' },
                createdAt: { type: 'number' }
              },
              required: ['id', 'role', 'content', 'createdAt']
            }
          }
        },
        required: ['id', 'title', 'createdAt', 'updatedAt', 'messages']
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

function normalizeChatMessage(payload: Partial<ChatMessage>): ChatMessage | null {
  const role = typeof payload.role === 'string' ? payload.role.trim() : ''
  if (!CHAT_ROLE_SET.has(role as ChatRole)) return null

  const content = typeof payload.content === 'string' ? payload.content.trim() : ''
  if (!content) return null

  const createdAt =
    typeof payload.createdAt === 'number' && Number.isFinite(payload.createdAt)
      ? payload.createdAt
      : Date.now()

  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID()

  return {
    id,
    role: role as ChatRole,
    content,
    createdAt
  }
}

function normalizeConversation(payload: Partial<ChatConversation>): ChatConversation {
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID()
  const title = typeof payload.title === 'string' ? payload.title.trim() : ''
  const normalizedTitle = title || 'New chat'
  const createdAt =
    typeof payload.createdAt === 'number' && Number.isFinite(payload.createdAt)
      ? payload.createdAt
      : Date.now()
  const updatedAt =
    typeof payload.updatedAt === 'number' && Number.isFinite(payload.updatedAt)
      ? payload.updatedAt
      : createdAt
  const systemPrompt =
    typeof payload.systemPrompt === 'string' && payload.systemPrompt.trim()
      ? payload.systemPrompt.trim()
      : undefined

  const rawMessages = Array.isArray(payload.messages) ? payload.messages : []
  const normalizedMessages = rawMessages
    .map((message) => normalizeChatMessage(message))
    .filter((message): message is ChatMessage => Boolean(message))

  return {
    id,
    title: normalizedTitle,
    createdAt,
    updatedAt,
    messages: normalizedMessages,
    systemPrompt
  }
}

function getConversations(): ChatConversation[] {
  const conversations = appStore.get('conversations', [])
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
}

function getConversationById(conversationId: string): ChatConversation | null {
  const normalizedId = typeof conversationId === 'string' ? conversationId.trim() : ''
  if (!normalizedId) return null
  return getConversations().find((conversation) => conversation.id === normalizedId) ?? null
}

function saveConversation(payload: Partial<ChatConversation>): ChatConversation[] {
  const normalizedConversation = normalizeConversation(payload)
  const existing = getConversations().filter((conversation) => conversation.id !== normalizedConversation.id)
  const nextConversations = [normalizedConversation, ...existing]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS)

  appStore.set('conversations', nextConversations)
  return nextConversations
}

function normalizeLauncherTargets(payload: Partial<LauncherApp>): LauncherAppTarget[] {
  const rawTargets = Array.isArray(payload.targets) ? payload.targets : []
  const sanitizedTargets = rawTargets
    .map((target) => {
      const path = typeof target.path === 'string' ? target.path.trim() : ''
      if (!path) return null
      const argumentsValue =
        typeof target.arguments === 'string' ? target.arguments.trim() : ''
      return { path, arguments: argumentsValue }
    })
    .filter((target): target is LauncherAppTarget => Boolean(target))

  if (sanitizedTargets.length > 0) {
    return sanitizedTargets
  }

  const legacyPath = typeof payload.path === 'string' ? payload.path.trim() : ''
  if (!legacyPath) {
    return []
  }

  const legacyArguments =
    typeof payload.arguments === 'string' ? payload.arguments.trim() : ''
  return [{ path: legacyPath, arguments: legacyArguments }]
}

function normalizeStoredApps(apps: LauncherApp[]): LauncherApp[] {
  let didChange = false
  const normalized = apps.map((app) => {
    const targets = normalizeLauncherTargets(app)
    const normalizedTitle = typeof app.title === 'string' ? app.title.trim() : ''
    const primaryTarget = targets[0]
    const normalizedPath = primaryTarget?.path ?? (typeof app.path === 'string' ? app.path.trim() : '')
    const normalizedArguments =
      primaryTarget?.arguments ?? (typeof app.arguments === 'string' ? app.arguments.trim() : '')
    const iconBase64 = typeof app.iconBase64 === 'string' ? app.iconBase64 : ''
    const targetsChanged =
      !Array.isArray(app.targets) ||
      app.targets.length !== targets.length ||
      app.targets.some((target, index) => {
        const targetPath = typeof target.path === 'string' ? target.path.trim() : ''
        const targetArguments =
          typeof target.arguments === 'string' ? target.arguments.trim() : ''
        return (
          targetPath !== targets[index]?.path ||
          targetArguments !== targets[index]?.arguments
        )
      })

    if (
      app.title !== normalizedTitle ||
      targetsChanged ||
      app.path !== normalizedPath ||
      app.arguments !== normalizedArguments ||
      app.iconBase64 !== iconBase64
    ) {
      didChange = true
    }

    return {
      ...app,
      title: normalizedTitle,
      targets,
      path: normalizedPath,
      arguments: normalizedArguments,
      iconBase64
    }
  })

  if (didChange) {
    appStore.set('apps', normalized)
  }

  return normalized
}

function getApps(): LauncherApp[] {
  const apps = appStore.get('apps', [])
  return normalizeStoredApps(apps)
}

function saveApp(payload: Partial<LauncherApp>): LauncherApp[] {
  const normalizedTitle = typeof payload.title === 'string' ? payload.title.trim() : ''
  const normalizedTargets = normalizeLauncherTargets(payload)

  if (!normalizedTitle || normalizedTargets.length === 0) {
    throw new Error('Application title and at least one app path are required.')
  }

  const primaryTarget = normalizedTargets[0]
  const normalizedPath = primaryTarget.path
  const normalizedArguments = primaryTarget.arguments
  const normalizedIconBase64 = typeof payload.iconBase64 === 'string' ? payload.iconBase64 : ''

  const apps = getApps()
  const existingId = typeof payload.id === 'string' ? payload.id.trim() : ''

  if (existingId && apps.some((item) => item.id === existingId)) {
    const updated = apps.map((item) =>
      item.id === existingId
        ? {
            ...item,
            title: normalizedTitle,
            targets: normalizedTargets,
            path: normalizedPath,
            iconBase64: normalizedIconBase64,
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
    targets: normalizedTargets,
    path: normalizedPath,
    iconBase64: normalizedIconBase64,
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
    `covenant-workflow-${Date.now()}-${randomUUID()}${runtime.extension}`
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
  const cursorPoint = screen.getCursorScreenPoint()
  const primaryDisplay = screen.getDisplayNearestPoint(cursorPoint)
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

function extractTerminalFontFamily(fontFamily: string): string {
  const primaryFont = fontFamily.trim().split(',')[0] ?? ''
  return primaryFont.replace(/^['\"]|['\"]$/g, '').trim()
}

function normalizeTerminalFont(rawFont: unknown): string {
  if (typeof rawFont !== 'string') {
    return DEFAULT_CONFIG.terminalFont
  }

  const normalizedFont = extractTerminalFontFamily(rawFont)
  if (!normalizedFont) {
    return DEFAULT_CONFIG.terminalFont
  }

  const terminalFonts = new Set(getTerminalFonts().map((font) => font.toLowerCase()))
  return terminalFonts.has(normalizedFont.toLowerCase()) ? normalizedFont : DEFAULT_CONFIG.terminalFont
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
        : DEFAULT_CONFIG.proxyUrl,
    launchOnStartup:
      typeof rawConfig?.launchOnStartup === 'boolean'
        ? rawConfig.launchOnStartup
        : DEFAULT_CONFIG.launchOnStartup,
    terminalFont: normalizeTerminalFont(rawConfig?.terminalFont)
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
      nodeIntegration: false,
      // Throttle timers/animations in the background to save CPU.
      backgroundThrottling: true
    }
  })

  // macOS vibrancy effect
  if (isMac) {
    mainWindow.setVibrancy('fullscreen-ui')
  }

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
    title: 'Covenant Settings',
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

  // Give the exit animation time to play before hiding, then enter sleep mode.
  setTimeout(() => {
    if (!isVisible && mainWindow) {
      mainWindow.hide()
      scheduleSleepModeCleanup(mainWindow)
    }
  }, 250)
}

/**
 * "Sleep mode" — run after the window is hidden.
 * Releases the renderer's navigation history and disk/memory cache, then
 * triggers a V8 GC cycle (when available) to return unused heap to the OS.
 */
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

function toggleWindow(): void {
  if (isVisible) {
    hideWindow()
  } else {
    showWindow()
  }
}

function createTray(): void {
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
    
    // Set tooltip
    tray.setToolTip('Covenant - Alt+Space')

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
    if (mainWindow) {
      showWindow()
    }
  })

  const config = readConfig()
  
  // Apply login item settings from config
  if (isWindows || process.platform === 'darwin') {
    try {
      app.setLoginItemSettings({
        openAtLogin: config.launchOnStartup,
        openAsHidden: true
      })
    } catch (error) {
      console.error('Failed to set login item settings on app ready:', error)
    }
  }
  
  createWindow()
  createTray()

  globalShortcut.register('Alt+Space', toggleWindow)

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

  terminalManager.dispose()
  
  // Cleanup tray
  if (tray) {
    tray.destroy()
    tray = null
  }
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

ipcMain.handle('get-conversations', () => {
  return getConversations()
})

ipcMain.handle('get-conversation', (_event, conversationId: string) => {
  return getConversationById(conversationId)
})

ipcMain.handle('save-conversation', (_event, payload: Partial<ChatConversation>) => {
  return saveConversation(payload)
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

ipcMain.handle('terminal:start', (event, payload?: { cols?: unknown; rows?: unknown }) => {
  assertMainWindowSender(event.sender)

  const cols = sanitizeTerminalDimension(
    payload?.cols,
    DEFAULT_TERMINAL_COLS,
    MIN_TERMINAL_COLS,
    MAX_TERMINAL_COLS
  )
  const rows = sanitizeTerminalDimension(
    payload?.rows,
    DEFAULT_TERMINAL_ROWS,
    MIN_TERMINAL_ROWS,
    MAX_TERMINAL_ROWS
  )

  attachTerminalSubscriber(event.sender)

  return terminalManager.start(cols, rows)
})

ipcMain.handle('terminal:input', (event, rawInput: unknown) => {
  assertMainWindowSender(event.sender)

  const input = sanitizeTerminalInput(rawInput)
  if (!input) {
    return { success: false }
  }

  terminalManager.write(input)
  return { success: true }
})

ipcMain.handle('terminal:resize', (event, payload?: { cols?: unknown; rows?: unknown }) => {
  assertMainWindowSender(event.sender)

  const cols = sanitizeTerminalDimension(
    payload?.cols,
    DEFAULT_TERMINAL_COLS,
    MIN_TERMINAL_COLS,
    MAX_TERMINAL_COLS
  )
  const rows = sanitizeTerminalDimension(
    payload?.rows,
    DEFAULT_TERMINAL_ROWS,
    MIN_TERMINAL_ROWS,
    MAX_TERMINAL_ROWS
  )

  terminalManager.resize(cols, rows)
  return { success: true }
})

ipcMain.handle('terminal:kill', (event) => {
  assertMainWindowSender(event.sender)

  terminalManager.kill()
  return { success: true }
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

ipcMain.on('update-terminal-font', (_event, terminalFont: string) => {
  const nextTerminalFont = normalizeTerminalFont(terminalFont)
  updateConfig({ terminalFont: nextTerminalFont })

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal-font-updated', nextTerminalFont)
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('terminal-font-updated', nextTerminalFont)
  }
})

ipcMain.handle('get-terminal-fonts', () => {
  try {
    return getTerminalFonts()
  } catch (error) {
    console.error('Failed to get terminal fonts:', error)
    return []
  }
})

ipcMain.on('update-startup-setting', (_event, launchOnStartup: boolean) => {
  const isEnabled = typeof launchOnStartup === 'boolean' ? launchOnStartup : DEFAULT_CONFIG.launchOnStartup
  updateConfig({ launchOnStartup: isEnabled })
  
  // Update Electron's launch on startup setting
  if (isWindows || process.platform === 'darwin') {
    try {
      app.setLoginItemSettings({
        openAtLogin: isEnabled,
        openAsHidden: true
      })
    } catch (error) {
      console.error('Failed to update login item settings:', error)
    }
  }
})

ipcMain.handle('covenant:chat', async (_event, rawMessages: Array<{ role?: string; content?: string }>) => {
  const sanitizedMessages = Array.isArray(rawMessages)
    ? rawMessages
        .map((message) => {
          const role = typeof message.role === 'string' ? message.role.trim() : ''
          if (!CHAT_ROLE_SET.has(role as ChatRole)) return null
          const content = typeof message.content === 'string' ? message.content.trim() : ''
          if (!content) return null
          return { role: role as ChatRole, content }
        })
        .filter((message): message is { role: ChatRole; content: string } => Boolean(message))
    : []

  if (sanitizedMessages.length === 0) {
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
          "You are Covenant, a helpful, concise AI assistant integrated into a user's operating system. Keep your answers brief and to the point."
      },
      ...sanitizedMessages
    ]
  })

  return completion.choices[0]?.message?.content?.trim() || 'No response from model.'
})
