import type { McpServer } from './mcp'

export interface ButtonVisibility {
  appLauncher: boolean
  workflow: boolean
  tasks: boolean
}

export type ReasoningEffort = 'low' | 'medium' | 'high'

export interface ChatModelOption {
  id: string
  label: string
  supportsExtendedParams: boolean
  maxContextTokens: number
}

export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', supportsExtendedParams: true, maxContextTokens: 1050000 },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', supportsExtendedParams: true, maxContextTokens: 1050000 }
]

export const REASONING_EFFORT_OPTIONS: ReasoningEffort[] = ['low', 'medium', 'high']

export const DEFAULT_CHAT_MODEL = 'gpt-6-luna'

const LEGACY_CHAT_MODEL_IDS: Record<string, string> = {
  'gpt-5.6-luna': 'gpt-6-luna',
  'gpt-5.6-terra': 'gpt-6.1-sol'
}

export function normalizeChatModelId(modelId: string | undefined): string {
  if (typeof modelId !== 'string' || !modelId.trim()) {
    return DEFAULT_CHAT_MODEL
  }
  const trimmed = modelId.trim()
  return LEGACY_CHAT_MODEL_IDS[trimmed] ?? trimmed
}
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'low'
export const DEFAULT_ENABLE_WEB_SEARCH = true
export const DEFAULT_AUTO_COLLAPSE_REASONING = true
export const DEFAULT_LAUNCHER_SHOW_SYSTEM_APPS = false

export const DEFAULT_BUTTON_VISIBILITY: ButtonVisibility = {
  appLauncher: true,
  workflow: true,
  tasks: true
}

export function getModelCapabilities(modelId: string): ChatModelOption | undefined {
  return CHAT_MODEL_OPTIONS.find((option) => option.id === modelId)
}

export function modelSupportsExtendedParams(modelId: string): boolean {
  return getModelCapabilities(modelId)?.supportsExtendedParams ?? false
}

const REASONING_MODEL_PREFIXES = ['gpt-5', 'gpt-6', 'o1', 'o3', 'o4']

export function modelDoesReasoning(modelId: string): boolean {
  const lower = modelId.toLowerCase()
  return REASONING_MODEL_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

export function modelSupportsWebSearch(modelId: string): boolean {
  const lower = modelId.toLowerCase()
  return REASONING_MODEL_PREFIXES.some((prefix) => lower.startsWith(prefix)) ||
    lower.startsWith('gpt-4o')
}

export interface ShortcutConfig {
  openApp: string
  openAppTerminal: string
  openTasks: string
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  openApp: 'Alt+Space',
  openAppTerminal: 'Alt+T',
  openTasks: 'Alt+L'
}

export function normalizeShortcuts(raw: unknown): ShortcutConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SHORTCUTS }
  const obj = raw as Record<string, unknown>
  return {
    openApp: typeof obj.openApp === 'string' ? obj.openApp : DEFAULT_SHORTCUTS.openApp,
    openAppTerminal: typeof obj.openAppTerminal === 'string' ? obj.openAppTerminal : DEFAULT_SHORTCUTS.openAppTerminal,
    openTasks: typeof obj.openTasks === 'string' ? obj.openTasks : DEFAULT_SHORTCUTS.openTasks
  }
}

export interface AppConfig {
  apiKey: string
  themeGradient: string
  proxyUrl: string
  launchOnStartup: boolean
  terminalFont: string
  preferredShell?: string
  mcpServers: McpServer[]
  buttonVisibility: ButtonVisibility
  chatModel: string
  reasoningEffort: ReasoningEffort
  enableWebSearch: boolean
  autoCollapseReasoning: boolean
  launcherShowSystemApps: boolean
  shortcuts: ShortcutConfig
  hasOnboarded?: boolean
  autoUpdate?: boolean
}
