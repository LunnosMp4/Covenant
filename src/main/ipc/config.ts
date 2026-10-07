import { app, ipcMain } from 'electron'
import type { AppConfig } from '../../shared/config'
import {
  DEFAULT_AUTO_COLLAPSE_REASONING,
  DEFAULT_CHAT_MODEL,
  DEFAULT_ENABLE_WEB_SEARCH,
  DEFAULT_LAUNCHER_SHOW_SYSTEM_APPS,
  DEFAULT_REASONING_EFFORT,
  normalizeShortcuts,
  normalizeTextureIntensity
} from '../../shared/config'
import { DEFAULT_CONFIG, normalizeTerminalFont, readConfig, updateConfig } from '../config/configStore'
import { getTerminalFonts } from '../fontManager'
import { clearInstalledAppsCache, warmInstalledAppsCache } from '../installedApps'
import { configureMcpProxy } from '../services/mcpClient'
import { applySessionProxy, resolveOpenAIProxyUrl } from '../proxy'
import { checkForUpdatesManually, getUpdateStatus, quitAndInstallUpdate } from '../updater'
import { registerShortcuts } from '../windows'
import { broadcast, sendToPaste } from '../windows/broadcast'

const isWindows = process.platform === 'win32'
const VALID_REASONING_EFFORTS = ['low', 'medium', 'high']

export function registerConfigIpc(): void {
  ipcMain.handle('get-config', () => {
    return readConfig()
  })

  ipcMain.on('save-api-key', (_event, key: string) => {
    const apiKey = typeof key === 'string' ? key.trim() : ''
    updateConfig({ apiKey })
  })

  ipcMain.on('save-openai-settings', (_event, payload: { apiKey?: string; proxyUrl?: string; adminApiKey?: string }) => {
    // Only patch fields the renderer actually sends. The command bar's OpenAI
    // key save and the Usage tab's admin key save share this channel, so treating
    // an absent field as an empty string would wipe the sibling key.
    const patch: Partial<AppConfig> = {}
    if (typeof payload?.apiKey === 'string') patch.apiKey = payload.apiKey.trim()
    if (typeof payload?.proxyUrl === 'string') patch.proxyUrl = payload.proxyUrl.trim()
    if (typeof payload?.adminApiKey === 'string') patch.adminApiKey = payload.adminApiKey.trim()

    const merged = updateConfig(patch)
    const resolvedProxyUrl = resolveOpenAIProxyUrl(merged.proxyUrl)
    configureMcpProxy(resolvedProxyUrl)
    void applySessionProxy(resolvedProxyUrl)
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

  ipcMain.on('update-theme', (_event, gradientClass: string) => {
    const nextTheme =
      typeof gradientClass === 'string' && gradientClass.trim()
        ? gradientClass.trim()
        : DEFAULT_CONFIG.themeGradient

    updateConfig({ themeGradient: nextTheme })
    broadcast('theme-updated', nextTheme)
    sendToPaste('theme-updated', nextTheme)
  })

  ipcMain.on('update-terminal-font', (_event, terminalFont: string) => {
    const nextTerminalFont = normalizeTerminalFont(terminalFont)
    updateConfig({ terminalFont: nextTerminalFont })
    broadcast('terminal-font-updated', nextTerminalFont)
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
      tasks: typeof buttonVisibility?.tasks === 'boolean' ? buttonVisibility.tasks : current.tasks,
      code: typeof buttonVisibility?.code === 'boolean' ? buttonVisibility.code : current.code
    }
    updateConfig({ buttonVisibility: nextButtonVisibility })
    broadcast('button-visibility-updated', nextButtonVisibility)
  })

  ipcMain.on('update-launcher-show-system-apps', (_event, showSystemApps: boolean) => {
    const nextShowSystemApps = typeof showSystemApps === 'boolean'
      ? showSystemApps
      : DEFAULT_LAUNCHER_SHOW_SYSTEM_APPS
    updateConfig({ launcherShowSystemApps: nextShowSystemApps })
    clearInstalledAppsCache()
    warmInstalledAppsCache(nextShowSystemApps)
    broadcast('launcher-show-system-apps-updated', nextShowSystemApps)
  })

  ipcMain.on('update-chat-model', (_event, chatModel: string) => {
    const nextChatModel = typeof chatModel === 'string' && chatModel.trim() ? chatModel.trim() : DEFAULT_CHAT_MODEL
    updateConfig({ chatModel: nextChatModel })
    broadcast('chat-model-updated', nextChatModel)
  })

  ipcMain.on('update-reasoning-effort', (_event, reasoningEffort: string) => {
    const nextReasoningEffort = typeof reasoningEffort === 'string' && VALID_REASONING_EFFORTS.includes(reasoningEffort)
      ? reasoningEffort as AppConfig['reasoningEffort']
      : DEFAULT_REASONING_EFFORT
    updateConfig({ reasoningEffort: nextReasoningEffort })
    broadcast('reasoning-effort-updated', nextReasoningEffort)
  })

  ipcMain.on('update-web-search', (_event, enableWebSearch: boolean) => {
    const nextWebSearch = typeof enableWebSearch === 'boolean' ? enableWebSearch : DEFAULT_ENABLE_WEB_SEARCH
    updateConfig({ enableWebSearch: nextWebSearch })
  })

  ipcMain.on('update-auto-collapse-reasoning', (_event, autoCollapseReasoning: boolean) => {
    const nextAutoCollapse = typeof autoCollapseReasoning === 'boolean' ? autoCollapseReasoning : DEFAULT_AUTO_COLLAPSE_REASONING
    updateConfig({ autoCollapseReasoning: nextAutoCollapse })
    broadcast('auto-collapse-reasoning-updated', nextAutoCollapse)
  })

  ipcMain.on('update-texture-intensity', (_event, textureIntensity: number) => {
    const nextTextureIntensity = normalizeTextureIntensity(textureIntensity)
    updateConfig({ textureIntensity: nextTextureIntensity })
    broadcast('texture-intensity-updated', nextTextureIntensity)
  })

  ipcMain.on('update-shortcuts', (_event, rawShortcuts: unknown) => {
    const shortcuts = normalizeShortcuts(rawShortcuts)
    updateConfig({ shortcuts })
    registerShortcuts(readConfig())
    broadcast('shortcuts-updated', shortcuts)
  })
}
