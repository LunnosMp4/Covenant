import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppConfig } from '../../shared/config'
import {
  DEFAULT_AUTO_COLLAPSE_REASONING,
  DEFAULT_BUTTON_VISIBILITY,
  DEFAULT_CHAT_MODEL,
  DEFAULT_ENABLE_WEB_SEARCH,
  DEFAULT_LAUNCHER_SHOW_SYSTEM_APPS,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_SHORTCUTS,
  DEFAULT_TEXTURE_INTENSITY,
  normalizeAdminApiKey,
  normalizeChatModelId,
  normalizeShortcuts,
  normalizeTextureIntensity,
  normalizeUsageProjectId
} from '../../shared/config'
import { DEFAULT_PASTE_SETTINGS, normalizePasteManagerSettings } from '../../shared/paste/paste'
import { normalizeStoredMcpServers } from '../services/mcpNormalizers'

export const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  adminApiKey: '',
  usageProjectId: '',
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

export function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function extractTerminalFontFamily(fontFamily: string): string {
  const primaryFont = fontFamily.trim().split(',')[0] ?? ''
  return primaryFont.replace(/^['"]|['"]$/g, '').trim()
}

export function normalizeTerminalFont(rawFont: unknown): string {
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

export function normalizeButtonVisibility(raw: unknown): AppConfig['buttonVisibility'] {
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

export function normalizeConfig(rawConfig: Partial<AppConfig> | null | undefined): AppConfig {
  return {
    apiKey: typeof rawConfig?.apiKey === 'string' ? rawConfig.apiKey : DEFAULT_CONFIG.apiKey,
    adminApiKey: normalizeAdminApiKey(rawConfig?.adminApiKey),
    usageProjectId: normalizeUsageProjectId(rawConfig?.usageProjectId),
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

export function writeConfig(config: AppConfig): void {
  const configPath = getConfigPath()
  const userDataDirectory = app.getPath('userData')

  if (!existsSync(userDataDirectory)) {
    mkdirSync(userDataDirectory, { recursive: true })
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf-8' })
}

export function readConfig(): AppConfig {
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

export function updateConfig(configPatch: Partial<AppConfig>): AppConfig {
  const current = readConfig()
  const merged = normalizeConfig({ ...current, ...configPatch })
  writeConfig(merged)
  return merged
}
