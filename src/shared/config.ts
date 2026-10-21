import type { McpServer } from './mcp/mcp'
import { DEFAULT_PASTE_SETTINGS, normalizePasteManagerSettings, type PasteManagerSettings } from './paste/paste'
import { DEFAULT_CODE_SETTINGS, type CodeSettings } from './code/code'
import { normalizeCodeSettings } from './code/codeNormalizers'

export interface ButtonVisibility {
  workflow: boolean
  tasks: boolean
  notes: boolean
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
  workflow: true,
  tasks: true,
  notes: true,
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

export type TranscriptionModel =
  | 'gpt-4o-transcribe-diarize'
  | 'gpt-4o-transcribe'
  | 'whisper-1'

export interface TranscriptionModelOption {
  id: TranscriptionModel
  label: string
  description: string
}

export const TRANSCRIPTION_MODEL_OPTIONS: TranscriptionModelOption[] = [
  {
    id: 'gpt-4o-transcribe-diarize',
    label: 'GPT-4o Transcribe Diarize',
    description: 'Transcribes and identifies who is speaking. Recommended for meetings.'
  },
  {
    id: 'gpt-4o-transcribe',
    label: 'GPT-4o Transcribe',
    description: 'Higher accuracy without speaker labels.'
  },
  {
    id: 'whisper-1',
    label: 'Whisper v1',
    description: 'Legacy transcription model without speaker labels.'
  }
]

export interface NotesSettings {
  /** Capture system audio by default when starting a meeting. */
  captureSystemAudio: boolean
  /** Keep the recorded audio files after transcription. */
  keepAudio: boolean
  transcriptionModel: TranscriptionModel
  /** ISO-639-1 language code, or empty for auto-detection. */
  transcriptionLanguage: string
  /** Model used to generate the meeting recap. Empty = current chat model. */
  summaryModel: string
  /** Optional custom recap instructions. Empty = built-in prompt. */
  summaryPrompt: string
}

export const DEFAULT_NOTES_SETTINGS: NotesSettings = {
  captureSystemAudio: true,
  keepAudio: true,
  transcriptionModel: 'gpt-4o-transcribe-diarize',
  transcriptionLanguage: '',
  summaryModel: '',
  summaryPrompt: ''
}

export function normalizeNotesSettings(raw: unknown): NotesSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const transcriptionModel =
    typeof obj.transcriptionModel === 'string' &&
    TRANSCRIPTION_MODEL_OPTIONS.some((option) => option.id === obj.transcriptionModel)
      ? (obj.transcriptionModel as TranscriptionModel)
      : DEFAULT_NOTES_SETTINGS.transcriptionModel
  const language =
    typeof obj.transcriptionLanguage === 'string'
      ? obj.transcriptionLanguage.trim().slice(0, 12)
      : DEFAULT_NOTES_SETTINGS.transcriptionLanguage

  return {
    captureSystemAudio:
      typeof obj.captureSystemAudio === 'boolean'
        ? obj.captureSystemAudio
        : DEFAULT_NOTES_SETTINGS.captureSystemAudio,
    keepAudio:
      typeof obj.keepAudio === 'boolean' ? obj.keepAudio : DEFAULT_NOTES_SETTINGS.keepAudio,
    transcriptionModel,
    transcriptionLanguage: language,
    summaryModel:
      typeof obj.summaryModel === 'string' ? obj.summaryModel.trim() : DEFAULT_NOTES_SETTINGS.summaryModel,
    summaryPrompt:
      typeof obj.summaryPrompt === 'string'
        ? obj.summaryPrompt.slice(0, 20_000)
        : DEFAULT_NOTES_SETTINGS.summaryPrompt
  }
}

export interface ShortcutConfig {
  openApp: string
  openLastConversation: string
  openAppTerminal: string
  openTasks: string
  openPaste: string
  openNotes: string
  openCode: string
  toggleCodeMode: string
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  openApp: 'Alt+Space',
  openLastConversation: 'Ctrl+Alt+Space',
  openAppTerminal: 'Alt+T',
  openTasks: 'Alt+L',
  openPaste: 'Alt+V',
  openNotes: 'Alt+N',
  openCode: 'Alt+C',
  toggleCodeMode: 'Alt+M'
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
    openLastConversation:
      typeof obj.openLastConversation === 'string'
        ? obj.openLastConversation
        : DEFAULT_SHORTCUTS.openLastConversation,
    openAppTerminal: typeof obj.openAppTerminal === 'string' ? obj.openAppTerminal : DEFAULT_SHORTCUTS.openAppTerminal,
    openTasks: typeof obj.openTasks === 'string' ? obj.openTasks : DEFAULT_SHORTCUTS.openTasks,
    // Migrate the previous default (`Ctrl+Alt+V`) to the new one.
    openPaste: openPaste === 'Ctrl+Alt+V' ? DEFAULT_SHORTCUTS.openPaste : openPaste,
    openNotes: typeof obj.openNotes === 'string' ? obj.openNotes : DEFAULT_SHORTCUTS.openNotes,
    openCode: typeof obj.openCode === 'string' ? obj.openCode : DEFAULT_SHORTCUTS.openCode,
    toggleCodeMode:
      typeof obj.toggleCodeMode === 'string' ? obj.toggleCodeMode : DEFAULT_SHORTCUTS.toggleCodeMode
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
  notes: NotesSettings
  code: CodeSettings
  hasOnboarded?: boolean
  autoUpdate?: boolean
}

export { DEFAULT_PASTE_SETTINGS, normalizePasteManagerSettings }
export type { PasteManagerSettings }
export { DEFAULT_CODE_SETTINGS, normalizeCodeSettings }
export type { CodeSettings }
