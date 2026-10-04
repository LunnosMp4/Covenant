import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  protocol,
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
import { pathToFileURL } from 'url'
import { is } from '@electron-toolkit/utils'
import ElectronStore from 'electron-store'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import { ProxyAgent } from 'undici'
import { terminalManager, type TerminalExitPayload } from './terminalManager'
import { getTerminalFonts } from './fontManager'
import type { AppConfig } from '../shared/config'
import {
  DEFAULT_AUTO_COLLAPSE_REASONING,
  DEFAULT_BUTTON_VISIBILITY,
  DEFAULT_CHAT_MODEL,
  DEFAULT_ENABLE_WEB_SEARCH,
  DEFAULT_LAUNCHER_SHOW_SYSTEM_APPS,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_SHORTCUTS,
  DEFAULT_TEXTURE_INTENSITY,
  modelDoesReasoning,
  modelSupportsWebSearch,
  normalizeChatModelId,
  normalizeShortcuts,
  normalizeTextureIntensity,
  type ShortcutConfig
} from '../shared/config'
import type { McpServer } from '../shared/mcp'
import { CHAT_ROLE_SET, type ChatConversation, type ChatRole, type ChatUsage } from '../shared/chat'
import { normalizeConversation } from '../shared/chatNormalizers'
import {
  DEFAULT_PASTE_SETTINGS,
  normalizePasteManagerSettings,
  type PasteManagerSettings
} from '../shared/paste'
import { PasteManager } from './paste/pasteManager'
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  MAX_TERMINAL_COLS,
  MAX_TERMINAL_ROWS,
  MIN_TERMINAL_COLS,
  MIN_TERMINAL_ROWS,
  sanitizeTerminalDimension,
  sanitizeTerminalInput
} from '../shared/dimensions'
import { parseLaunchArguments } from './services/argParser'
import { normalizeStoredMcpServer, normalizeStoredMcpServers } from './services/mcpNormalizers'
import {
  buildOpenAIToolDefinitions,
  callMcpTool,
  configureMcpClient,
  configureMcpProxy,
  forgetMcpSession,
  normalizeMcpToolNameSegment,
  refreshMcpServerTools,
  sanitizeResponseOutputForInput,
  testMcpServer,
  type McpToolRegistryEntry
} from './services/mcpClient'
import {
  DEFAULT_GAMIFICATION,
  applyStreakBonus,
  calculateLevelFromTotalXp,
  type GamificationState,
  type TaskActionType,
  type TaskCategory,
  type TaskTier
} from '../shared/gamification'
import { evaluateTask, evaluateTaskHeuristically } from './services/taskEvaluator'
import { openLogsFolder, setupLogger } from './logger'
import { clearInstalledAppsCache, getAppIcon, getInstalledApps, warmInstalledAppsCache } from './installedApps'
import { checkForUpdatesManually, getUpdateStatus, quitAndInstallUpdate, setupAutoUpdater } from './updater'

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

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let pasteWindow: BrowserWindow | null = null
let pasteManager: PasteManager | null = null
let suppressPasteBlur = false
let tray: Tray | null = null
let isVisible = false
let isPinned = false
let isWindowExpanded = false

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

interface Task {
  id: string
  title: string
  done: boolean
  createdAt: number
  evaluating?: boolean
  tier?: TaskTier
  xpReward?: number
  estimatedMinutes?: number
  categoryTag?: TaskCategory
  actionType?: TaskActionType
  rationale?: string
}

interface ClearCompletedResult {
  tasks: Task[]
  gamification: GamificationState
  xpGained: number
  levelUp: boolean
  streakBonusApplied: boolean
  clearedCount: number
}

interface AppStoreSchema {
  preprompts: Preprompt[]
  globalInstructions: string
  apps: LauncherApp[]
  workflows: Workflow[]
  conversations: ChatConversation[]
  tasks: Task[]
  gamification: GamificationState
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
  reasoningEffort: DEFAULT_REASONING_EFFORT,
  enableWebSearch: DEFAULT_ENABLE_WEB_SEARCH,
  autoCollapseReasoning: DEFAULT_AUTO_COLLAPSE_REASONING,
  launcherShowSystemApps: DEFAULT_LAUNCHER_SHOW_SYSTEM_APPS,
  shortcuts: { ...DEFAULT_SHORTCUTS },
  textureIntensity: DEFAULT_TEXTURE_INTENSITY,
  pasteManager: { ...DEFAULT_PASTE_SETTINGS },
  hasOnboarded: false,
  autoUpdate: true
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
let lastActiveSessionId: string | null = null
const MAX_CONVERSATIONS = 20
const CONVERSATION_TITLE_MODEL = 'gpt-6-luna'
const MAX_GENERATED_TITLE_LENGTH = 60
const activeChatStreams = new Map<string, AbortController>()

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

terminalManager.onData((sessionId, chunk) => {
  emitTerminalEvent('terminal:data', { sessionId, chunk })
})

terminalManager.onExit((payload: TerminalExitPayload) => {
  if (payload.sessionId === lastActiveSessionId) {
    lastActiveSessionId = null
  }
  emitTerminalEvent('terminal:exit', payload)
})

const StoreClass =
  (ElectronStore as typeof ElectronStore & { default?: typeof ElectronStore }).default ??
  ElectronStore

const appStore = new StoreClass<AppStoreSchema>({
  name: 'preprompts',
  defaults: {
    preprompts: [],
    globalInstructions: '',
    apps: [],
    workflows: [],
    conversations: [],
    tasks: [],
    gamification: DEFAULT_GAMIFICATION
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
    globalInstructions: {
      type: 'string',
      default: ''
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
    tasks: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          done: { type: 'boolean' },
          createdAt: { type: 'number' },
          evaluating: { type: 'boolean' },
          tier: {
            type: 'string',
            enum: ['TRIVIAL', 'EASY', 'MEDIUM', 'HARD', 'EPIC']
          },
          xpReward: { type: 'number' },
          estimatedMinutes: { type: 'number' },
          categoryTag: {
            type: 'string',
            enum: [
              'Dev',
              'DevOps',
              'SysAdmin',
              'Writing',
              'Design',
              'Admin',
              'Personal',
              'Health',
              'General'
            ]
          },
          actionType: {
            type: 'string',
            enum: [
              'terminal_command',
              'code_refactor',
              'quick_action',
              'deep_work',
              'communication',
              'maintenance'
            ]
          },
          rationale: { type: 'string' }
        },
        required: ['id', 'title', 'done', 'createdAt']
      }
    },
    gamification: {
      type: 'object',
      default: DEFAULT_GAMIFICATION,
      additionalProperties: false,
      properties: {
        currentLevel: { type: 'number' },
        currentXP: { type: 'number' },
        totalLifetimeXP: { type: 'number' },
        streakDays: { type: 'number' },
        lastActiveDate: { type: ['string', 'null'] }
      },
      required: ['currentLevel', 'currentXP', 'totalLifetimeXP', 'streakDays', 'lastActiveDate']
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
                reasoningTitle: { type: 'string' },
                model: { type: 'string' },
                stopped: { type: 'boolean' },
                sources: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      title: { type: 'string' },
                      url: { type: 'string' }
                    },
                    required: ['url']
                  }
                },
                steps: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      type: { type: 'string', enum: ['reasoning', 'web_search', 'tool'] },
                      text: { type: 'string' },
                      id: { type: 'string' },
                      name: { type: 'string' },
                      serverName: { type: 'string' },
                      query: { type: 'string' },
                      status: { type: 'string', enum: ['searching', 'running', 'done', 'error'] },
                      content: { type: 'string' },
                      sources: {
                        type: 'array',
                        items: {
                          type: 'object',
                          additionalProperties: false,
                          properties: {
                            title: { type: 'string' },
                            url: { type: 'string' }
                          },
                          required: ['url']
                        }
                      }
                    },
                    required: ['type']
                  }
                },
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

function getGlobalInstructions(): string {
  const stored = appStore.get('globalInstructions', '')
  return typeof stored === 'string' ? stored : ''
}

function saveGlobalInstructions(value: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  appStore.set('globalInstructions', normalized)
  return normalized
}

function getTasks(): Task[] {
  return appStore.get('tasks', [])
}

function getGamification(): GamificationState {
  const stored = appStore.get('gamification', DEFAULT_GAMIFICATION)
  const totalLifetimeXP =
    typeof stored.totalLifetimeXP === 'number' && Number.isFinite(stored.totalLifetimeXP)
      ? Math.max(0, Math.floor(stored.totalLifetimeXP))
      : 0
  const progress = calculateLevelFromTotalXp(totalLifetimeXP)

  return {
    currentLevel: progress.level,
    currentXP: progress.currentXP,
    totalLifetimeXP,
    streakDays:
      typeof stored.streakDays === 'number' && Number.isFinite(stored.streakDays)
        ? Math.max(0, Math.floor(stored.streakDays))
        : 0,
    lastActiveDate:
      typeof stored.lastActiveDate === 'string' && stored.lastActiveDate.trim()
        ? stored.lastActiveDate.trim()
        : null
  }
}

function persistGamification(state: GamificationState): void {
  appStore.set('gamification', state)
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getYesterdayDateKey(): string {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return getLocalDateKey(yesterday)
}

function emitTasksUpdated(tasks: Task[]): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return
  }

  mainWindow.webContents.send('tasks:updated', tasks)
}

function applyTaskEvaluation(task: Task, evaluation: {
  tier: TaskTier
  xpReward: number
  estimatedMinutes: number
  categoryTag: TaskCategory
  actionType: TaskActionType
  rationale: string
}): Task {
  return {
    ...task,
    tier: evaluation.tier,
    xpReward: evaluation.xpReward,
    estimatedMinutes: evaluation.estimatedMinutes,
    categoryTag: evaluation.categoryTag,
    actionType: evaluation.actionType,
    rationale: evaluation.rationale
  }
}

function addTask(title: string): Task[] {
  const normalizedTitle = typeof title === 'string' ? title.trim() : ''
  if (!normalizedTitle) {
    throw new Error('Task title is required.')
  }

  const storedConfig = readConfig()
  const apiKey = storedConfig.apiKey || process.env.OPENAI_API_KEY

  // Populate a heuristic estimate immediately so the task always carries a
  // resolvable XP reward (even if cleared before the LLM responds), and mark it
  // "evaluating" only when a live refinement pass will actually run.
  const heuristic = evaluateTaskHeuristically(normalizedTitle)
  const created: Task = applyTaskEvaluation(
    {
      id: randomUUID(),
      title: normalizedTitle,
      done: false,
      createdAt: Date.now(),
      evaluating: Boolean(apiKey)
    },
    heuristic
  )

  const nextTasks = [...getTasks(), created]
  appStore.set('tasks', nextTasks)

  if (apiKey) {
    void refineTaskEvaluation(created.id, normalizedTitle, apiKey, storedConfig.proxyUrl)
  }

  return nextTasks
}

async function refineTaskEvaluation(
  taskId: string,
  title: string,
  apiKey: string,
  proxyUrl?: string
): Promise<void> {
  try {
    const evaluation = await evaluateTask(title, apiKey, proxyUrl)
    const nextTasks = getTasks().map((item) =>
      item.id === taskId
        ? { ...applyTaskEvaluation(item, evaluation), evaluating: false }
        : item
    )

    appStore.set('tasks', nextTasks)
    emitTasksUpdated(nextTasks)
  } catch {
    const nextTasks = getTasks().map((item) =>
      item.id === taskId ? { ...item, evaluating: false } : item
    )
    appStore.set('tasks', nextTasks)
    emitTasksUpdated(nextTasks)
  }
}

function toggleTask(id: string): Task[] {
  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId) {
    return getTasks()
  }

  const nextTasks = getTasks().map((item) =>
    item.id === normalizedId ? { ...item, done: !item.done } : item
  )
  appStore.set('tasks', nextTasks)
  return nextTasks
}

function deleteTask(id: string): Task[] {
  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId) {
    return getTasks()
  }

  const nextTasks = getTasks().filter((item) => item.id !== normalizedId)
  appStore.set('tasks', nextTasks)
  return nextTasks
}

function reorderTasks(orderedIds: unknown): Task[] {
  if (!Array.isArray(orderedIds)) {
    return getTasks()
  }

  const currentTasks = getTasks()
  const byId = new Map(currentTasks.map((task) => [task.id, task]))

  const ordered = orderedIds
    .map((rawId) => (typeof rawId === 'string' ? rawId.trim() : ''))
    .filter((id): id is string => Boolean(id))
    .map((id) => byId.get(id))
    .filter((task): task is Task => Boolean(task))

  const seen = new Set(ordered.map((task) => task.id))
  const remaining = currentTasks.filter((task) => !seen.has(task.id))
  const nextTasks = [...ordered, ...remaining]

  appStore.set('tasks', nextTasks)
  return nextTasks
}

function clearCompletedTasks(): ClearCompletedResult {
  const currentTasks = getTasks()
  const completedTasks = currentTasks.filter((item) => item.done)
  const nextTasks = currentTasks.filter((item) => !item.done)

  const clearedCount = completedTasks.length
  if (clearedCount === 0) {
    appStore.set('tasks', nextTasks)
    return {
      tasks: nextTasks,
      gamification: getGamification(),
      xpGained: 0,
      levelUp: false,
      streakBonusApplied: false,
      clearedCount: 0
    }
  }

  const baseXp = completedTasks.reduce((sum, item) => {
    const reward =
      typeof item.xpReward === 'number' && Number.isFinite(item.xpReward)
        ? item.xpReward
        : evaluateTaskHeuristically(item.title).xpReward
    return sum + reward
  }, 0)

  const state = getGamification()
  const today = getLocalDateKey(new Date())

  let streakDays = state.streakDays
  let streakBonusApplied = false
  if (state.lastActiveDate === today) {
    // Same day — streak unchanged.
  } else if (state.lastActiveDate === getYesterdayDateKey()) {
    streakDays += 1
    streakBonusApplied = true
  } else {
    streakDays = 1
    streakBonusApplied = true
  }

  const awardedXp = applyStreakBonus(baseXp, streakDays)
  const totalLifetimeXP = state.totalLifetimeXP + awardedXp
  const progress = calculateLevelFromTotalXp(totalLifetimeXP)

  const nextGamification: GamificationState = {
    currentLevel: progress.level,
    currentXP: progress.currentXP,
    totalLifetimeXP,
    streakDays,
    lastActiveDate: today
  }

  appStore.set('tasks', nextTasks)
  persistGamification(nextGamification)

  return {
    tasks: nextTasks,
    gamification: nextGamification,
    xpGained: awardedXp,
    levelUp: progress.level > state.currentLevel,
    streakBonusApplied,
    clearedCount
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

function deleteConversation(id: string): ChatConversation[] {
  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId) {
    return getConversations()
  }

  const nextConversations = getConversations().filter((conversation) => conversation.id !== normalizedId)
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

  // Microsoft Store / UWP apps are launched through the shell app namespace.
  if (isWindows && /^shell:/i.test(normalizedPath)) {
    await spawnDetached('explorer.exe', [normalizedPath])
    return
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

  if (isWindows && /\.(lnk|url)$/i.test(normalizedPath)) {
    const openError = await shell.openPath(normalizedPath)
    if (openError) {
      throw new Error(openError)
    }
    return
  }

  await spawnDetached(normalizedPath, parsedArguments)
}

dotenv.config({ path: join(process.cwd(), '.env') })

setupLogger()

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

  // Preserve whatever family the user picked. Validating against the freshly
  // enumerated system font list here is destructive: if enumeration fails or
  // filters the font out, the saved preference is silently reset and written
  // back to disk. The renderer only ever sends a family it selected.
  const normalizedFont = extractTerminalFontFamily(rawFont)
  return normalizedFont || DEFAULT_CONFIG.terminalFont
}

function normalizeButtonVisibility(raw: unknown): AppConfig['buttonVisibility'] {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_BUTTON_VISIBILITY }
  }

  const obj = raw as Record<string, unknown>
  return {
    appLauncher: typeof obj.appLauncher === 'boolean' ? obj.appLauncher : DEFAULT_BUTTON_VISIBILITY.appLauncher,
    workflow: typeof obj.workflow === 'boolean' ? obj.workflow : DEFAULT_BUTTON_VISIBILITY.workflow,
    tasks: typeof obj.tasks === 'boolean' ? obj.tasks : DEFAULT_BUTTON_VISIBILITY.tasks
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
    chatModel: normalizeChatModelId(rawConfig?.chatModel),
    reasoningEffort:
      typeof rawConfig?.reasoningEffort === 'string' && ['low', 'medium', 'high'].includes(rawConfig.reasoningEffort)
        ? rawConfig.reasoningEffort as AppConfig['reasoningEffort']
        : DEFAULT_REASONING_EFFORT,
    enableWebSearch:
      typeof rawConfig?.enableWebSearch === 'boolean'
        ? rawConfig.enableWebSearch
        : DEFAULT_ENABLE_WEB_SEARCH,
    autoCollapseReasoning:
      typeof rawConfig?.autoCollapseReasoning === 'boolean'
        ? rawConfig.autoCollapseReasoning
        : DEFAULT_AUTO_COLLAPSE_REASONING,
    launcherShowSystemApps:
      typeof rawConfig?.launcherShowSystemApps === 'boolean'
        ? rawConfig.launcherShowSystemApps
        : DEFAULT_LAUNCHER_SHOW_SYSTEM_APPS,
    shortcuts: normalizeShortcuts(rawConfig?.shortcuts),
    textureIntensity: normalizeTextureIntensity(rawConfig?.textureIntensity),
    pasteManager: normalizePasteManagerSettings(rawConfig?.pasteManager),
    hasOnboarded:
      typeof rawConfig?.hasOnboarded === 'boolean' ? rawConfig.hasOnboarded : false,
    autoUpdate:
      typeof rawConfig?.autoUpdate === 'boolean' ? rawConfig.autoUpdate : true
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

  forgetMcpSession(normalizedId)
  const nextServers = getMcpServers().filter((item) => item.id !== normalizedId)
  updateConfig({ mcpServers: nextServers })
  return nextServers
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

type SanitizedMessage = { role: ChatRole; content: string | Array<{ type: string; text?: string; image_url?: string }> }

const MAX_MCP_TOOL_ROUNDS = 5
const MAX_TOOL_RESULT_DISPLAY_LENGTH = 1200

const COVENANT_INSTRUCTIONS =
  "You are Covenant, a helpful, concise AI assistant integrated into a user's operating system. Keep your answers brief and to the point."

function truncateMcpResult(content: string): string {
  const trimmed = content.trim()
  if (trimmed.length <= MAX_TOOL_RESULT_DISPLAY_LENGTH) {
    return trimmed
  }
  return `${trimmed.slice(0, MAX_TOOL_RESULT_DISPLAY_LENGTH)}\n… (truncated)`
}

function buildResponsesInput(sanitizedMessages: SanitizedMessage[]): Array<Record<string, unknown>> {
  return sanitizedMessages.map((message) => ({
    role:
      message.role === 'assistant'
        ? ('assistant' as const)
        : message.role === 'system'
          ? ('developer' as const)
          : (message.role as string),
    content: message.content
  }))
}

function buildResponseParams(storedConfig: AppConfig, model: string): Record<string, unknown> {
  const globalInstructions = getGlobalInstructions()
  const params: Record<string, unknown> = {
    instructions: globalInstructions
      ? `${COVENANT_INSTRUCTIONS}\n\n${globalInstructions}`
      : COVENANT_INSTRUCTIONS
  }

  if (modelDoesReasoning(model)) {
    params.reasoning = {
      effort: storedConfig.reasoningEffort || DEFAULT_REASONING_EFFORT,
      summary: 'auto'
    }
  } else {
    params.temperature = 0.7
  }

  return params
}

async function completeChatWithMcp(
  client: OpenAI,
  sanitizedMessages: SanitizedMessage[],
  toolRegistry: McpToolRegistryEntry[],
  model: string
): Promise<string> {
  const storedConfig = readConfig()
  const params = buildResponseParams(storedConfig, model)
  const tools = buildOpenAIToolDefinitions(toolRegistry)

  let input = buildResponsesInput(sanitizedMessages)

  for (let attempt = 0; attempt < MAX_MCP_TOOL_ROUNDS; attempt += 1) {
    const response = (await client.responses.create({
      model,
      input: input as unknown[],
      tools: tools as unknown[],
      ...(params as Record<string, unknown>)
    } as any)) as unknown as {
      output?: Array<Record<string, unknown>>
      output_text?: unknown
    }

    const output = response?.output ?? []
    const functionCalls = output.filter(
      (item) => item.type === 'function_call' && typeof item.call_id === 'string'
    ) as Array<{ call_id: string; name: string; arguments: string }>

    if (functionCalls.length === 0) {
      return (typeof response?.output_text === 'string' ? response.output_text : '').trim() || 'No response from model.'
    }

    const continuation: Array<Record<string, unknown>> = [...sanitizeResponseOutputForInput(output)]
    for (const call of functionCalls) {
      const entry = toolRegistry.find((e) => e.qualifiedName === call.name)
      if (!entry) {
        continuation.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: `Tool ${call.name} is unavailable.`
        })
        continue
      }
      const result = await callMcpTool(entry.server, entry.tool, call.arguments)
      continuation.push({ type: 'function_call_output', call_id: call.call_id, output: result.content })
    }

    input = [...input, ...continuation]
  }

  return 'The model requested too many tool calls without finishing.'
}

interface StreamingChatContext {
  client: OpenAI
  streamId: string
  sender: WebContents
  model: string
  sendStreamEvent: (payload: { id: string } & Record<string, unknown>) => void
  signal: AbortSignal
}

function extractWebSearchQuery(action: Record<string, unknown> | undefined): string {
  if (!action) return ''
  if (Array.isArray(action.queries) && action.queries.length > 0) return String(action.queries[0])
  if (typeof action.query === 'string' && action.query.trim()) return action.query
  if (typeof action.pattern === 'string' && action.pattern.trim()) return action.pattern
  if (typeof action.url === 'string' && action.url.trim()) return action.url
  return ''
}

async function runStreamingChat(
  ctx: StreamingChatContext,
  initialInput: Array<Record<string, unknown>>,
  tools: Array<Record<string, unknown>>,
  baseParams: Record<string, unknown>,
  toolRegistry: McpToolRegistryEntry[]
): Promise<void> {
  const reasoningBufferMap = new Map<string, string>()
  const reasoningTitleParsed = new Set<string>()
  const reasoningTitleById = new Map<string, string>()
  const functionArgsById = new Map<string, string>()
  const functionMetaById = new Map<string, { name: string; callId: string }>()

  let currentInput = initialInput

  for (let round = 0; round < MAX_MCP_TOOL_ROUNDS + 1; round += 1) {
    if (ctx.signal.aborted) break

    const streamBody: Record<string, unknown> = {
      ...baseParams,
      model: ctx.model,
      input: currentInput as unknown[],
      stream: true
    }
    if (tools.length > 0) {
      streamBody.tools = tools as unknown[]
    }

    const stream = ctx.client.responses.stream(streamBody as any, { signal: ctx.signal })

    let finalUsage: ChatUsage | undefined
    let streamError: string | undefined
    let stopped = false

    try {
      for await (const streamEvent of stream) {
        switch (streamEvent.type) {
          case 'response.output_item.added': {
            const item = streamEvent.item as unknown as Record<string, unknown>
            if (item.type === 'reasoning') {
              reasoningBufferMap.set(item.id as string, '')
              ctx.sendStreamEvent({ id: ctx.streamId, type: 'reasoning-start', itemId: item.id })
            } else if (item.type === 'web_search_call') {
              const action = item.action as Record<string, unknown> | undefined
              ctx.sendStreamEvent({
                id: ctx.streamId,
                type: 'tool-start',
                itemId: item.id,
                toolType: 'web_search',
                toolName: 'Web Search',
                actionType: typeof action?.type === 'string' ? action.type : 'search',
                query: extractWebSearchQuery(action)
              })
            } else if (item.type === 'function_call') {
              const itemId = item.id as string
              const callId = typeof item.call_id === 'string' ? item.call_id : itemId
              const name = typeof item.name === 'string' ? item.name : ''
              functionArgsById.set(itemId, '')
              functionMetaById.set(itemId, { name, callId })
              const entry = toolRegistry.find((e) => e.qualifiedName === name)
              ctx.sendStreamEvent({
                id: ctx.streamId,
                type: 'tool-start',
                itemId,
                toolType: 'mcp',
                toolName: entry ? `${entry.server.name} › ${entry.tool.name}` : name,
                serverName: entry?.server.name,
                query: name,
                actionType: 'call'
              })
            }
            break
          }

          case 'response.function_call_arguments.delta': {
            const itemId = streamEvent.item_id
            const delta = typeof streamEvent.delta === 'string' ? streamEvent.delta : ''
            if (itemId) {
              functionArgsById.set(itemId, (functionArgsById.get(itemId) ?? '') + delta)
            }
            break
          }

          case 'response.function_call_arguments.done': {
            const itemId = streamEvent.item_id
            const args = typeof streamEvent.arguments === 'string'
              ? streamEvent.arguments
              : (functionArgsById.get(itemId) ?? '')
            const meta = itemId ? functionMetaById.get(itemId) : undefined
            if (itemId && meta) {
              functionArgsById.set(itemId, args)
              ctx.sendStreamEvent({ id: ctx.streamId, type: 'tool-query', itemId, query: meta.name })
            }
            break
          }

          case 'response.reasoning_summary_text.delta': {
            const deltaStr = typeof streamEvent.delta === 'string' ? streamEvent.delta : ''
            const itemId = streamEvent.item_id
            if (!deltaStr || !itemId) break

            const buffer = (reasoningBufferMap.get(itemId) || '') + deltaStr
            reasoningBufferMap.set(itemId, buffer)

            if (!reasoningTitleParsed.has(itemId)) {
              const match = /^\*\*([^*\n]+)\*\*\n\n([\s\S]*)$/.exec(buffer)
              if (match) {
                reasoningTitleParsed.add(itemId)
                reasoningTitleById.set(itemId, match[1])
                ctx.sendStreamEvent({ id: ctx.streamId, type: 'reasoning-title', itemId, title: match[1] })
                if (match[2]) {
                  ctx.sendStreamEvent({ id: ctx.streamId, type: 'reasoning-delta', itemId, delta: match[2] })
                }
                break
              }
            }

            if (reasoningTitleParsed.has(itemId)) {
              ctx.sendStreamEvent({ id: ctx.streamId, type: 'reasoning-delta', itemId, delta: deltaStr })
            }
            break
          }

          case 'response.output_item.done': {
            const doneItem = streamEvent.item as unknown as Record<string, unknown>
            if (doneItem.type === 'reasoning') {
              const itemId = doneItem.id as string
              if (!reasoningTitleParsed.has(itemId)) {
                const buffer = reasoningBufferMap.get(itemId) || ''
                const match = /^\*\*([^*\n]+)\*\*\n\n([\s\S]*)$/.exec(buffer)
                const fallbackTitle = match ? match[1] : 'Thinking...'
                reasoningTitleParsed.add(itemId)
                reasoningTitleById.set(itemId, fallbackTitle)
                ctx.sendStreamEvent({ id: ctx.streamId, type: 'reasoning-title', itemId, title: fallbackTitle })
                if (match && match[2]) {
                  ctx.sendStreamEvent({ id: ctx.streamId, type: 'reasoning-delta', itemId, delta: match[2] })
                } else if (!match && buffer) {
                  ctx.sendStreamEvent({ id: ctx.streamId, type: 'reasoning-delta', itemId, delta: buffer })
                }
              }
              ctx.sendStreamEvent({
                id: ctx.streamId,
                type: 'reasoning-end',
                itemId,
                title: reasoningTitleById.get(itemId) || 'Thinking...'
              })
            } else if (doneItem.type === 'web_search_call') {
              const action = (doneItem as Record<string, unknown>).action as Record<string, unknown> | undefined
              const query = extractWebSearchQuery(action)

              ctx.sendStreamEvent({
                id: ctx.streamId,
                type: 'tool-query',
                itemId: doneItem.id,
                query
              })

              const rawSources: Array<Record<string, unknown>> = []
              if (Array.isArray(action?.sources)) {
                rawSources.push(...action.sources as Array<Record<string, unknown>>)
              } else if (Array.isArray((action as Record<string, unknown> | undefined)?.['results'])) {
                const rawResults = (action as Record<string, unknown>)['results'] as Array<Record<string, unknown>>
                for (const entry of rawResults) {
                  if (Array.isArray(entry.results)) {
                    rawSources.push(...entry.results as Array<Record<string, unknown>>)
                  } else if (Array.isArray(entry.sources)) {
                    rawSources.push(...entry.sources as Array<Record<string, unknown>>)
                  }
                }
              }

              const sources = rawSources
                .map((src) => ({
                  title: (typeof src.title === 'string' ? src.title : '')
                    || (typeof src.name === 'string' ? src.name : '')
                    || '',
                  url: (typeof src.url === 'string' ? src.url : '')
                    || (typeof src.link === 'string' ? src.link : '')
                    || (typeof src.href === 'string' ? src.href : '')
                    || ''
                }))
                .filter((src) => src.url.length > 0)

              if (sources.length > 0) {
                ctx.sendStreamEvent({
                  id: ctx.streamId,
                  type: 'sources',
                  itemId: doneItem.id,
                  sources,
                  query
                })
              }
            } else if (doneItem.type === 'function_call') {
              const itemId = doneItem.id as string
              if (itemId) {
                const args =
                  typeof doneItem.arguments === 'string'
                    ? doneItem.arguments
                    : (functionArgsById.get(itemId) ?? '')
                functionArgsById.set(itemId, args)
              }
            }
            break
          }

          case 'response.output_text.delta': {
            const textDelta = typeof streamEvent.delta === 'string' ? streamEvent.delta : ''
            if (textDelta) {
              ctx.sendStreamEvent({ id: ctx.streamId, type: 'content', delta: textDelta })
            }
            break
          }

          case 'response.completed': {
            const response = streamEvent.response as unknown as {
              usage?: {
                input_tokens?: number
                output_tokens?: number
                total_tokens?: number
                cache_creation_input_tokens?: number
                cache_write_tokens?: number
                input_tokens_details?: { cached_tokens?: number; cache_creation_tokens?: number }
                output_tokens_details?: { reasoning_tokens?: number }
              }
            }
            const usage = response?.usage
            finalUsage = usage
              ? {
                  promptTokens: usage.input_tokens,
                  cachedPromptTokens: usage.input_tokens_details?.cached_tokens,
                  cacheWritePromptTokens:
                    usage.input_tokens_details?.cache_creation_tokens ??
                    usage.cache_creation_input_tokens ??
                    usage.cache_write_tokens,
                  completionTokens: usage.output_tokens,
                  totalTokens: usage.total_tokens,
                  reasoningTokens: usage.output_tokens_details?.reasoning_tokens
                }
              : undefined
            break
          }
        }
      }
    } catch (error) {
      if (ctx.signal.aborted) {
        stopped = true
      } else {
        streamError = error instanceof Error ? error.message : 'Unable to fetch AI response.'
      }
    }

    if (streamError) {
      ctx.sendStreamEvent({ id: ctx.streamId, type: 'error', error: streamError })
      return
    }
    if (stopped) {
      ctx.sendStreamEvent({ id: ctx.streamId, type: 'done', usage: finalUsage, model: ctx.model, stopped: true })
      return
    }

    const finalResponse = (await stream.finalResponse().catch(() => null)) as unknown as {
      output?: Array<Record<string, unknown>>
    } | null
    const output = finalResponse?.output ?? []
    const functionCalls = output.filter(
      (item) => item.type === 'function_call' && typeof item.call_id === 'string'
    ) as Array<{ id: string; call_id: string; name: string; arguments: string }>

    if (functionCalls.length === 0) {
      ctx.sendStreamEvent({ id: ctx.streamId, type: 'done', usage: finalUsage, model: ctx.model })
      return
    }

    const continuation: Array<Record<string, unknown>> = [...sanitizeResponseOutputForInput(output)]
    for (const call of functionCalls) {
      const entry = toolRegistry.find((e) => e.qualifiedName === call.name)
      ctx.sendStreamEvent({
        id: ctx.streamId,
        type: 'tool-result',
        itemId: call.id,
        toolType: 'mcp',
        toolName: call.name,
        serverName: entry?.server.name,
        status: 'running'
      })

      if (!entry) {
        continuation.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: `Tool ${call.name} is unavailable.`
        })
        ctx.sendStreamEvent({
          id: ctx.streamId,
          type: 'tool-result',
          itemId: call.id,
          toolType: 'mcp',
          toolName: call.name,
          status: 'error',
          content: 'Tool unavailable.'
        })
        continue
      }

      try {
        const result = await callMcpTool(entry.server, entry.tool, call.arguments, { signal: ctx.signal })
        continuation.push({ type: 'function_call_output', call_id: call.call_id, output: result.content })
        ctx.sendStreamEvent({
          id: ctx.streamId,
          type: 'tool-result',
          itemId: call.id,
          toolType: 'mcp',
          toolName: call.name,
          serverName: entry.server.name,
          status: result.isError ? 'error' : 'done',
          content: truncateMcpResult(result.content)
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'MCP tool call failed.'
        continuation.push({ type: 'function_call_output', call_id: call.call_id, output: `Error: ${message}` })
        ctx.sendStreamEvent({
          id: ctx.streamId,
          type: 'tool-result',
          itemId: call.id,
          toolType: 'mcp',
          toolName: call.name,
          serverName: entry.server.name,
          status: 'error',
          content: message
        })
      }

      if (ctx.signal.aborted) break
    }

    if (ctx.signal.aborted) {
      ctx.sendStreamEvent({ id: ctx.streamId, type: 'done', usage: undefined, model: ctx.model, stopped: true })
      return
    }

    currentInput = [...currentInput, ...continuation]
  }

  ctx.sendStreamEvent({ id: ctx.streamId, type: 'done', usage: undefined, model: ctx.model, stopped: true })
}

function normalizeGeneratedTitle(rawTitle: unknown): string | null {
  if (typeof rawTitle !== 'string') return null

  const cleaned = rawTitle
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '')
    .replace(/[.!?…]+$/, '')
    .trim()

  if (!cleaned) return null
  return cleaned.slice(0, MAX_GENERATED_TITLE_LENGTH)
}

async function generateConversationTitle(prompt: string): Promise<string> {
  const normalizedPrompt = prompt.trim()
  if (!normalizedPrompt) {
    throw new Error('Prompt cannot be empty.')
  }

  const storedConfig = readConfig()
  const apiKey = storedConfig.apiKey || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OpenAI API key is missing.')
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

  const response = await client.responses.create({
    model: CONVERSATION_TITLE_MODEL,
    instructions:
      'Generate a very short conversation title (at most 6 words) that summarizes the user prompt. Respond with only the title, without quotes, without trailing punctuation, and without any explanation.',
    input: `User prompt: ${normalizedPrompt}`,
    temperature: 0.3
  })

  const rawTitle = (response as unknown as { output_text?: unknown }).output_text
  return normalizeGeneratedTitle(rawTitle) ?? 'New chat'
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

function createWindow(): void {
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

function createSettingsWindow(tab?: string): void {
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
    if (!suppressPasteBlur && pasteWindow && !pasteWindow.isDestroyed()) {
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

function showPasteWindow(): void {
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

function hidePasteWindow(): void {
  if (!pasteWindow || pasteWindow.isDestroyed()) return
  pasteWindow.hide()
  scheduleSleepModeCleanup(pasteWindow)
}

function togglePasteWindow(): void {
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

function registerPasteProtocol(): void {
  try {
    protocol.handle(PASTE_PROTOCOL, async (request) => {
      try {
        const url = new URL(request.url)
        const kind = url.hostname === 'thumb' ? 'thumb' : 'full'
        const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
        if (!pasteManager || !id) {
          return new Response('Not found', { status: 404 })
        }

        const filePath = pasteManager.getImageFilePath(id, kind)
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

function showWindow(terminalMode = false): void {
  if (!mainWindow) return

  const { x, y } = getWindowPosition()
  mainWindow.setBounds({ x, y, width: WINDOW_WIDTH, height: WINDOW_HEIGHT })

  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send('toggle-visibility', true, terminalMode)
  isVisible = true
}

function hideWindow(): void {
  if (!mainWindow) return
  mainWindow.webContents.send('toggle-visibility', false)
  isVisible = false
  isPinned = false
  isWindowExpanded = false

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

function registerShortcuts(config: AppConfig): void {
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

  // Covenant is a background command-bar app. On macOS, hide the Dock icon and
  // application menu so it never appears as a regular foreground "Electron"
  // app. Packaged builds enforce this via LSUIElement; this covers dev too.
  if (isMac) {
    app.dock?.hide()
  }

  const config = readConfig()

  configureMcpClient({ name: 'Covenant', version: app.getVersion() })
  configureMcpProxy(resolveOpenAIProxyUrl(config.proxyUrl))

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
  pasteManager = new PasteManager({
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
      if (pasteWindow && !pasteWindow.isDestroyed() && pasteWindow.isVisible()) {
        pasteWindow.webContents.send('paste:changed')
      }
    }
  })
  void pasteManager.init()
  registerPasteProtocol()

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

  void pasteManager?.dispose()
  pasteManager = null

  terminalManager.disposeAll()
  
  // Cleanup tray
  if (tray) {
    tray.destroy()
    tray = null
  }
})

// IPC: renderer can request hide (after close animation)
ipcMain.on('hide-window', () => {
  isVisible = false
  isPinned = false
  if (mainWindow) {
    mainWindow.hide()
  }
})

ipcMain.on('set-pinned', (_event, pinned: boolean) => {
  isPinned = typeof pinned === 'boolean' ? pinned : false
})

ipcMain.on('set-window-expanded', (_event, expanded: boolean) => {
  isWindowExpanded = expanded
  const height = expanded ? getExpandedHeight() : WINDOW_HEIGHT
  applyWindowHeight(height)
})

ipcMain.on('open-settings', (_event, tab?: string) => {
  createSettingsWindow(tab)
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

ipcMain.handle('delete-conversation', (_event, conversationId: string) => {
  return deleteConversation(conversationId)
})

ipcMain.handle('generate-conversation-title', async (_event, prompt: string) => {
  return generateConversationTitle(prompt)
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

ipcMain.handle('get-global-instructions', () => {
  return getGlobalInstructions()
})

ipcMain.handle('save-global-instructions', (_event, value: string) => {
  return saveGlobalInstructions(value)
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

ipcMain.handle('get-installed-apps', () => {
  return getInstalledApps({ includeSystemApps: readConfig().launcherShowSystemApps === true })
})

ipcMain.handle('get-app-icon', (_event, appPath: string) => {
  return getAppIcon(appPath)
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

ipcMain.handle('get-tasks', () => {
  return getTasks()
})

ipcMain.handle('get-gamification', () => {
  return getGamification()
})

ipcMain.handle('add-task', (_event, title: string) => {
  return addTask(title)
})

ipcMain.handle('toggle-task', (_event, taskId: string) => {
  return toggleTask(taskId)
})

ipcMain.handle('delete-task', (_event, taskId: string) => {
  return deleteTask(taskId)
})

ipcMain.handle('reorder-tasks', (_event, orderedIds: unknown) => {
  return reorderTasks(orderedIds)
})

ipcMain.handle('clear-completed-tasks', () => {
  return clearCompletedTasks()
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

  try {
    const result = terminalManager.createSession(cols, rows, config.preferredShell)
    if (result.created && result.sessionId) {
      lastActiveSessionId = result.sessionId
    }
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown terminal error'
    console.error('Terminal start failed:', message)
    return {
      sessionId: '',
      pid: -1,
      shell: '',
      created: false,
      error: message
    }
  }
})

ipcMain.handle('terminal:input', (event, payload?: { sessionId?: unknown; input?: unknown }) => {
  assertMainWindowSender(event.sender)

  const sessionId = typeof payload?.sessionId === 'string' && payload.sessionId.length > 0 ? payload.sessionId : ''
  if (!sessionId) return { success: false }

  const input = sanitizeTerminalInput(payload?.input)
  if (!input) {
    return { success: false }
  }

  terminalManager.write(sessionId, input)
  return { success: true }
})

ipcMain.handle('terminal:resize', (event, payload?: { sessionId?: unknown; cols?: unknown; rows?: unknown }) => {
  assertMainWindowSender(event.sender)

  const sessionId = typeof payload?.sessionId === 'string' && payload.sessionId.length > 0 ? payload.sessionId : ''
  if (!sessionId) return { success: false }

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

  terminalManager.resize(sessionId, cols, rows)
  return { success: true }
})

ipcMain.handle('terminal:kill', (event, payload?: { sessionId?: unknown }) => {
  assertMainWindowSender(event.sender)

  const sessionId = typeof payload?.sessionId === 'string' && payload.sessionId.length > 0 ? payload.sessionId : ''
  if (!sessionId) return { success: false }

  terminalManager.kill(sessionId)
  if (sessionId === lastActiveSessionId) {
    lastActiveSessionId = null
  }
  return { success: true }
})

ipcMain.on('terminal:report-active-session', (_event, sessionId: unknown) => {
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    lastActiveSessionId = sessionId
  }
})

ipcMain.handle('terminal:list-sessions', () => {
  return terminalManager.getSessions()
})

ipcMain.handle('terminal:send-to-active-session', (event, payload?: { code?: unknown }) => {
  assertMainWindowSender(event.sender)

  const code = typeof payload?.code === 'string' ? payload.code : ''
  if (!code) return { success: false }

  let sessionId: string | null = null
  let created = false

  if (lastActiveSessionId && terminalManager.hasSession(lastActiveSessionId)) {
    sessionId = lastActiveSessionId
  } else {
    sessionId = terminalManager.getFirstSessionId()
  }

  if (!sessionId) {
    const config = readConfig()
    const result = terminalManager.createSession(DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS, config.preferredShell)
    if (!result.created || !result.sessionId) {
      return { success: false, error: result.error ?? 'Failed to create terminal session' }
    }
    sessionId = result.sessionId
    lastActiveSessionId = sessionId
    created = true
    attachTerminalSubscriber(event.sender)
  }

  const isMultiLine = code.includes('\n')
  const wrapped = isMultiLine ? `\x1b[200~${code}\x1b[201~` : code

  terminalManager.write(sessionId, wrapped)
  event.sender.send('toggle-visibility', true, true)

  return { success: true, sessionId, created }
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

const faviconCache = new Map<string, string>()

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
    faviconCache.set(url, dataUrl)
    return dataUrl
  } catch {
    return ''
  }
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
  configureMcpProxy(resolveOpenAIProxyUrl(proxyUrl))
})

ipcMain.on('mark-onboarded', () => {
  updateConfig({ hasOnboarded: true })
})

ipcMain.on('update-auto-update', (_event, enabled: unknown) => {
  const isEnabled = enabled === true
  updateConfig({ autoUpdate: isEnabled })
  if (isEnabled) {
    checkForUpdatesManually()
  }
})

ipcMain.handle('check-for-updates', () => {
  checkForUpdatesManually()
  return getUpdateStatus()
})

ipcMain.handle('get-update-status', () => {
  return getUpdateStatus()
})

ipcMain.on('install-update', () => {
  quitAndInstallUpdate()
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

ipcMain.handle('test-mcp-server', async (_event, payload: {
  name?: string
  url?: string
  auth?: McpServer['auth']
  appendMcpSuffix?: boolean
}) => {
  const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
  const url = typeof payload?.url === 'string' ? payload.url.trim() : ''
  if (!name || !url) {
    return { ok: false, message: 'Server name and URL are required.', toolCount: 0 }
  }

  return testMcpServer({
    name,
    url,
    auth: payload?.auth ?? { type: 'none' },
    appendMcpSuffix: payload?.appendMcpSuffix ?? true,
    timeoutMs: 15_000
  })
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

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('theme-updated', nextTheme)
  }

  if (pasteWindow && !pasteWindow.isDestroyed()) {
    pasteWindow.webContents.send('theme-updated', nextTheme)
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
    const fonts = getTerminalFonts()
    const savedFont = normalizeTerminalFont(readConfig().terminalFont)
    const hasSavedFont = fonts.some((font) => font.toLowerCase() === savedFont.toLowerCase())
    return hasSavedFont ? fonts : [...fonts, savedFont].sort((a, b) => a.localeCompare(b))
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
    workflow: typeof buttonVisibility?.workflow === 'boolean' ? buttonVisibility.workflow : current.workflow,
    tasks: typeof buttonVisibility?.tasks === 'boolean' ? buttonVisibility.tasks : current.tasks
  }
  updateConfig({ buttonVisibility: nextButtonVisibility })

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('button-visibility-updated', nextButtonVisibility)
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('button-visibility-updated', nextButtonVisibility)
  }
})

ipcMain.on('update-launcher-show-system-apps', (_event, showSystemApps: boolean) => {
  const nextShowSystemApps = typeof showSystemApps === 'boolean'
    ? showSystemApps
    : DEFAULT_LAUNCHER_SHOW_SYSTEM_APPS
  updateConfig({ launcherShowSystemApps: nextShowSystemApps })
  clearInstalledAppsCache()
  warmInstalledAppsCache(nextShowSystemApps)

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('launcher-show-system-apps-updated', nextShowSystemApps)
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('launcher-show-system-apps-updated', nextShowSystemApps)
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

ipcMain.on('update-web-search', (_event, enableWebSearch: boolean) => {
  const nextWebSearch = typeof enableWebSearch === 'boolean' ? enableWebSearch : DEFAULT_ENABLE_WEB_SEARCH
  updateConfig({ enableWebSearch: nextWebSearch })

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('web-search-updated', nextWebSearch)
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('web-search-updated', nextWebSearch)
  }
})

ipcMain.on('update-auto-collapse-reasoning', (_event, autoCollapseReasoning: boolean) => {
  const nextAutoCollapse = typeof autoCollapseReasoning === 'boolean' ? autoCollapseReasoning : DEFAULT_AUTO_COLLAPSE_REASONING
  updateConfig({ autoCollapseReasoning: nextAutoCollapse })

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('auto-collapse-reasoning-updated', nextAutoCollapse)
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('auto-collapse-reasoning-updated', nextAutoCollapse)
  }
})

ipcMain.on('update-texture-intensity', (_event, textureIntensity: number) => {
  const nextTextureIntensity = normalizeTextureIntensity(textureIntensity)
  updateConfig({ textureIntensity: nextTextureIntensity })

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('texture-intensity-updated', nextTextureIntensity)
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('texture-intensity-updated', nextTextureIntensity)
  }
})

ipcMain.on('update-shortcuts', (_event, rawShortcuts: unknown) => {
  const shortcuts = normalizeShortcuts(rawShortcuts)
  updateConfig({ shortcuts })
  registerShortcuts(readConfig())

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shortcuts-updated', shortcuts)
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('shortcuts-updated', shortcuts)
  }
})

function broadcastPasteSettings(settings: PasteManagerSettings): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('paste:settings-updated', settings)
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('paste:settings-updated', settings)
  }
  if (pasteWindow && !pasteWindow.isDestroyed()) {
    pasteWindow.webContents.send('paste:settings-updated', settings)
  }
}

ipcMain.handle('paste:list', () => {
  return pasteManager?.list() ?? []
})

ipcMain.handle('paste:get-detail', (_event, rawId: unknown) => {
  const id = typeof rawId === 'string' ? rawId : ''
  if (!id || !pasteManager) return null
  return pasteManager.getDetail(id)
})

ipcMain.handle('paste:get-settings', () => {
  return readConfig().pasteManager
})

ipcMain.handle('paste:update-settings', (_event, rawPatch: unknown) => {
  if (!pasteManager) return readConfig().pasteManager
  const patch = rawPatch && typeof rawPatch === 'object' ? (rawPatch as Partial<PasteManagerSettings>) : {}
  const settings = pasteManager.updateSettings(patch)
  registerShortcuts(readConfig())
  broadcastPasteSettings(settings)
  return settings
})

ipcMain.handle('paste:set-pinned', (_event, payload: { id?: unknown; pinned?: unknown }) => {
  const id = typeof payload?.id === 'string' ? payload.id : ''
  if (!id || !pasteManager) return { success: false }
  return { success: pasteManager.setPinned(id, payload?.pinned === true) }
})

ipcMain.handle('paste:delete', async (_event, rawId: unknown) => {
  const id = typeof rawId === 'string' ? rawId : ''
  if (!id || !pasteManager) return { success: false }
  return { success: await pasteManager.delete(id) }
})

ipcMain.handle('paste:clear', async (_event, rawKeepPinned: unknown) => {
  if (!pasteManager) return { removed: 0 }
  const removed = await pasteManager.clear(rawKeepPinned === true)
  return { removed }
})

ipcMain.handle('paste:copy', async (_event, payload: { id?: unknown; asPlainText?: unknown }) => {
  const id = typeof payload?.id === 'string' ? payload.id : ''
  if (!id || !pasteManager) return { success: false }
  const success = await pasteManager.copy(id, payload?.asPlainText === true)
  return { success }
})

ipcMain.handle('paste:save-image', async (_event, rawId: unknown) => {
  const id = typeof rawId === 'string' ? rawId : ''
  const meta = pasteManager?.getMeta(id)
  if (!pasteManager || !meta || meta.type !== 'image') {
    return { success: false }
  }

  const defaultName = `${(meta.preview || 'clipboard-image').replace(/[\\/:*?"<>|]/g, '_')}.png`
  const options = {
    title: 'Save image',
    defaultPath: defaultName,
    filters: [{ name: 'PNG image', extensions: ['png'] }]
  }

  suppressPasteBlur = true
  try {
    const result =
      pasteWindow && !pasteWindow.isDestroyed()
        ? await dialog.showSaveDialog(pasteWindow, options)
        : await dialog.showSaveDialog(options)

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    const success = await pasteManager.saveImage(id, result.filePath)
    return { success, path: result.filePath }
  } finally {
    suppressPasteBlur = false
  }
})

ipcMain.on('paste:hide-window', () => {
  hidePasteWindow()
})

ipcMain.on('paste:ask-in-chat', (_event, rawText: unknown) => {
  const text = typeof rawText === 'string' ? rawText.trim() : ''
  if (!text) return

  hidePasteWindow()
  showWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('covenant:chat-prompt', text)
  }
})

ipcMain.on('covenant:chat-cancel', (_event, streamId: string) => {
  if (typeof streamId !== 'string') return
  activeChatStreams.get(streamId)?.abort()
})

ipcMain.handle('covenant:chat-stream', async (event, rawMessages: Array<{ role?: string; content?: string | Array<{ type: string; text?: string; image_url?: string }> }>) => {
  const sanitizedMessages = Array.isArray(rawMessages)
    ? rawMessages
        .map((message) => {
          const role = typeof message.role === 'string' ? message.role.trim() : ''
          if (!CHAT_ROLE_SET.has(role as ChatRole)) return null
          const content = message.content
          if (content == null) return null
          if (typeof content === 'string') {
            const trimmed = content.trim()
            if (!trimmed) return null
            return { role: role as ChatRole, content: trimmed }
          }
          if (Array.isArray(content) && content.length > 0) {
            return { role: role as ChatRole, content }
          }
          return null
        })
        .filter((message) => message != null) as SanitizedMessage[]
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
  const chatModel = storedConfig.chatModel || DEFAULT_CHAT_MODEL
  const enableWebSearch = storedConfig.enableWebSearch ?? DEFAULT_ENABLE_WEB_SEARCH
  const doesWebSearch = enableWebSearch && modelSupportsWebSearch(chatModel)

  const tools: Array<Record<string, unknown>> = []
  if (doesWebSearch) {
    tools.push({ type: 'web_search' })
  }
  tools.push(...buildOpenAIToolDefinitions(toolRegistry))

  const input = buildResponsesInput(sanitizedMessages)
  const params = buildResponseParams(storedConfig, chatModel)

  const controller = new AbortController()
  activeChatStreams.set(streamId, controller)

  void runStreamingChat(
    { client, streamId, sender, model: chatModel, sendStreamEvent, signal: controller.signal },
    input,
    tools,
    params,
    toolRegistry
  ).finally(() => {
    activeChatStreams.delete(streamId)
  })

  return { id: streamId }
})

ipcMain.handle('covenant:chat', async (_event, rawMessages: Array<{ role?: string; content?: string | Array<{ type: string; text?: string; image_url?: string }> }>) => {
  const sanitizedMessages = Array.isArray(rawMessages)
    ? rawMessages
        .map((message) => {
          const role = typeof message.role === 'string' ? message.role.trim() : ''
          if (!CHAT_ROLE_SET.has(role as ChatRole)) return null
          const content = message.content
          if (content == null) return null
          if (typeof content === 'string') {
            const trimmed = content.trim()
            if (!trimmed) return null
            return { role: role as ChatRole, content: trimmed }
          }
          if (Array.isArray(content) && content.length > 0) {
            return { role: role as ChatRole, content }
          }
          return null
        })
        .filter((message) => message != null) as SanitizedMessage[]
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

  const input = buildResponsesInput(sanitizedMessages)
  const params = buildResponseParams(storedConfig, chatModel)

  const response = await client.responses.create({
    model: chatModel,
    input: input as unknown[],
    ...(params as Record<string, unknown>)
  } as any)
  return (response as any).output_text?.trim() || 'No response from model.'
})

ipcMain.handle('voice:transcribe', async (_event, audioBuffer: ArrayBuffer) => {
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

  const file = new File([Buffer.from(audioBuffer)], 'audio.webm', { type: 'audio/webm' })
  const transcription = await client.audio.transcriptions.create({
    model: 'gpt-4o-mini-transcribe',
    file,
    response_format: 'text'
  })

  return typeof transcription === 'string' ? transcription : (transcription as unknown as { text: string }).text
})
