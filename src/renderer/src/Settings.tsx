import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useAnimationControls, type Transition } from 'framer-motion'
import { WINDOW_ENTER_TRANSITION, WINDOW_EXIT_TRANSITION } from './constants/motion'
import AppFormModal from './settings/modals/AppFormModal'
import ConfirmDeleteModal from './ui/ConfirmDeleteModal'
import CustomSelect from './ui/CustomSelect'
import McpServerFormModal from './settings/modals/McpServerFormModal'
import McpServersTab, { type McpPreset } from './settings/tabs/McpServersTab'
import PrepromptFormModal from './settings/modals/PrepromptFormModal'
import WorkflowFormModal from './workflow/WorkflowFormModal'
import PasteSettingsTab from './paste/PasteSettingsTab'
import UsageTab from './settings/tabs/UsageTab'
import {
  DEFAULT_TERMINAL_FONT,
  normalizeTerminalFont
} from './constants/terminalFonts'
import {
  DEFAULT_THEME_GRADIENT,
  THEME_OPTIONS,
  getThemeMode,
  normalizeThemeGradient
} from './constants/theme'
import type { AppConfig, ButtonVisibility, ReasoningEffort, ShortcutConfig } from '../../shared/config'
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL, DEFAULT_REASONING_EFFORT, DEFAULT_SHORTCUTS, DEFAULT_TEXTURE_INTENSITY, MAX_TEXTURE_INTENSITY, REASONING_EFFORT_OPTIONS, TEXTURE_MAX_OPACITY, modelSupportsExtendedParams, modelSupportsWebSearch } from '../../shared/config'
import type { UpdateStatus } from '../../shared/system/update'
import {
  DEFAULT_PASTE_SETTINGS,
  normalizePasteManagerSettings,
  type PasteManagerSettings
} from '../../shared/paste/paste'
import type { McpServer } from '../../shared/mcp/mcp'
import type { LauncherApp } from './types/renderer'
import type { Preprompt } from './types/renderer'
import type { Workflow } from './types/renderer'
import { getAppBadgeText } from './utils/helpers'
import { formatTargetsSummary, normalizeLaunchTargets } from './utils/launcher/launcherTargets'
import {
  SETTINGS_NAV_GROUPS,
  SETTINGS_WINDOW_ENTER_TRANSITION,
  SETTINGS_WINDOW_EXIT_TRANSITION,
  VALID_SETTINGS_TABS,
  getInitialTab,
  isSettingsTab,
  type SettingsTab
} from './settings/constants'
import { SidebarGlyph, MinimizeIcon, CloseIcon } from './settings/icons'
import { MinimalistToggle, SectionCard } from './settings/primitives'
import { ShortcutRecorder } from './settings/shortcutRecorder'
import AppearanceTab from './settings/tabs/AppearanceTab'
import GeneralTab from './settings/tabs/GeneralTab'
import TerminalTab from './settings/tabs/TerminalTab'
import AppLauncherTab from './settings/tabs/AppLauncherTab'
import WorkflowsTab from './settings/tabs/WorkflowsTab'
import PrepromptsTab from './settings/tabs/PrepromptsTab'
import CodeTab from './settings/tabs/CodeTab'
import { DEFAULT_CODE_SETTINGS, type CodeModel, type CodeSettings, type CodeStatus } from '../../shared/code/code'













export default function Settings(): JSX.Element {
  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialTab)
  const [apiKey, setApiKey] = useState('')
  const [adminApiKey, setAdminApiKey] = useState('')
  const [usageProjectId, setUsageProjectId] = useState('')
  const [proxyUrl, setProxyUrl] = useState('')
  const [isConfigLoaded, setIsConfigLoaded] = useState(false)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState(DEFAULT_THEME_GRADIENT)
  const [launchOnStartup, setLaunchOnStartup] = useState(true)
  const [terminalFont, setTerminalFont] = useState(DEFAULT_TERMINAL_FONT)
  const [preferredShell, setPreferredShell] = useState<string | undefined>(undefined)
  const [isSavingApiKey, setIsSavingApiKey] = useState(false)
  const [saveFeedbackMessage, setSaveFeedbackMessage] = useState('')
  const [isSavingAdminKey, setIsSavingAdminKey] = useState(false)
  const [adminKeyFeedbackMessage, setAdminKeyFeedbackMessage] = useState('')
  const [chatModel, setChatModel] = useState(DEFAULT_CHAT_MODEL)
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT)
  const [enableWebSearch, setEnableWebSearch] = useState(true)
  const [autoCollapseReasoning, setAutoCollapseReasoning] = useState(true)
  const [textureIntensity, setTextureIntensity] = useState(DEFAULT_TEXTURE_INTENSITY)
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle', currentVersion: '' })
  const [buttonVisibility, setButtonVisibility] = useState<ButtonVisibility>({ appLauncher: true, workflow: true, tasks: true, code: true })
  const [launcherShowSystemApps, setLauncherShowSystemApps] = useState(false)
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>({ ...DEFAULT_SHORTCUTS })
  const [pasteSettings, setPasteSettings] = useState<PasteManagerSettings>({ ...DEFAULT_PASTE_SETTINGS })
  const [codeSettings, setCodeSettings] = useState<CodeSettings>({ ...DEFAULT_CODE_SETTINGS })
  const [codeStatus, setCodeStatus] = useState<(CodeStatus & { hasApiKey: boolean }) | null>(null)
  const [codeModels, setCodeModels] = useState<CodeModel[]>([])
  const [pasteFeedbackMessage, setPasteFeedbackMessage] = useState('')
  const [mcpServers, setMcpServers] = useState<McpServer[]>([])
  const [isMcpServersLoading, setIsMcpServersLoading] = useState(false)
  const [mcpFeedbackMessage, setMcpFeedbackMessage] = useState('')
  const [isMcpFormOpen, setIsMcpFormOpen] = useState(false)
  const [editingMcpServer, setEditingMcpServer] = useState<McpServer | undefined>(undefined)
  const [mcpFormSeed, setMcpFormSeed] = useState<{
    name: string
    url: string
    description: string
    authType: McpServer['auth']['type']
  } | undefined>(undefined)
  const [deletingMcpServer, setDeletingMcpServer] = useState<McpServer | undefined>(undefined)
  const [apps, setApps] = useState<LauncherApp[]>([])
  const [isAppsLoading, setIsAppsLoading] = useState(false)
  const [appsFeedbackMessage, setAppsFeedbackMessage] = useState('')
  const [isAppFormOpen, setIsAppFormOpen] = useState(false)
  const [editingApp, setEditingApp] = useState<LauncherApp | undefined>(undefined)
  const [deletingApp, setDeletingApp] = useState<LauncherApp | undefined>(undefined)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [isWorkflowsLoading, setIsWorkflowsLoading] = useState(false)
  const [workflowsFeedbackMessage, setWorkflowsFeedbackMessage] = useState('')
  const [isWorkflowFormOpen, setIsWorkflowFormOpen] = useState(false)
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | undefined>(undefined)
  const [deletingWorkflow, setDeletingWorkflow] = useState<Workflow | undefined>(undefined)
  const [preprompts, setPreprompts] = useState<Preprompt[]>([])
  const [isPrepromptsLoading, setIsPrepromptsLoading] = useState(false)
  const [prepromptsFeedbackMessage, setPrepromptsFeedbackMessage] = useState('')
  const [isPrepromptFormOpen, setIsPrepromptFormOpen] = useState(false)
  const [editingPreprompt, setEditingPreprompt] = useState<Preprompt | undefined>(undefined)
  const [deletingPreprompt, setDeletingPreprompt] = useState<Preprompt | undefined>(undefined)
  const [globalInstructions, setGlobalInstructions] = useState('')
  const [savedGlobalInstructions, setSavedGlobalInstructions] = useState('')
  const [isGlobalInstructionsSaving, setIsGlobalInstructionsSaving] = useState(false)
  const [globalInstructionsFeedbackMessage, setGlobalInstructionsFeedbackMessage] = useState('')
  const [isClosing, setIsClosing] = useState(false)
  const [usageRefreshSignal, setUsageRefreshSignal] = useState(0)
  const texturePersistTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (texturePersistTimer.current !== null) {
        window.clearTimeout(texturePersistTimer.current)
      }
    }
  }, [])

  const isMac = window.api?.platform === 'darwin'

  const windowControls = useAnimationControls()

  const dragRegionStyle = { WebkitAppRegion: 'drag' } as CSSProperties
  const noDragRegionStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties

  useEffect(() => {
    let isMounted = true

    const loadConfig = async (): Promise<void> => {
      if (!window.api?.config.getConfig) return

      try {
        const config = await window.api.config.getConfig()
        if (!isMounted) return

        setApiKey(typeof config.apiKey === 'string' ? config.apiKey : '')
        setAdminApiKey(typeof config.adminApiKey === 'string' ? config.adminApiKey : '')
        setUsageProjectId(typeof config.usageProjectId === 'string' ? config.usageProjectId : '')
        setProxyUrl(typeof config.proxyUrl === 'string' ? config.proxyUrl : '')
        setSelectedTheme(normalizeThemeGradient(config.themeGradient))
        setLaunchOnStartup(typeof config.launchOnStartup === 'boolean' ? config.launchOnStartup : true)
        setTerminalFont(normalizeTerminalFont(config.terminalFont))
        setPreferredShell(typeof config.preferredShell === 'string' ? config.preferredShell : undefined)
        setMcpServers(Array.isArray(config.mcpServers) ? config.mcpServers : [])
        setChatModel(typeof config.chatModel === 'string' && config.chatModel.trim() ? config.chatModel : DEFAULT_CHAT_MODEL)
        setReasoningEffort(
          typeof config.reasoningEffort === 'string' && ['low', 'medium', 'high'].includes(config.reasoningEffort)
            ? (config.reasoningEffort as ReasoningEffort)
            : DEFAULT_REASONING_EFFORT
        )
        setEnableWebSearch(typeof config.enableWebSearch === 'boolean' ? config.enableWebSearch : true)
        setAutoCollapseReasoning(typeof config.autoCollapseReasoning === 'boolean' ? config.autoCollapseReasoning : true)
        setTextureIntensity(typeof config.textureIntensity === 'number' ? config.textureIntensity : DEFAULT_TEXTURE_INTENSITY)
        setAutoUpdate(typeof config.autoUpdate === 'boolean' ? config.autoUpdate : true)
        setButtonVisibility(config.buttonVisibility ?? { appLauncher: true, workflow: true, tasks: true, code: true })
        setLauncherShowSystemApps(config.launcherShowSystemApps === true)
        setShortcuts(config.shortcuts ?? { ...DEFAULT_SHORTCUTS })
        setPasteSettings(normalizePasteManagerSettings(config.pasteManager))
        setCodeSettings(config.code ?? { ...DEFAULT_CODE_SETTINGS })
        setIsConfigLoaded(true)
      } catch {
        if (!isMounted) return
        setApiKey('')
        setAdminApiKey('')
        setUsageProjectId('')
        setProxyUrl('')
        setSelectedTheme(DEFAULT_THEME_GRADIENT)
        setLaunchOnStartup(true)
        setTerminalFont(DEFAULT_TERMINAL_FONT)
        setPreferredShell(undefined)
        setMcpServers([])
        setChatModel(DEFAULT_CHAT_MODEL)
        setButtonVisibility({ appLauncher: true, workflow: true, tasks: true, code: true })
        setLauncherShowSystemApps(false)
        setAutoUpdate(true)
        setPasteSettings({ ...DEFAULT_PASTE_SETTINGS })
      }
    }

    void loadConfig()

    const unsubChatModel = window.api?.config.onChatModelUpdated?.((newChatModel) => {
      setChatModel(newChatModel)
    })

    const unsubReasoningEffort = window.api?.config.onReasoningEffortUpdated?.((newEffort) => {
      setReasoningEffort(newEffort)
    })

    const unsubButtonVisibility = window.api?.config.onButtonVisibilityUpdated?.((newVis) => {
      setButtonVisibility(newVis)
    })

    const unsubShortcuts = window.api?.config.onShortcutsUpdated?.((newShortcuts) => {
      setShortcuts(newShortcuts)
    })

    const unsubPasteSettings = window.api?.paste?.onSettingsUpdated?.((newSettings) => {
      setPasteSettings(newSettings)
    })

    const unsubTheme = window.api?.config.onThemeUpdated?.((newGradient) => {
      setSelectedTheme(normalizeThemeGradient(newGradient))
    })

    const unsubTexture = window.api?.config.onTextureIntensityUpdated?.((newIntensity) => {
      setTextureIntensity(newIntensity)
    })

    return () => {
      isMounted = false
      if (typeof unsubChatModel === 'function') unsubChatModel()
      if (typeof unsubReasoningEffort === 'function') unsubReasoningEffort()
      if (typeof unsubButtonVisibility === 'function') unsubButtonVisibility()
      if (typeof unsubShortcuts === 'function') unsubShortcuts()
      if (typeof unsubPasteSettings === 'function') unsubPasteSettings()
      if (typeof unsubTheme === 'function') unsubTheme()
      if (typeof unsubTexture === 'function') unsubTexture()
    }
  }, [])

  useEffect(() => {
    return window.api?.window.onNavigateSettingsTab?.((tab) => {
      if (VALID_SETTINGS_TABS.includes(tab as SettingsTab)) {
        setActiveTab(tab as SettingsTab)
      }
    })
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', getThemeMode(selectedTheme))
  }, [selectedTheme])

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--texture-opacity',
      String((textureIntensity / 100) * TEXTURE_MAX_OPACITY)
    )
  }, [textureIntensity])

  useEffect(() => {
    let isMounted = true

    const loadUpdateStatus = async (): Promise<void> => {
      if (!window.api?.config.getUpdateStatus) return
      try {
        const status = await window.api.config.getUpdateStatus()
        if (isMounted) setUpdateStatus(status)
      } catch {
        // Ignore — the listener will provide updates when available.
      }
    }

    void loadUpdateStatus()

    const unsubscribe = window.api?.config.onUpdateStatus?.((status) => {
      setUpdateStatus(status)
    })

    return () => {
      isMounted = false
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

  useEffect(() => {
    void windowControls.start({
      opacity: 1,
      scale: 1,
      y: 0,
      transition: SETTINGS_WINDOW_ENTER_TRANSITION
    })
  }, [windowControls])

  useEffect(() => {
    return window.api?.window.onSettingsShown?.((isRestore) => {
      if (!isRestore) return
      void windowControls.set({ opacity: 0, scale: 0.96, y: 8 })
      void windowControls.start({
        opacity: 1,
        scale: 1,
        y: 0,
        transition: SETTINGS_WINDOW_ENTER_TRANSITION
      })
    })
  }, [windowControls])

  useEffect(() => {
    let isMounted = true

    const loadMcpServers = async (): Promise<void> => {
      if (!window.api?.config.getMcpServers) return

      try {
        setIsMcpServersLoading(true)
        const savedServers = await window.api.config.getMcpServers()
        if (!isMounted) return
        setMcpServers(savedServers)
      } catch {
        if (!isMounted) return
        setMcpServers([])
      } finally {
        if (!isMounted) return
        setIsMcpServersLoading(false)
      }
    }

    void loadMcpServers()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadApps = async (): Promise<void> => {
      if (!window.api?.store.getApps) return

      try {
        setIsAppsLoading(true)
        const savedApps = await window.api.store.getApps()
        if (!isMounted) return
        setApps(savedApps)
      } catch {
        if (!isMounted) return
        setApps([])
      } finally {
        if (!isMounted) return
        setIsAppsLoading(false)
      }
    }

    void loadApps()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadWorkflows = async (): Promise<void> => {
      if (!window.api?.store.getWorkflows) return

      try {
        setIsWorkflowsLoading(true)
        const savedWorkflows = await window.api.store.getWorkflows()
        if (!isMounted) return
        setWorkflows(savedWorkflows)
      } catch {
        if (!isMounted) return
        setWorkflows([])
      } finally {
        if (!isMounted) return
        setIsWorkflowsLoading(false)
      }
    }

    void loadWorkflows()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadPreprompts = async (): Promise<void> => {
      if (!window.api?.store.getPreprompts) return

      try {
        setIsPrepromptsLoading(true)
        const savedPreprompts = await window.api.store.getPreprompts()
        if (!isMounted) return
        setPreprompts(savedPreprompts)
      } catch {
        if (!isMounted) return
        setPreprompts([])
      } finally {
        if (!isMounted) return
        setIsPrepromptsLoading(false)
      }
    }

    void loadPreprompts()

    const loadGlobalInstructions = async (): Promise<void> => {
      if (!window.api?.store.getGlobalInstructions) return

      try {
        const saved = await window.api.store.getGlobalInstructions()
        if (!isMounted) return
        setGlobalInstructions(saved)
        setSavedGlobalInstructions(saved)
      } catch {
        if (!isMounted) return
        setGlobalInstructions('')
        setSavedGlobalInstructions('')
      }
    }

    void loadGlobalInstructions()

    return () => {
      isMounted = false
    }
  }, [])

const handleMinimizeWindow = (): void => {
    window.api?.window.minimizeSettings?.()
  }

  const handleCloseWindow = (): void => {
    setIsClosing(true)
  }

  const handleSaveOpenAISettings = (): void => {
    if (!isConfigLoaded) return
    try {
      setIsSavingApiKey(true)
      if (window.api?.config.saveOpenAISettings) {
        // Only submit the General tab's own fields; the admin key is owned by
        // the Usage tab so we don't clobber it with possibly-stale state.
        window.api.config.saveOpenAISettings({ apiKey, proxyUrl })
      } else {
        window.api?.config.saveApiKey?.(apiKey)
      }

      setSaveFeedbackMessage('OpenAI settings saved locally.')
      setUsageRefreshSignal((value) => value + 1)
      window.setTimeout(() => setSaveFeedbackMessage(''), 1800)
    } finally {
      setIsSavingApiKey(false)
    }
  }

  const handleSaveAdminKey = (): void => {
    if (!isConfigLoaded) return
    try {
      setIsSavingAdminKey(true)
      window.api?.config.saveOpenAISettings?.({ adminApiKey })

      setAdminKeyFeedbackMessage('Admin API key saved locally.')
      setUsageRefreshSignal((value) => value + 1)
      window.setTimeout(() => setAdminKeyFeedbackMessage(''), 1800)
    } finally {
      setIsSavingAdminKey(false)
    }
  }

  const handleUsageProjectChange = (projectId: string): void => {
    setUsageProjectId(projectId)
    window.api?.config.updateUsageProject?.(projectId)
  }

  const handleThemeSelect = (gradientClass: string): void => {
    const safeTheme = normalizeThemeGradient(gradientClass)
    setSelectedTheme(safeTheme)
    window.api?.config.updateTheme?.(safeTheme)
  }

  const handleTextureIntensityChange = (value: number): void => {
    const clamped = Math.max(0, Math.min(MAX_TEXTURE_INTENSITY, Math.round(value)))
    setTextureIntensity(clamped)

    if (texturePersistTimer.current !== null) {
      window.clearTimeout(texturePersistTimer.current)
    }

    texturePersistTimer.current = window.setTimeout(() => {
      texturePersistTimer.current = null
      window.api?.config.updateTextureIntensity?.(clamped)
    }, 120)
  }

  const handleLaunchOnStartupChange = (value: boolean): void => {
    setLaunchOnStartup(value)
    window.api?.config.updateStartupSetting?.(value)
  }

  const handleOpenAddMcpServer = (): void => {
    setEditingMcpServer(undefined)
    setMcpFormSeed(undefined)
    setMcpFeedbackMessage('')
    setIsMcpFormOpen(true)
  }

  const handleOpenEditMcpServer = (server: McpServer): void => {
    setEditingMcpServer(server)
    setMcpFormSeed(undefined)
    setMcpFeedbackMessage('')
    setIsMcpFormOpen(true)
  }

  const handleCloseMcpForm = (): void => {
    setIsMcpFormOpen(false)
    setEditingMcpServer(undefined)
    setMcpFormSeed(undefined)
  }

  const handleSaveMcpServer = async (payload: {
    id?: string
    name: string
    url: string
    description: string
    active: boolean
    auth: McpServer['auth']
    appendMcpSuffix: boolean
  }): Promise<void> => {
    if (!window.api?.config.saveMcpServer) return

    try {
      const updatedServers = await window.api.config.saveMcpServer({
        ...editingMcpServer,
        ...payload,
        tools: editingMcpServer?.tools ?? []
      })
      setMcpServers(updatedServers)
      setIsMcpFormOpen(false)
      setEditingMcpServer(undefined)
      setMcpFormSeed(undefined)

      const savedServer = payload.id
        ? updatedServers.find((server) => server.id === payload.id)
        : updatedServers.find((server) => server.name === payload.name && server.url === payload.url)

      if (savedServer && savedServer.active) {
        setMcpFeedbackMessage('MCP server saved. Fetching tools…')
        try {
          const refreshedServers = await window.api.config.refreshMcpServerTools(savedServer.id)
          setMcpServers(refreshedServers)
          setMcpFeedbackMessage('MCP server saved and tools fetched.')
        } catch {
          setMcpFeedbackMessage('MCP server saved, but tools could not be fetched.')
        }
      } else {
        setMcpFeedbackMessage('MCP server saved.')
      }
      window.setTimeout(() => setMcpFeedbackMessage(''), 1800)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save MCP server.'
      setMcpFeedbackMessage(message)
    }
  }

  const handleToggleMcpServerActive = async (server: McpServer, active: boolean): Promise<void> => {
    if (!window.api?.config.saveMcpServer) return

    try {
      const updatedServers = await window.api.config.saveMcpServer({
        ...server,
        active
      })
      setMcpServers(updatedServers)

      if (active && server.tools.length === 0) {
        setMcpFeedbackMessage('Server activated. Fetching tools…')
        try {
          const refreshedServers = await window.api.config.refreshMcpServerTools(server.id)
          setMcpServers(refreshedServers)
          setMcpFeedbackMessage('Server activated and tools fetched.')
          window.setTimeout(() => setMcpFeedbackMessage(''), 1800)
        } catch {
          // Keep the server active; the connection chip will surface the error.
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update MCP server.'
      setMcpFeedbackMessage(message)
    }
  }

  const handleToggleMcpTool = async (server: McpServer, toolName: string, enabled: boolean): Promise<void> => {
    if (!window.api?.config.saveMcpServer) return

    const nextServer = {
      ...server,
      tools: server.tools.map((tool) => (tool.name === toolName ? { ...tool, enabled } : tool))
    }

    try {
      const updatedServers = await window.api.config.saveMcpServer(nextServer)
      setMcpServers(updatedServers)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update MCP tool selection.'
      setMcpFeedbackMessage(message)
    }
  }

  const handleRefreshMcpTools = async (server: McpServer): Promise<void> => {
    if (!window.api?.config.refreshMcpServerTools) return

    try {
      setMcpFeedbackMessage('Refreshing MCP tools...')
      const refreshedServers = await window.api.config.refreshMcpServerTools(server.id)
      setMcpServers(refreshedServers)
      setMcpFeedbackMessage('MCP tools refreshed.')
      window.setTimeout(() => setMcpFeedbackMessage(''), 1600)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to refresh MCP tools.'
      setMcpFeedbackMessage(message)
    }
  }

  const handleTestMcpServer = async (server: McpServer): Promise<void> => {
    if (!window.api?.config.testMcpServer) return

    setMcpFeedbackMessage(`Testing ${server.name}…`)
    try {
      const result = await window.api.config.testMcpServer({
        name: server.name,
        url: server.url,
        auth: server.auth,
        appendMcpSuffix: server.appendMcpSuffix ?? true
      })
      if (result.ok) {
        setMcpFeedbackMessage(result.message)
      } else {
        setMcpFeedbackMessage(result.message)
        const updatedServers = await window.api.config.saveMcpServer({
          ...server,
          lastError: result.lastError
        })
        setMcpServers(updatedServers)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to test connection.'
      setMcpFeedbackMessage(message)
    }
    window.setTimeout(() => setMcpFeedbackMessage(''), 2500)
  }

  const handleApplyMcpPreset = (preset: McpPreset): void => {
    setMcpFeedbackMessage('')
    setEditingMcpServer(undefined)
    setMcpFormSeed({
      name: preset.name,
      url: preset.url,
      description: preset.description,
      authType: preset.authType
    })
    setIsMcpFormOpen(true)
  }

  const handleDeleteMcpServer = async (): Promise<void> => {
    const targetServer = deletingMcpServer
    if (!targetServer || !window.api?.config.deleteMcpServer) return

    try {
      const updatedServers = await window.api.config.deleteMcpServer(targetServer.id)
      setMcpServers(updatedServers)
      setDeletingMcpServer(undefined)
      setMcpFeedbackMessage('MCP server removed.')
      window.setTimeout(() => setMcpFeedbackMessage(''), 1600)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete MCP server.'
      setMcpFeedbackMessage(message)
    }
  }

  const handleTerminalFontSelect = (fontFamily: string): void => {
    const safeTerminalFont = normalizeTerminalFont(fontFamily)
    setTerminalFont(safeTerminalFont)
    window.api?.config.updateTerminalFont?.(safeTerminalFont)
  }

  const handlePreferredShellChange = (shell: string): void => {
    setPreferredShell(shell || undefined)
    window.api?.config.updatePreferredShell?.(shell)
  }

  const handleChatModelChange = (model: string): void => {
    setChatModel(model)
    window.api?.config.updateChatModel?.(model)
  }

  const handleReasoningEffortChange = (effort: ReasoningEffort): void => {
    setReasoningEffort(effort)
    window.api?.config.updateReasoningEffort?.(effort)
  }

  const handleWebSearchChange = (enabled: boolean): void => {
    setEnableWebSearch(enabled)
    window.api?.config.updateWebSearch?.(enabled)
  }

  const handleAutoCollapseReasoningChange = (enabled: boolean): void => {
    setAutoCollapseReasoning(enabled)
    window.api?.config.updateAutoCollapseReasoning?.(enabled)
  }

  const handleAutoUpdateChange = (enabled: boolean): void => {
    setAutoUpdate(enabled)
    window.api?.config.updateAutoUpdate?.(enabled)
  }

  const handleCheckForUpdates = (): void => {
    setUpdateStatus((prev) => ({ ...prev, state: 'checking' }))
    void window.api?.config.checkForUpdates?.()
  }

  const handleInstallUpdate = (): void => {
    window.api?.config.installUpdate?.()
  }

  const handleButtonVisibilityChange = (visibility: ButtonVisibility): void => {
    setButtonVisibility(visibility)
    window.api?.config.updateButtonVisibility?.(visibility)
  }

  const handleLauncherShowSystemAppsChange = (showSystemApps: boolean): void => {
    setLauncherShowSystemApps(showSystemApps)
    window.api?.config.updateLauncherShowSystemApps?.(showSystemApps)
  }

  const handleShortcutChange = (field: keyof ShortcutConfig, value: string): void => {
    setShortcuts((prev) => {
      const next = { ...prev, [field]: value }
      window.api?.config.updateShortcuts?.(next)
      return next
    })
  }

  const handlePasteSettingChange = (patch: Partial<PasteManagerSettings>): void => {
    setPasteSettings((prev) => normalizePasteManagerSettings({ ...prev, ...patch }))
    void window.api?.paste?.updateSettings?.(patch).then((next) => setPasteSettings(next))
  }

  const handleClearPasteHistory = (keepPinned: boolean): void => {
    void window.api?.paste?.clear?.(keepPinned).then((result) => {
      setPasteFeedbackMessage(
        result?.removed ? `Removed ${result.removed} item${result.removed === 1 ? '' : 's'}.` : 'Nothing to clear.'
      )
      window.setTimeout(() => setPasteFeedbackMessage(''), 2000)
    })
  }

  const handleOpenAddApp = (): void => {
    setEditingApp(undefined)
    setAppsFeedbackMessage('')
    setIsAppFormOpen(true)
  }

  const handleOpenEditApp = (launcherApp: LauncherApp): void => {
    setEditingApp(launcherApp)
    setAppsFeedbackMessage('')
    setIsAppFormOpen(true)
  }

  const handleCloseAppForm = (): void => {
    setIsAppFormOpen(false)
    setEditingApp(undefined)
  }

  const handleSaveApp = async (payload: {
    id?: string
    title: string
    iconBase64: string
    targets: LauncherApp['targets']
    path?: string
    arguments?: string
  }): Promise<void> => {
    if (!window.api?.store.saveApp) return

    try {
      const updatedApps = await window.api.store.saveApp(payload)
      setApps(updatedApps)
      setIsAppFormOpen(false)
      setEditingApp(undefined)
      setAppsFeedbackMessage('Application saved.')
      window.setTimeout(() => setAppsFeedbackMessage(''), 1600)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save application.'
      setAppsFeedbackMessage(message)
    }
  }

  const handleConfirmDeleteApp = async (): Promise<void> => {
    const targetApp = deletingApp
    if (!targetApp || !window.api?.store.deleteApp) return

    try {
      const updatedApps = await window.api.store.deleteApp(targetApp.id)
      setApps(updatedApps)
      setDeletingApp(undefined)
      setAppsFeedbackMessage('Application removed.')
      window.setTimeout(() => setAppsFeedbackMessage(''), 1600)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete application.'
      setAppsFeedbackMessage(message)
    }
  }

  const handleOpenAddWorkflow = (): void => {
    setEditingWorkflow(undefined)
    setWorkflowsFeedbackMessage('')
    setIsWorkflowFormOpen(true)
  }

  const handleOpenEditWorkflow = (workflow: Workflow): void => {
    setEditingWorkflow(workflow)
    setWorkflowsFeedbackMessage('')
    setIsWorkflowFormOpen(true)
  }

  const handleCloseWorkflowForm = (): void => {
    setIsWorkflowFormOpen(false)
    setEditingWorkflow(undefined)
  }

  const handleSaveWorkflow = async (payload: {
    id?: string
    title: string
    language: Workflow['language']
    customCommand?: string
    content: string
  }): Promise<void> => {
    if (!window.api?.store.saveWorkflow) return

    try {
      const updatedWorkflows = await window.api.store.saveWorkflow(payload)
      setWorkflows(updatedWorkflows)
      setIsWorkflowFormOpen(false)
      setEditingWorkflow(undefined)
      setWorkflowsFeedbackMessage('Workflow saved.')
      window.setTimeout(() => setWorkflowsFeedbackMessage(''), 1600)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save workflow.'
      setWorkflowsFeedbackMessage(message)
    }
  }

  const handleConfirmDeleteWorkflow = async (): Promise<void> => {
    const targetWorkflow = deletingWorkflow
    if (!targetWorkflow || !window.api?.store.deleteWorkflow) return

    try {
      const updatedWorkflows = await window.api.store.deleteWorkflow(targetWorkflow.id)
      setWorkflows(updatedWorkflows)
      setDeletingWorkflow(undefined)
      setWorkflowsFeedbackMessage('Workflow removed.')
      window.setTimeout(() => setWorkflowsFeedbackMessage(''), 1600)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete workflow.'
      setWorkflowsFeedbackMessage(message)
    }
  }

  const handleOpenAddPreprompt = (): void => {
    setEditingPreprompt(undefined)
    setIsPrepromptFormOpen(true)
  }

  const handleOpenEditPreprompt = (preprompt: Preprompt): void => {
    setEditingPreprompt(preprompt)
    setIsPrepromptFormOpen(true)
  }

  const handleClosePrepromptForm = (): void => {
    setIsPrepromptFormOpen(false)
    setEditingPreprompt(undefined)
  }

  const handleSavePreprompt = async (payload: { id?: string; title: string; content: string }): Promise<void> => {
    if (!window.api?.store.savePreprompt) return

    try {
      const updatedPreprompts = await window.api.store.savePreprompt(payload)
      setPreprompts(updatedPreprompts)
      setIsPrepromptFormOpen(false)
      setEditingPreprompt(undefined)
      setPrepromptsFeedbackMessage('Instruction saved.')
      window.setTimeout(() => setPrepromptsFeedbackMessage(''), 1600)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save instruction.'
      setPrepromptsFeedbackMessage(message)
    }
  }

  const handleSaveGlobalInstructions = async (): Promise<void> => {
    if (!window.api?.store.saveGlobalInstructions) return

    try {
      setIsGlobalInstructionsSaving(true)
      const saved = await window.api.store.saveGlobalInstructions(globalInstructions)
      setGlobalInstructions(saved)
      setSavedGlobalInstructions(saved)
      setGlobalInstructionsFeedbackMessage('Global instructions saved.')
      window.setTimeout(() => setGlobalInstructionsFeedbackMessage(''), 1600)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save global instructions.'
      setGlobalInstructionsFeedbackMessage(message)
    } finally {
      setIsGlobalInstructionsSaving(false)
    }
  }

  const handleConfirmDeletePreprompt = async (): Promise<void> => {
    const target = deletingPreprompt
    if (!target || !window.api?.store.deletePreprompt) return

    try {
      const updatedPreprompts = await window.api.store.deletePreprompt(target.id)
      setPreprompts(updatedPreprompts)
      setDeletingPreprompt(undefined)
      setPrepromptsFeedbackMessage('Instruction deleted.')
      window.setTimeout(() => setPrepromptsFeedbackMessage(''), 1600)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete instruction.'
      setPrepromptsFeedbackMessage(message)
    }
  }

  const refreshCodeStatus = async (): Promise<void> => {
    if (!window.api?.code) return
    const result = await window.api.code.getStatus()
    if (result.success) setCodeStatus(result.status)
  }

  useEffect(() => {
    if (activeTab !== 'code') return
    void refreshCodeStatus()
    void (async () => {
      const result = await window.api?.code?.listModels()
      if (result?.success) setCodeModels(result.models)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const handleCodeSettingsChange = (patch: Partial<CodeSettings>): void => {
    setCodeSettings((current) => {
      const next: CodeSettings = {
        ...current,
        ...patch,
        permission: { ...current.permission, ...(patch.permission ?? {}) }
      }
      void window.api?.code?.setSettings(next)
      return next
    })
  }

  const handleSetCodeApiKey = async (key: string): Promise<{ ok: boolean; error?: string }> => {
    const result = await window.api?.code?.setApiKey(key)
    if (result?.success) {
      setCodeStatus(result.status)
      void refreshCodeStatus()
      return { ok: true }
    }
    return { ok: false, error: result && !result.success ? result.error : 'Failed to save key.' }
  }

  const handleClearCodeApiKey = async (): Promise<void> => {
    const result = await window.api?.code?.clearApiKey()
    if (result?.success) setCodeStatus(result.status)
  }

  const handleTestCodeConnection = async (): Promise<{ ok: boolean; error?: string }> => {
    const result = await window.api?.code?.testConnection()
    if (result?.success) {
      void refreshCodeStatus()
      return { ok: result.connected, error: result.connected ? undefined : 'OpenCode Go is not connected.' }
    }
    return { ok: false, error: result && !result.success ? result.error : 'Connection failed.' }
  }

  const handleRestartCodeRuntime = async (): Promise<{ ok: boolean; error?: string }> => {
    const result = await window.api?.code?.restartRuntime()
    if (result?.success) {
      setCodeStatus(result.status)
      void (async () => {
        const models = await window.api?.code?.listModels()
        if (models?.success) setCodeModels(models.models)
      })()
      return { ok: true }
    }
    return { ok: false, error: result && !result.success ? result.error : 'Restart failed.' }
  }

  const pageTitle = useMemo(() => {
    if (activeTab === 'general') return 'General'
    if (activeTab === 'usage') return 'Usage & Cost'
    if (activeTab === 'appearance') return 'Appearance'
    if (activeTab === 'terminal') return 'Terminal'
    if (activeTab === 'appLauncher') return 'App Launcher'
    if (activeTab === 'workflow') return 'Workflows'
    if (activeTab === 'preprompts') return 'Instructions'
    if (activeTab === 'mcp') return 'MCP Servers'
    if (activeTab === 'code') return 'OpenCode'
    return 'Clipboard'
  }, [activeTab])

  return (
    <AnimatePresence onExitComplete={() => window.api?.window.closeSettings?.()}>
      {!isClosing && (
        <motion.div
          key="settings-window"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={windowControls}
          exit={{ opacity: 0, scale: 0.97, y: 6, transition: SETTINGS_WINDOW_EXIT_TRANSITION }}
          className="h-screen w-screen bg-transparent font-sans text-neutral-200"
        >
      <div className={`relative h-full overflow-hidden rounded-xl border border-neutral-800/85 bg-gradient-to-br ${selectedTheme} texture-surface`}>
        <div className="relative h-10 w-full">
          <div className="absolute inset-0 border-b border-neutral-800/80 bg-neutral-900/40" style={dragRegionStyle}>
            <div className={`flex h-full items-center text-xs uppercase tracking-[0.1em] text-neutral-500 ${isMac ? 'pl-[76px] pr-4' : 'px-4'}`}>
              <span>Covenant Settings</span>
            </div>
          </div>

          {!isMac && (
            <div className="absolute inset-y-0 right-0 z-20 flex items-center gap-1 pr-3" style={noDragRegionStyle}>
              <button
                type="button"
                aria-label="Minimize settings window"
                onClick={handleMinimizeWindow}
                className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
              >
                <MinimizeIcon />
              </button>

              <button
                type="button"
                aria-label="Close settings window"
                onClick={handleCloseWindow}
                className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
              >
                <CloseIcon />
              </button>
            </div>
          )}
        </div>

        <div className="flex h-[calc(100%-2.5rem)]">
          <aside className="flex w-64 flex-col overflow-y-auto border-r border-neutral-800 bg-neutral-950/85 p-4">
            <nav className="space-y-5 pt-2">
              {SETTINGS_NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const isActive = activeTab === item.id

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveTab(item.id)}
                          aria-current={isActive ? 'page' : undefined}
                          className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                            isActive
                              ? 'border-neutral-700 bg-neutral-800 text-neutral-100'
                              : 'border-transparent text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
                          }`}
                        >
                          <span className={`transition-colors ${isActive ? 'text-neutral-100' : 'text-neutral-500 group-hover:text-neutral-300'}`}>
                            <SidebarGlyph tab={item.id} />
                          </span>
                          <span className="flex-1">{item.label}</span>
                          {isActive ? <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" /> : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </aside>

          <main className="flex-1 overflow-y-auto p-8">
            <header className="mb-6">
              <p className="text-xs uppercase tracking-[0.1em] text-neutral-500">Preferences</p>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-100">{pageTitle}</h2>
            </header>

            {activeTab === 'general' && (
              <GeneralTab
                apiKey={apiKey}
                onApiKeyChange={setApiKey}
                proxyUrl={proxyUrl}
                onProxyUrlChange={setProxyUrl}
                isAdvancedOpen={isAdvancedOpen}
                onToggleAdvanced={() => setIsAdvancedOpen((current) => !current)}
                onSaveOpenAISettings={handleSaveOpenAISettings}
                isSavingApiKey={isSavingApiKey}
                isConfigLoaded={isConfigLoaded}
                saveFeedbackMessage={saveFeedbackMessage}
                launchOnStartup={launchOnStartup}
                onLaunchOnStartupChange={handleLaunchOnStartupChange}
                chatModel={chatModel}
                onChatModelChange={handleChatModelChange}
                reasoningEffort={reasoningEffort}
                onReasoningEffortChange={handleReasoningEffortChange}
                enableWebSearch={enableWebSearch}
                onWebSearchChange={handleWebSearchChange}
                autoCollapseReasoning={autoCollapseReasoning}
                onAutoCollapseReasoningChange={handleAutoCollapseReasoningChange}
                autoUpdate={autoUpdate}
                onAutoUpdateChange={handleAutoUpdateChange}
                updateStatus={updateStatus}
                onCheckForUpdates={handleCheckForUpdates}
                onInstallUpdate={handleInstallUpdate}
                shortcuts={shortcuts}
                onShortcutChange={handleShortcutChange}
              />
            )}
            {activeTab === 'usage' && (
              <UsageTab
                adminKey={adminApiKey}
                onAdminKeyChange={setAdminApiKey}
                onSaveAdminKey={handleSaveAdminKey}
                isSavingAdminKey={isSavingAdminKey}
                isConfigLoaded={isConfigLoaded}
                adminKeyFeedback={adminKeyFeedbackMessage}
                refreshSignal={usageRefreshSignal}
                projectId={usageProjectId}
                onProjectChange={handleUsageProjectChange}
              />
            )}
            {activeTab === 'appearance' && (
              <AppearanceTab
                selectedTheme={selectedTheme}
                onSelectTheme={handleThemeSelect}
                textureIntensity={textureIntensity}
                onTextureIntensityChange={handleTextureIntensityChange}
                buttonVisibility={buttonVisibility}
                onButtonVisibilityChange={handleButtonVisibilityChange}
                launcherShowSystemApps={launcherShowSystemApps}
                onLauncherShowSystemAppsChange={handleLauncherShowSystemAppsChange}
              />
            )}
            {activeTab === 'terminal' && (
              <TerminalTab
                terminalFont={terminalFont}
                onTerminalFontSelect={handleTerminalFontSelect}
                preferredShell={preferredShell}
                onPreferredShellChange={handlePreferredShellChange}
              />
            )}
            {activeTab === 'appLauncher' && (
              <AppLauncherTab
                apps={apps}
                isLoading={isAppsLoading}
                feedbackMessage={appsFeedbackMessage}
                onAdd={handleOpenAddApp}
                onEdit={handleOpenEditApp}
                onDelete={(launcherApp) => setDeletingApp(launcherApp)}
              />
            )}
            {activeTab === 'workflow' && (
              <WorkflowsTab
                workflows={workflows}
                isLoading={isWorkflowsLoading}
                feedbackMessage={workflowsFeedbackMessage}
                onAdd={handleOpenAddWorkflow}
                onEdit={handleOpenEditWorkflow}
                onDelete={(workflow) => setDeletingWorkflow(workflow)}
              />
            )}
            {activeTab === 'preprompts' && (
              <PrepromptsTab
                preprompts={preprompts}
                isLoading={isPrepromptsLoading}
                feedbackMessage={prepromptsFeedbackMessage}
                onAdd={handleOpenAddPreprompt}
                onEdit={handleOpenEditPreprompt}
                onDelete={(preprompt) => setDeletingPreprompt(preprompt)}
                globalInstructions={globalInstructions}
                savedGlobalInstructions={savedGlobalInstructions}
                isGlobalInstructionsSaving={isGlobalInstructionsSaving}
                globalInstructionsFeedbackMessage={globalInstructionsFeedbackMessage}
                onGlobalInstructionsChange={setGlobalInstructions}
                onSaveGlobalInstructions={handleSaveGlobalInstructions}
              />
            )}
            {activeTab === 'mcp' && (
              <McpServersTab
                servers={mcpServers}
                isLoading={isMcpServersLoading}
                feedbackMessage={mcpFeedbackMessage}
                onAdd={handleOpenAddMcpServer}
                onEdit={handleOpenEditMcpServer}
                onDelete={(server) => setDeletingMcpServer(server)}
                onToggleActive={handleToggleMcpServerActive}
                onToggleTool={handleToggleMcpTool}
                onRefreshTools={handleRefreshMcpTools}
                onTest={handleTestMcpServer}
                onApplyPreset={handleApplyMcpPreset}
              />
            )}
            {activeTab === 'paste' && (
              <PasteSettingsTab
                settings={pasteSettings}
                onChange={handlePasteSettingChange}
                onClearHistory={handleClearPasteHistory}
                feedbackMessage={pasteFeedbackMessage}
              />
            )}
            {activeTab === 'code' && (
              <CodeTab
                settings={codeSettings}
                status={codeStatus}
                models={codeModels}
                onSettingsChange={handleCodeSettingsChange}
                onSetApiKey={handleSetCodeApiKey}
                onClearApiKey={handleClearCodeApiKey}
                onTestConnection={handleTestCodeConnection}
                onRestartRuntime={handleRestartCodeRuntime}
                onOpenLogs={() => void window.api?.code?.openLogs()}
              />
            )}
          </main>
        </div>
      </div>

      <AnimatePresence>
        {isAppFormOpen ? (
          <AppFormModal
            initialData={editingApp}
            onCancel={handleCloseAppForm}
            onSave={(payload) => {
              void handleSaveApp(payload)
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {deletingApp ? (
          <ConfirmDeleteModal
            title="Delete Application"
            message={`Are you sure you want to delete \"${deletingApp.title}\" from the launcher list?`}
            onCancel={() => setDeletingApp(undefined)}
            onConfirm={() => {
              void handleConfirmDeleteApp()
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isWorkflowFormOpen ? (
          <WorkflowFormModal
            initialData={editingWorkflow}
            onCancel={handleCloseWorkflowForm}
            onSave={(payload) => {
              void handleSaveWorkflow(payload)
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {deletingWorkflow ? (
          <ConfirmDeleteModal
            title="Delete Workflow"
            message={`Are you sure you want to delete \"${deletingWorkflow.title}\"?`}
            onCancel={() => setDeletingWorkflow(undefined)}
            onConfirm={() => {
              void handleConfirmDeleteWorkflow()
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isPrepromptFormOpen ? (
          <PrepromptFormModal
            initialData={editingPreprompt}
            onCancel={handleClosePrepromptForm}
            onSave={(payload) => {
              void handleSavePreprompt(payload)
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {deletingPreprompt ? (
          <ConfirmDeleteModal
            title="Delete Instruction"
            message={`Are you sure you want to delete \"${deletingPreprompt.title}\"? This action cannot be undone.`}
            onCancel={() => setDeletingPreprompt(undefined)}
            onConfirm={() => {
              void handleConfirmDeletePreprompt()
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isMcpFormOpen ? (
          <McpServerFormModal
            initialData={editingMcpServer}
            seed={mcpFormSeed}
            onCancel={handleCloseMcpForm}
            onSave={(payload) => {
              void handleSaveMcpServer(payload)
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {deletingMcpServer ? (
          <ConfirmDeleteModal
            title="Delete MCP Server"
            message={`Are you sure you want to delete \"${deletingMcpServer.name}\"? This will remove its saved tools and credentials.`}
            onCancel={() => setDeletingMcpServer(undefined)}
            onConfirm={() => {
              void handleDeleteMcpServer()
            }}
          />
        ) : null}
      </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
