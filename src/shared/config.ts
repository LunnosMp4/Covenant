import type { McpServer } from './mcp/mcp'
import { DEFAULT_PASTE_SETTINGS, normalizePasteManagerSettings, type PasteManagerSettings } from './paste/paste'
import { DEFAULT_CODE_SETTINGS, type CodeSettings } from './code/code'
import { normalizeCodeSettings } from './code/codeNormalizers'

export interface ButtonVisibility {
  appLauncher: boolean
  workflow: boolean
  tasks: boolean
  code: boolean
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
export const DEFAULT_TEXTURE_INTENSITY = 0
export const MAX_TEXTURE_INTENSITY = 100
// Slider value 100 maps to this effective overlay opacity (keeps the effect subtle).
export const TEXTURE_MAX_OPACITY = 0.6

export function normalizeTextureIntensity(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_TEXTURE_INTENSITY
  return Math.max(0, Math.min(MAX_TEXTURE_INTENSITY, Math.round(numeric)))
}

export const DEFAULT_BUTTON_VISIBILITY: ButtonVisibility = {
  appLauncher: true,
  workflow: true,
  tasks: true,
  code: true
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

export function modelSupportsTemperature(modelId: string): boolean {
  return !modelDoesReasoning(modelId)
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
  openPaste: string
  openCode: string
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  openApp: 'Alt+Space',
  openAppTerminal: 'Alt+T',
  openTasks: 'Alt+L',
  openPaste: 'Alt+V',
  openCode: 'Alt+C'
}

export function normalizeAdminApiKey(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeUsageProjectId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeShortcuts(raw: unknown): ShortcutConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SHORTCUTS }
  const obj = raw as Record<string, unknown>
  const openPaste = typeof obj.openPaste === 'string' ? obj.openPaste : DEFAULT_SHORTCUTS.openPaste
  return {
    openApp: typeof obj.openApp === 'string' ? obj.openApp : DEFAULT_SHORTCUTS.openApp,
    openAppTerminal: typeof obj.openAppTerminal === 'string' ? obj.openAppTerminal : DEFAULT_SHORTCUTS.openAppTerminal,
    openTasks: typeof obj.openTasks === 'string' ? obj.openTasks : DEFAULT_SHORTCUTS.openTasks,
    // Migrate the previous default (`Ctrl+Alt+V`) to the new one.
    openPaste: openPaste === 'Ctrl+Alt+V' ? DEFAULT_SHORTCUTS.openPaste : openPaste,
    openCode: typeof obj.openCode === 'string' ? obj.openCode : DEFAULT_SHORTCUTS.openCode
  }
}

export interface AppConfig {
  apiKey: string
  adminApiKey?: string
  usageProjectId?: string
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
  textureIntensity: number
  pasteManager: PasteManagerSettings
  code: CodeSettings
  hasOnboarded?: boolean
  autoUpdate?: boolean
}

export { DEFAULT_PASTE_SETTINGS, normalizePasteManagerSettings }
export type { PasteManagerSettings }
export { DEFAULT_CODE_SETTINGS, normalizeCodeSettings }
export type { CodeSettings }
