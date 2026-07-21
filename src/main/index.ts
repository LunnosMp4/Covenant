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
import type { AppConfig } from '../shared/config'
import {
  DEFAULT_BUTTON_VISIBILITY,
  DEFAULT_CHAT_MODEL,
  DEFAULT_REASONING_EFFORT,
  modelSupportsExtendedParams
} from '../shared/config'
import type { McpAuth, McpHeader, McpServer, McpTool } from '../shared/mcp'

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
const WINDOW_HEIGHT = 520
const WINDOW_BOTTOM_MARGIN = 48
const SETTINGS_WINDOW_WIDTH = 1024
const SETTINGS_WINDOW_HEIGHT = 576

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
  reasoning?: string
  usage?: ChatUsage
  model?: string
}

interface ChatUsage {
  promptTokens?: number
  cachedPromptTokens?: number
  completionTokens?: number
  totalTokens?: number
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
  terminalFont: 'Cascadia Mono, Consolas, "Courier New", monospace',
  preferredShell: undefined,
  mcpServers: [],
  buttonVisibility: { ...DEFAULT_BUTTON_VISIBILITY },
  chatModel: DEFAULT_CHAT_MODEL,
  reasoningEffort: DEFAULT_REASONING_EFFORT
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
const mcpSessionIds = new Map<string, string>()
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
          arguments: { type: 'string' },
          targets: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                arguments: { type: 'string' }
              },
              required: ['path', 'arguments']
            }
          }
        },
        required: ['id', 'title', 'path', 'iconBase64', 'arguments', 'targets']
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
                createdAt: { type: 'number' },
                reasoning: { type: 'string' },
                model: { type: 'string' },
                usage: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    promptTokens: { type: 'number' },
                    completionTokens: { type: 'number' },
                    totalTokens: { type: 'number' }
                  }
                }
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

function normalizeChatUsage(payload: unknown): ChatUsage | undefined {
  if (!payload || typeof payload !== 'object') return undefined

  const raw = payload as Partial<ChatUsage>
  const promptTokens =
    typeof raw.promptTokens === 'number' && Number.isFinite(raw.promptTokens)
      ? raw.promptTokens
      : undefined
  const completionTokens =
    typeof raw.completionTokens === 'number' && Number.isFinite(raw.completionTokens)
      ? raw.completionTokens
      : undefined
  const totalTokens =
    typeof raw.totalTokens === 'number' && Number.isFinite(raw.totalTokens)
      ? raw.totalTokens
      : undefined

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens
  }
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

  const reasoning =
    typeof payload.reasoning === 'string' && payload.reasoning.trim() ? payload.reasoning.trim() : undefined
  const usage = normalizeChatUsage(payload.usage)
  const model = typeof payload.model === 'string' && payload.model.trim() ? payload.model.trim() : undefined

  return {
    id,
    role: role as ChatRole,
    content,
    createdAt,
    reasoning,
    usage,
    model
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

function normalizeButtonVisibility(raw: unknown): AppConfig['buttonVisibility'] {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_BUTTON_VISIBILITY }
  }

  const obj = raw as Record<string, unknown>
  return {
    appLauncher: typeof obj.appLauncher === 'boolean' ? obj.appLauncher : DEFAULT_BUTTON_VISIBILITY.appLauncher,
    workflow: typeof obj.workflow === 'boolean' ? obj.workflow : DEFAULT_BUTTON_VISIBILITY.workflow
  }
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
    terminalFont: normalizeTerminalFont(rawConfig?.terminalFont),
    preferredShell:
      typeof rawConfig?.preferredShell === 'string' && rawConfig.preferredShell.trim()
        ? rawConfig.preferredShell.trim()
        : DEFAULT_CONFIG.preferredShell,
    mcpServers: normalizeStoredMcpServers(rawConfig?.mcpServers),
    buttonVisibility: normalizeButtonVisibility(rawConfig?.buttonVisibility),
    chatModel:
      typeof rawConfig?.chatModel === 'string' && rawConfig.chatModel.trim()
        ? rawConfig.chatModel.trim()
        : DEFAULT_CHAT_MODEL,
    reasoningEffort:
      typeof rawConfig?.reasoningEffort === 'string' && ['low', 'medium', 'high'].includes(rawConfig.reasoningEffort)
        ? rawConfig.reasoningEffort as AppConfig['reasoningEffort']
        : DEFAULT_REASONING_EFFORT
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

function normalizeMcpHeaders(rawHeaders: unknown): McpHeader[] {
  if (!Array.isArray(rawHeaders)) {
    return []
  }

  return rawHeaders
    .map((header) => {
      const name = typeof header?.name === 'string' ? header.name.trim() : ''
      const value = typeof header?.value === 'string' ? header.value.trim() : ''
      if (!name) return null
      return { name, value }
    })
    .filter((header): header is McpHeader => Boolean(header))
}

function normalizeMcpAuth(rawAuth: unknown): McpAuth {
  if (!rawAuth || typeof rawAuth !== 'object') {
    return { type: 'none' }
  }

  const authType = typeof (rawAuth as { type?: unknown }).type === 'string'
    ? (rawAuth as { type?: string }).type
    : 'none'

  if (authType === 'accessToken') {
    const token = typeof (rawAuth as { token?: unknown }).token === 'string'
      ? (rawAuth as { token?: string }).token.trim()
      : ''
    return { type: 'accessToken', token }
  }

  if (authType === 'customHeaders') {
    return { type: 'customHeaders', headers: normalizeMcpHeaders((rawAuth as { headers?: unknown }).headers) }
  }

  return { type: 'none' }
}

function normalizeMcpTools(rawTools: unknown): McpTool[] {
  if (!Array.isArray(rawTools)) {
    return []
  }

  return rawTools
    .map((tool) => {
      const name = typeof tool?.name === 'string' ? tool.name.trim() : ''
      if (!name) return null
      const description = typeof tool?.description === 'string' ? tool.description.trim() : ''
      const inputSchema =
        tool && typeof tool === 'object' && tool.inputSchema && typeof tool.inputSchema === 'object'
          ? (tool.inputSchema as Record<string, unknown>)
          : undefined
      const enabled = typeof tool?.enabled === 'boolean' ? tool.enabled : true

      return {
        name,
        description,
        inputSchema,
        enabled
      }
    })
    .filter((tool): tool is McpTool => Boolean(tool))
}

function normalizeStoredMcpServer(rawServer: Partial<McpServer> | null | undefined): McpServer | null {
  if (!rawServer || typeof rawServer !== 'object') {
    return null
  }

  const name = typeof rawServer.name === 'string' ? rawServer.name.trim() : ''
  const url = typeof rawServer.url === 'string' ? rawServer.url.trim() : ''

  if (!name || !url) {
    return null
  }

  const id = typeof rawServer.id === 'string' && rawServer.id.trim() ? rawServer.id.trim() : randomUUID()
  const description = typeof rawServer.description === 'string' ? rawServer.description.trim() : ''
  const active = typeof rawServer.active === 'boolean' ? rawServer.active : false

  return {
    id,
    name,
    url,
    description,
    active,
    auth: normalizeMcpAuth(rawServer.auth),
    tools: normalizeMcpTools(rawServer.tools),
    lastSyncedAt:
      typeof rawServer.lastSyncedAt === 'number' && Number.isFinite(rawServer.lastSyncedAt)
        ? rawServer.lastSyncedAt
        : undefined,
    lastError:
      typeof rawServer.lastError === 'string' && rawServer.lastError.trim()
        ? rawServer.lastError.trim()
        : undefined
  }
}

function normalizeStoredMcpServers(rawServers: unknown): McpServer[] {
  if (!Array.isArray(rawServers)) {
    return []
  }

  return rawServers
    .map((server) => normalizeStoredMcpServer(server))
    .filter((server): server is McpServer => Boolean(server))
}

function getMcpServers(): McpServer[] {
  return readConfig().mcpServers
}

function saveMcpServer(payload: Partial<McpServer>): McpServer[] {
  const currentServers = getMcpServers()
  const existingId = typeof payload.id === 'string' ? payload.id.trim() : ''
  const existingServer = existingId ? currentServers.find((item) => item.id === existingId) : undefined
  const normalizedServer = normalizeStoredMcpServer(
    existingServer ? { ...existingServer, ...payload, id: existingServer.id } : payload
  )

  if (!normalizedServer) {
    throw new Error('MCP server name and URL are required.')
  }

  const nextServers = existingId && currentServers.some((item) => item.id === existingId)
    ? currentServers.map((item) =>
        item.id === existingId ? { ...item, ...normalizedServer, id: existingId } : item
      )
    : [...currentServers, { ...normalizedServer, id: existingId || normalizedServer.id }]

  updateConfig({ mcpServers: nextServers })
  return nextServers
}

function deleteMcpServer(id: string): McpServer[] {
  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId) {
    return getMcpServers()
  }

  mcpSessionIds.delete(normalizedId)
  const nextServers = getMcpServers().filter((item) => item.id !== normalizedId)
  updateConfig({ mcpServers: nextServers })
  return nextServers
}

function resolveMcpEndpointUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl)
  if (parsed.pathname.endsWith('/mcp')) {
    return parsed.toString()
  }

  parsed.pathname = parsed.pathname.endsWith('/') ? `${parsed.pathname}mcp` : `${parsed.pathname}/mcp`
  return parsed.toString()
}

function buildMcpHeaders(server: McpServer): Headers {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json, text/event-stream')

  if (server.auth.type === 'accessToken' && server.auth.token.trim()) {
    headers.set('Authorization', `Bearer ${server.auth.token.trim()}`)
  }

  if (server.auth.type === 'customHeaders') {
    server.auth.headers.forEach((header) => {
      if (header.name.trim()) {
        headers.set(header.name.trim(), header.value.trim())
      }
    })
  }

  const sessionId = mcpSessionIds.get(server.id)
  if (sessionId) {
    headers.set('mcp-session-id', sessionId)
  }

  return headers
}

function extractMcpJsonResponse(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as unknown
  }

  const dataMatches = [...trimmed.matchAll(/^data:\s*(.+)$/gm)]
  if (dataMatches.length > 0) {
    const lastData = dataMatches[dataMatches.length - 1]?.[1]
    if (lastData) {
      return JSON.parse(lastData) as unknown
    }
  }

  throw new Error('Unable to parse MCP response.')
}

async function sendMcpRequest(
  server: McpServer,
  method: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(resolveMcpEndpointUrl(server.url), {
    method: 'POST',
    headers: buildMcpHeaders(server),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: randomUUID(),
      method,
      params
    })
  })

  const sessionId = response.headers.get('mcp-session-id')
  if (sessionId) {
    mcpSessionIds.set(server.id, sessionId)
  }

  const responseText = await response.text()
  if (!response.ok) {
    throw new Error(responseText.trim() || `MCP request failed with status ${response.status}.`)
  }

  return extractMcpJsonResponse(responseText)
}

async function initializeMcpServer(server: McpServer): Promise<void> {
  await sendMcpRequest(server, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'Covenant',
      version: app.getVersion()
    }
  })

  try {
    await sendMcpRequest(server, 'notifications/initialized')
  } catch {
    // Optional notification.
  }
}

async function refreshMcpServerTools(server: McpServer): Promise<McpServer> {
  await initializeMcpServer(server)

  const response = (await sendMcpRequest(server, 'tools/list', {})) as
    | { result?: { tools?: unknown } }
    | { tools?: unknown }
  const rawTools = (response as { result?: { tools?: unknown } }).result?.tools ?? (response as { tools?: unknown }).tools
  const discoveredTools = Array.isArray(rawTools)
    ? rawTools
        .map((tool) => {
          const name = typeof tool?.name === 'string' ? tool.name.trim() : ''
          if (!name) return null

          return {
            name,
            description: typeof tool?.description === 'string' ? tool.description.trim() : '',
            inputSchema:
              tool && typeof tool === 'object' && tool.inputSchema && typeof tool.inputSchema === 'object'
                ? (tool.inputSchema as Record<string, unknown>)
                : undefined
          }
        })
        .filter(
          (tool): tool is { name: string; description: string; inputSchema?: Record<string, unknown> } =>
            Boolean(tool)
        )
    : []

  const existingToolsByName = new Map(server.tools.map((tool) => [tool.name, tool]))
  const hadPriorTools = server.tools.length > 0
  const normalizedTools = discoveredTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    enabled: existingToolsByName.get(tool.name)?.enabled ?? !hadPriorTools
  }))

  return {
    ...server,
    tools: normalizedTools,
    lastSyncedAt: Date.now(),
    lastError: undefined
  }
}

async function refreshMcpServerToolsById(serverId: string): Promise<McpServer[]> {
  const normalizedId = typeof serverId === 'string' ? serverId.trim() : ''
  if (!normalizedId) {
    return getMcpServers()
  }

  const servers = getMcpServers()
  const targetServer = servers.find((server) => server.id === normalizedId)
  if (!targetServer) {
    return servers
  }

  try {
    const refreshedServer = await refreshMcpServerTools(targetServer)
    const nextServers = servers.map((server) => (server.id === normalizedId ? refreshedServer : server))
    updateConfig({ mcpServers: nextServers })
    return nextServers
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to refresh MCP tools.'
    const nextServers = servers.map((server) =>
      server.id === normalizedId ? { ...server, lastError: message, lastSyncedAt: Date.now() } : server
    )
    updateConfig({ mcpServers: nextServers })
    throw new Error(message)
  }
}

interface McpToolRegistryEntry {
  server: McpServer
  tool: McpTool
  qualifiedName: string
}

function normalizeMcpToolNameSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_]/g, '_')
  return normalized || 'tool'
}

function getActiveMcpToolRegistry(): McpToolRegistryEntry[] {
  const servers = getMcpServers().filter((server) => server.active)
  const registry: McpToolRegistryEntry[] = []

  servers.forEach((server) => {
    server.tools
      .filter((tool) => tool.enabled)
      .forEach((tool) => {
        registry.push({
          server,
          tool,
          qualifiedName: `mcp_${normalizeMcpToolNameSegment(server.id)}_${normalizeMcpToolNameSegment(tool.name)}`
        })
      })
  })

  return registry
}

function parseMcpToolResultContent(result: unknown): string {
  if (typeof result === 'string') {
    return result
  }

  if (!result || typeof result !== 'object') {
    return JSON.stringify(result)
  }

  const content = (result as { content?: unknown }).content
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    const textSegments = content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }

        if (part && typeof part === 'object') {
          const typedPart = part as { type?: unknown; text?: unknown; content?: unknown }
          if (typedPart.type === 'text' && typeof typedPart.text === 'string') {
            return typedPart.text
          }

          if (typeof typedPart.content === 'string') {
            return typedPart.content
          }
        }

        return ''
      })
      .filter((segment) => Boolean(segment))

    if (textSegments.length > 0) {
      return textSegments.join('\n')
    }
  }

  return JSON.stringify(result)
}

async function callMcpTool(entry: McpToolRegistryEntry, rawArguments: string | undefined): Promise<string> {
  let parsedArguments: Record<string, unknown> = {}

  if (typeof rawArguments === 'string' && rawArguments.trim()) {
    try {
      parsedArguments = JSON.parse(rawArguments) as Record<string, unknown>
    } catch {
      parsedArguments = { input: rawArguments }
    }
  }

  const response = (await sendMcpRequest(entry.server, 'tools/call', {
    name: entry.tool.name,
    arguments: parsedArguments
  })) as { result?: unknown } | unknown

  const resultPayload = typeof response === 'object' && response !== null && 'result' in response
    ? (response as { result?: unknown }).result
    : response

  return parseMcpToolResultContent(resultPayload)
}

function buildExtendedModelParams(model: string, reasoningEffort: string): Record<string, unknown> {
  if (!modelSupportsExtendedParams(model)) {
    return {}
  }

  const params: Record<string, unknown> = {
    verbosity: 'medium'
  }

  if (['low', 'medium', 'high'].includes(reasoningEffort)) {
    params.reasoning_effort = reasoningEffort
  }

  return params
}

async function completeChatWithMcp(
  client: OpenAI,
  sanitizedMessages: Array<{ role: ChatRole; content: string }>,
  toolRegistry: McpToolRegistryEntry[],
  model: string
): Promise<string> {
  const openAiMessages: Array<Record<string, unknown>> = [
    {
      role: 'system',
      content:
        "You are Covenant, a helpful, concise AI assistant integrated into a user's operating system. Keep your answers brief and to the point."
    },
    ...sanitizedMessages
  ]

  const openAiTools = toolRegistry.map((entry) => ({
    type: 'function' as const,
    function: {
      name: entry.qualifiedName,
      description: entry.tool.description || undefined,
      parameters: entry.tool.inputSchema ?? { type: 'object', additionalProperties: true }
    }
  }))

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const completion = await client.chat.completions.create({
      model,
      messages: openAiMessages as any,
      tools: openAiTools as any,
      tool_choice: openAiTools.length > 0 ? 'auto' : undefined,
      ...buildExtendedModelParams(model, readConfig().reasoningEffort)
    })

    const message = completion.choices[0]?.message
    const assistantContent = typeof message?.content === 'string' ? message.content.trim() : ''

    if (!message?.tool_calls || message.tool_calls.length === 0) {
      return assistantContent || 'No response from model.'
    }

    openAiMessages.push({
      role: 'assistant',
      content: assistantContent,
      tool_calls: message.tool_calls
    })

    for (const toolCall of message.tool_calls) {
      const resolvedEntry = toolRegistry.find((entry) => entry.qualifiedName === toolCall.function.name)
      if (!resolvedEntry) {
        openAiMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: `Tool ${toolCall.function.name} is unavailable.`
        })
        continue
      }

      const toolOutput = await callMcpTool(resolvedEntry, toolCall.function.arguments)
      openAiMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: toolOutput
      })
    }
  }

  return 'The model requested too many tool calls without finishing.'
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

ipcMain.handle('get-mcp-servers', () => {
  return getMcpServers()
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

  const config = readConfig()
  return terminalManager.start(cols, rows, config.preferredShell)
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

ipcMain.handle('save-mcp-server', (_event, payload: Partial<McpServer>) => {
  return saveMcpServer(payload)
})

ipcMain.handle('delete-mcp-server', (_event, serverId: string) => {
  return deleteMcpServer(serverId)
})

ipcMain.handle('refresh-mcp-server-tools', async (_event, serverId: string) => {
  return refreshMcpServerToolsById(serverId)
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

ipcMain.on('update-preferred-shell', (_event, preferredShell: string) => {
  const nextPreferredShell = typeof preferredShell === 'string' && preferredShell.trim() ? preferredShell.trim() : undefined
  updateConfig({ preferredShell: nextPreferredShell })

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('preferred-shell-updated', nextPreferredShell)
  }
})

ipcMain.on('update-startup-setting', (_event, launchOnStartup: boolean) => {
  const isEnabled = typeof launchOnStartup === 'boolean' ? launchOnStartup : DEFAULT_CONFIG.launchOnStartup
  updateConfig({ launchOnStartup: isEnabled })
  
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

ipcMain.on('update-button-visibility', (_event, buttonVisibility: Partial<AppConfig['buttonVisibility']>) => {
  const current = readConfig().buttonVisibility
  const nextButtonVisibility: AppConfig['buttonVisibility'] = {
    appLauncher: typeof buttonVisibility?.appLauncher === 'boolean' ? buttonVisibility.appLauncher : current.appLauncher,
    workflow: typeof buttonVisibility?.workflow === 'boolean' ? buttonVisibility.workflow : current.workflow
  }
  updateConfig({ buttonVisibility: nextButtonVisibility })

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('button-visibility-updated', nextButtonVisibility)
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('button-visibility-updated', nextButtonVisibility)
  }
})

ipcMain.on('update-chat-model', (_event, chatModel: string) => {
  const nextChatModel = typeof chatModel === 'string' && chatModel.trim() ? chatModel.trim() : DEFAULT_CHAT_MODEL
  updateConfig({ chatModel: nextChatModel })

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('chat-model-updated', nextChatModel)
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('chat-model-updated', nextChatModel)
  }
})

ipcMain.on('update-reasoning-effort', (_event, reasoningEffort: string) => {
  const validEfforts = ['low', 'medium', 'high']
  const nextReasoningEffort = typeof reasoningEffort === 'string' && validEfforts.includes(reasoningEffort)
    ? reasoningEffort as AppConfig['reasoningEffort']
    : DEFAULT_REASONING_EFFORT
  updateConfig({ reasoningEffort: nextReasoningEffort })

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('reasoning-effort-updated', nextReasoningEffort)
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('reasoning-effort-updated', nextReasoningEffort)
  }
})

ipcMain.handle('covenant:chat-stream', async (event, rawMessages: Array<{ role?: string; content?: string }>) => {
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

  const streamId = randomUUID()
  const sender = event.sender
  const sendStreamEvent = (payload: { id: string } & Record<string, unknown>): void => {
    if (sender.isDestroyed()) return
    sender.send('covenant:chat-stream-event', payload)
  }

  const toolRegistry = getActiveMcpToolRegistry()

  if (toolRegistry.length > 0) {
    const chatModel = storedConfig.chatModel || DEFAULT_CHAT_MODEL
    const responseText = await completeChatWithMcp(client, sanitizedMessages, toolRegistry, chatModel)

    void (async () => {
      sendStreamEvent({ id: streamId, type: 'content', delta: responseText })
      sendStreamEvent({ id: streamId, type: 'done', usage: undefined, model: chatModel })
    })()

    return { id: streamId }
  }

  const model = storedConfig.chatModel || DEFAULT_CHAT_MODEL
  const stream = await client.chat.completions.create({
    model,
    stream: true,
    stream_options: { include_usage: true },
    ...buildExtendedModelParams(model, storedConfig.reasoningEffort || DEFAULT_REASONING_EFFORT),
    messages: [
      {
        role: 'system',
        content:
          "You are Covenant, a helpful, concise AI assistant integrated into a user's operating system. Keep your answers brief and to the point."
      },
      ...sanitizedMessages
    ]
  })

  void (async () => {
    let finalUsage: ChatUsage | undefined

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0]
        const delta = choice?.delta?.content
        const reasoning =
          (choice?.delta as { reasoning?: string; thinking?: string })?.reasoning ??
          (choice?.delta as { reasoning?: string; thinking?: string })?.thinking

        if (typeof delta === 'string' && delta.length > 0) {
          sendStreamEvent({ id: streamId, type: 'content', delta })
        }

        if (typeof reasoning === 'string' && reasoning.length > 0) {
          sendStreamEvent({ id: streamId, type: 'reasoning', delta: reasoning })
        }

        if (chunk.usage) {
          const promptTokensDetails = chunk.usage.prompt_tokens_details as
            | { cached_tokens?: number }
            | undefined

          finalUsage = {
            promptTokens: chunk.usage.prompt_tokens,
            cachedPromptTokens: promptTokensDetails?.cached_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens
          }
        }
      }

      sendStreamEvent({ id: streamId, type: 'done', usage: finalUsage, model })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch AI response.'
      sendStreamEvent({ id: streamId, type: 'error', error: message })
    }
  })()

  return { id: streamId }
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

  const toolRegistry = getActiveMcpToolRegistry()
  const chatModel = storedConfig.chatModel || DEFAULT_CHAT_MODEL
  if (toolRegistry.length > 0) {
    return completeChatWithMcp(client, sanitizedMessages, toolRegistry, chatModel)
  }
  const completion = await client.chat.completions.create({
    model: chatModel,
    ...buildExtendedModelParams(chatModel, storedConfig.reasoningEffort || DEFAULT_REASONING_EFFORT),
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
