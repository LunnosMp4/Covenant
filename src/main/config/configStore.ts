import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppConfig } from '../../shared/config'
import {
  DEFAULT_AUTO_COLLAPSE_REASONING,
  DEFAULT_BUTTON_VISIBILITY,
  DEFAULT_CHAT_MODEL,
  DEFAULT_CODE_SETTINGS,
  DEFAULT_ENABLE_WEB_SEARCH,
  DEFAULT_LAUNCHER_SHOW_SYSTEM_APPS,
  DEFAULT_NOTES_SETTINGS,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_SHORTCUTS,
  DEFAULT_TEXTURE_INTENSITY,
  normalizeAdminApiKey,
  normalizeChatModelId,
  normalizeCodeSettings,
  normalizeNotesSettings,
  normalizeShortcuts,
  normalizeTextureIntensity,
  normalizeUsageProjectId
} from '../../shared/config'
import { DEFAULT_PASTE_SETTINGS, normalizePasteManagerSettings } from '../../shared/paste/paste'
import {
  DEFAULT_THEME_GRADIENT,
  normalizeThemeGradient
} from '../../shared/theme/theme'
import { normalizeStoredMcpServers } from '../services/mcpNormalizers'

export const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  adminApiKey: '',
  usageProjectId: '',
  themeGradient: DEFAULT_THEME_GRADIENT,
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
  notes: { ...DEFAULT_NOTES_SETTINGS },
  code: { ...DEFAULT_CODE_SETTINGS, permission: { ...DEFAULT_CODE_SETTINGS.permission } },
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
    workflow: typeof obj.workflow === 'boolean' ? obj.workflow : DEFAULT_BUTTON_VISIBILITY.workflow,
    tasks: typeof obj.tasks === 'boolean' ? obj.tasks : DEFAULT_BUTTON_VISIBILITY.tasks,
    notes: typeof obj.notes === 'boolean' ? obj.notes : DEFAULT_BUTTON_VISIBILITY.notes,
    code: typeof obj.code === 'boolean' ? obj.code : DEFAULT_BUTTON_VISIBILITY.code
  }
}

export function normalizeConfig(rawConfig: Partial<AppConfig> | null | undefined): AppConfig {
  return {
    apiKey: typeof rawConfig?.apiKey === 'string' ? rawConfig.apiKey : DEFAULT_CONFIG.apiKey,
    adminApiKey: normalizeAdminApiKey(rawConfig?.adminApiKey),
    usageProjectId: normalizeUsageProjectId(rawConfig?.usageProjectId),
    themeGradient: normalizeThemeGradient(rawConfig?.themeGradient),
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
    notes: normalizeNotesSettings(rawConfig?.notes),
    code: normalizeCodeSettings(rawConfig?.code),
    hasOnboarded:
      typeof rawConfig?.hasOnboarded === 'boolean' ? rawConfig.hasOnboarded : false,
    autoUpdate:
      typeof rawConfig?.autoUpdate === 'boolean' ? rawConfig.autoUpdate : true
  }
}

/**
 * Process-local cache of the config file.
 *
 * `readConfig()` used to re-read, normalize and *rewrite* the config file on
 * every call. The clipboard watcher alone calls it every 400ms, which turned
 * into a constant synchronous read+write loop on the main process. The cache
 * keeps reads cheap and only hits the disk when the file actually changed
 * (detected through its mtime), so external edits are still picked up.
 */
let cachedConfig: AppConfig | null = null
let cachedConfigMtimeMs: number | null = null
/** Tracks whether the on-disk file was normalised once in this process. */
let configFileAligned = false

function readConfigMtimeMs(configPath: string): number | null {
  try {
    return statSync(configPath).mtimeMs
  } catch {
    return null
  }
}

export function writeConfig(config: AppConfig): void {
  const configPath = getConfigPath()
  const userDataDirectory = app.getPath('userData')

  if (!existsSync(userDataDirectory)) {
    mkdirSync(userDataDirectory, { recursive: true })
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf-8' })
  cachedConfig = config
  cachedConfigMtimeMs = readConfigMtimeMs(configPath)
}

export function readConfig(): AppConfig {
  const configPath = getConfigPath()

  try {
    const mtimeMs = readConfigMtimeMs(configPath)
    if (cachedConfig && mtimeMs !== null && mtimeMs === cachedConfigMtimeMs) {
      return cachedConfig
    }

    if (!existsSync(configPath)) {
      writeConfig(DEFAULT_CONFIG)
      configFileAligned = true
      return DEFAULT_CONFIG
    }

    const rawFile = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(rawFile) as Partial<AppConfig>
    const normalized = normalizeConfig(parsed)

    cachedConfig = normalized
    cachedConfigMtimeMs = mtimeMs

    // Keep the file schema aligned when new defaults are introduced, but only
    // once per process instead of on every read.
    if (!configFileAligned) {
      configFileAligned = true
      writeConfig(normalized)
    }

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
