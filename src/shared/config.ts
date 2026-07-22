import type { McpServer } from './mcp'

export interface ButtonVisibility {
  appLauncher: boolean
  workflow: boolean
}

export type ReasoningEffort = 'low' | 'medium' | 'high'

export interface ChatModelOption {
  id: string
  label: string
  supportsExtendedParams: boolean
  maxContextTokens: number
}

export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', supportsExtendedParams: false, maxContextTokens: 128000 },
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', supportsExtendedParams: true, maxContextTokens: 400000 },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', supportsExtendedParams: true, maxContextTokens: 1050000 },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', supportsExtendedParams: true, maxContextTokens: 1050000 }
]

export const REASONING_EFFORT_OPTIONS: ReasoningEffort[] = ['low', 'medium', 'high']

export const DEFAULT_CHAT_MODEL = 'gpt-5.4-nano'
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'low'

export const DEFAULT_BUTTON_VISIBILITY: ButtonVisibility = {
  appLauncher: true,
  workflow: true
}

export function getModelCapabilities(modelId: string): ChatModelOption | undefined {
  return CHAT_MODEL_OPTIONS.find((option) => option.id === modelId)
}

export function modelSupportsExtendedParams(modelId: string): boolean {
  return getModelCapabilities(modelId)?.supportsExtendedParams ?? false
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
}
