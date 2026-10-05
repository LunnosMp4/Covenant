import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useAnimationControls, type Transition } from 'framer-motion'
import AppFormModal from './components/AppFormModal'
import ConfirmDeleteModal from './components/ConfirmDeleteModal'
import CustomSelect from './components/CustomSelect'
import McpServerFormModal from './components/McpServerFormModal'
import McpServersTab, { type McpPreset } from './components/McpServersTab'
import PrepromptFormModal from './components/PrepromptFormModal'
import WorkflowFormModal from './components/WorkflowFormModal'
import PasteSettingsTab from './components/PasteSettingsTab'
import UsageTab from './components/UsageTab'
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
import type { UpdateStatus } from '../../shared/update'
import {
  DEFAULT_PASTE_SETTINGS,
  normalizePasteManagerSettings,
  type PasteManagerSettings
} from '../../shared/paste'
import type { McpServer } from '../../shared/mcp'
import type { LauncherApp } from './types/launcher-app'
import type { Preprompt } from './types/preprompt'
import type { Workflow } from './types/workflow'
import { getAppBadgeText } from './utils/helpers'
import { formatTargetsSummary, normalizeLaunchTargets } from './utils/launcherTargets'

type SettingsTab = 'general' | 'appearance' | 'terminal' | 'appLauncher' | 'workflow' | 'preprompts' | 'mcp' | 'paste' | 'usage'

const VALID_SETTINGS_TABS: readonly SettingsTab[] = ['general', 'appearance', 'terminal', 'appLauncher', 'workflow', 'preprompts', 'mcp', 'paste', 'usage']

interface SettingsNavGroup {
  label: string
  items: { id: SettingsTab; label: string }[]
}

const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  {
    label: 'Application',
    items: [
      { id: 'general', label: 'General' },
      { id: 'appearance', label: 'Appearance' },
      { id: 'terminal', label: 'Terminal' }
    ]
  },
  {
    label: 'AI & Automation',
    items: [
      { id: 'preprompts', label: 'Instructions' },
      { id: 'mcp', label: 'MCP Servers' },
      { id: 'workflow', label: 'Workflows' }
    ]
  },
  {
    label: 'Tools',
    items: [
      { id: 'appLauncher', label: 'App Launcher' },
      { id: 'paste', label: 'Clipboard' }
    ]
  },
  {
    label: 'Account',
    items: [{ id: 'usage', label: 'Usage & Cost' }]
  }
]

const SETTINGS_WINDOW_ENTER_TRANSITION: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
const SETTINGS_WINDOW_EXIT_TRANSITION: Transition = { duration: 0.16, ease: [0.22, 1, 0.36, 1] }

function isSettingsTab(tab: string | null): tab is SettingsTab {
  return typeof tab === 'string' && VALID_SETTINGS_TABS.includes(tab as SettingsTab)
}

function getInitialTab(): SettingsTab {
  const hash = window.location.hash
  const queryIndex = hash.indexOf('?')
  const query = queryIndex >= 0 ? hash.slice(queryIndex + 1) : ''
  const tab = new URLSearchParams(query).get('tab')
  return isSettingsTab(tab) ? tab : 'general'
}

function SidebarGlyph({ tab }: { tab: SettingsTab }): JSX.Element {
  if (tab === 'general') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1 0 2.8l-.7.7a2 2 0 0 1-2.8 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V21a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8 0l-.7-.7a2 2 0 0 1 0-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H3a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 0-2.8l.7-.7a2 2 0 0 1 2.8 0l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V3a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v.2a1 1 0 0 0 .6.9h.1a1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H21a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-.2a1 1 0 0 0-.9.6z" />
      </svg>
    )
  }

  if (tab === 'appearance') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" />
        <circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" />
        <circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" />
        <circle cx="6.5" cy="12.5" r="1.5" fill="currentColor" />
        <path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2 2 2 0 0 0-.6-1.4 1.9 1.9 0 0 1 1.35-3.25H16a6 6 0 0 0 6-6 10 10 0 0 0-10-7.35Z" />
      </svg>
    )
  }

  if (tab === 'appLauncher') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.6" />
        <rect x="14" y="3" width="7" height="7" rx="1.6" />
        <rect x="3" y="14" width="7" height="7" rx="1.6" />
        <rect x="14" y="14" width="7" height="7" rx="1.6" />
      </svg>
    )
  }

  if (tab === 'terminal') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="m7 9 3 2-3 2" />
        <path d="M12.5 13h4.5" />
      </svg>
    )
  }

  if (tab === 'preprompts') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M9 9h8" />
        <path d="M9 13h5" />
      </svg>
    )
  }

  if (tab === 'mcp') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M13.85 0a4.16 4.16 0 0 0-2.95 1.217L1.456 10.66a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l9.442-9.442a2.49 2.49 0 0 1 3.541 0 2.49 2.49 0 0 1 0 3.541L8.59 12.97l-.1.1a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l.1-.098 7.03-7.034a2.49 2.49 0 0 1 3.542 0l.049.05a2.49 2.49 0 0 1 0 3.54l-8.54 8.54a1.96 1.96 0 0 0 0 2.755l1.753 1.753a.835.835 0 0 0 1.18 0 .835.835 0 0 0 0-1.18l-1.753-1.753a.266.266 0 0 1 0-.394l8.54-8.54a4.185 4.185 0 0 0 0-5.9l-.05-.05a4.16 4.16 0 0 0-2.95-1.218c-.2 0-.401.02-.6.048a4.17 4.17 0 0 0-1.17-3.552A4.16 4.16 0 0 0 13.85 0m0 3.333a.84.84 0 0 0-.59.245L6.275 10.56a4.186 4.186 0 0 0 0 5.902 4.186 4.186 0 0 0 5.902 0L19.16 9.48a.835.835 0 0 0 0-1.18.835.835 0 0 0-1.18 0l-6.985 6.984a2.49 2.49 0 0 1-3.54 0 2.49 2.49 0 0 1 0-3.54l6.983-6.985a.835.835 0 0 0 0-1.18.84.84 0 0 0-.59-.245" />
      </svg>
    )
  }

  if (tab === 'paste') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="8" y="3" width="8" height="4" rx="1" />
        <path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    )
  }

  if (tab === 'usage') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2v20" />
        <path d="M17 5.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    )
  }

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="m8 7-5 5 5 5" />
      <path d="m16 7 5 5-5 5" />
      <path d="m14 4-4 16" />
    </svg>
  )
}

function MinimizeIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 12h14" />
    </svg>
  )
}

function CloseIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m18 6-12 12" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function MinimalistToggle({
  checked,
  onChange,
  label,
  description,
  disabled
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <label className={`text-sm font-medium ${disabled ? 'text-neutral-600' : 'text-neutral-100'}`}>{label}</label>
        {description ? (
          <p className={`mt-1 text-xs ${disabled ? 'text-neutral-700' : 'text-neutral-400'}`}>{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border transition-all ${
          checked
            ? 'border-emerald-400/60 bg-emerald-400/30 shadow-lg shadow-emerald-500/20'
            : 'border-neutral-700 bg-neutral-800'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-neutral-100 transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          } shadow-sm`}
        />
      </button>
    </div>
  )
}

function SectionCard({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: JSX.Element
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5">
      <h2 className="text-base font-semibold text-neutral-100">{title}</h2>
      <p className="mt-1 text-sm text-neutral-400">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

const MODIFIER_KEY_DISPLAY: Record<string, string> = {
  Control: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Meta: 'Win'
}

function normalizeKeyName(key: string): string {
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

interface ShortcutRecorderProps {
  value: string
  onChange: (shortcut: string) => void
  conflictWarning?: string | null
  defaultShortcut: string
  onReset: () => void
}

function ShortcutRecorder({
  value,
  onChange,
  conflictWarning,
  defaultShortcut,
  onReset
}: ShortcutRecorderProps): JSX.Element {
  const [isRecording, setIsRecording] = useState(false)
  const [previousValue, setPreviousValue] = useState(value)

  const startRecording = (): void => {
    setPreviousValue(value)
    setIsRecording(true)
  }

  const cancelRecording = (): void => {
    setIsRecording(false)
  }

  useEffect(() => {
    if (!isRecording) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()

      const modifiers: string[] = []
      if (event.ctrlKey) modifiers.push('Ctrl')
      if (event.altKey) modifiers.push('Alt')
      if (event.shiftKey) modifiers.push('Shift')
      if (event.metaKey) modifiers.push('Win')

      const keyName = normalizeKeyName(event.key)

      if (MODIFIER_KEY_DISPLAY[keyName]) {
        return
      }

      if (event.key === 'Escape') {
        setIsRecording(false)
        return
      }

      const combo = modifiers.length > 0
        ? `${modifiers.join('+')}+${keyName}`
        : keyName

      setIsRecording(false)
      onChange(combo)
    }

    const handleBlur = (): void => {
      setIsRecording(false)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('blur', handleBlur)
    }
  }, [isRecording, onChange])

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={startRecording}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm text-left transition-colors cursor-pointer ${
            isRecording
              ? 'border-amber-500/60 bg-amber-500/10 text-amber-200 animate-pulse'
              : !value
                ? 'border-neutral-800 bg-neutral-950 text-neutral-600'
                : 'border-neutral-700 bg-neutral-950 text-neutral-100 hover:border-neutral-600'
          }`}
        >
          {isRecording
            ? 'Press a key combo...'
            : value || (
              <span className="italic text-neutral-600">Disabled</span>
            )}
        </button>

        <button
          type="button"
          onClick={() => {
            setIsRecording(false)
            onReset()
          }}
          className="flex-shrink-0 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-2 text-xs text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200"
          title={`Reset to default (${defaultShortcut})`}
        >
          Reset
        </button>
      </div>

      {conflictWarning ? (
        <p className="mt-2 text-xs text-amber-400">{conflictWarning}</p>
      ) : null}
    </div>
  )
}

function getAppTargetsSummary(app: LauncherApp): string {
  const targets = normalizeLaunchTargets(app.targets, app.path, app.arguments)
  return formatTargetsSummary(targets)
}

function formatUpdateBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, exponent)
  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function getUpdateStatusLabel(status: UpdateStatus): string {
  switch (status.state) {
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return status.downloadUrl
        ? `Version ${status.version ?? ''} is available. Download the installer to update.`
        : `Version ${status.version ?? ''} found. Downloading…`
    case 'downloading':
      return `Downloading version ${status.version ?? ''}…`
    case 'downloaded':
      return `Version ${status.version ?? ''} is ready. Restart to finish installing.`
    case 'not-available':
      return 'You are on the latest version.'
    case 'error':
      return `Update check failed${status.error ? `: ${status.error}` : '.'}`
    default:
      return 'No update check has run yet.'
  }
}

interface AppearanceTabProps {
  selectedTheme: string
  onSelectTheme: (gradientClass: string) => void
  textureIntensity: number
  onTextureIntensityChange: (value: number) => void
  buttonVisibility: ButtonVisibility
  onButtonVisibilityChange: (value: ButtonVisibility) => void
  launcherShowSystemApps: boolean
  onLauncherShowSystemAppsChange: (value: boolean) => void
}

function AppearanceTab({
  selectedTheme,
  onSelectTheme,
  textureIntensity,
  onTextureIntensityChange,
  buttonVisibility,
  onButtonVisibilityChange,
  launcherShowSystemApps,
  onLauncherShowSystemAppsChange
}: AppearanceTabProps): JSX.Element {
  const isWindows = window.api?.platform === 'win32'

  return (
    <div className="space-y-6">
      <SectionCard
        title="Theme"
        description="Pick a gradient preset. Changes apply instantly across windows."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {THEME_OPTIONS.map((themeOption) => {
            const isActive = selectedTheme === themeOption.gradientClass

            return (
              <button
                key={themeOption.id}
                type="button"
                onClick={() => onSelectTheme(themeOption.gradientClass)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  isActive
                    ? 'border-neutral-500 bg-neutral-800/80'
                    : 'border-neutral-800 bg-neutral-900/70 hover:border-neutral-600 hover:bg-neutral-800/60'
                }`}
              >
                <div
                  className="h-10 rounded-lg border border-neutral-700/60"
                  style={{
                    backgroundImage: `linear-gradient(to right, ${themeOption.preview.from}, ${themeOption.preview.to})`
                  }}
                />
                <p className="mt-3 text-sm font-medium text-neutral-100">{themeOption.label}</p>
                <p className="mt-1 text-xs text-neutral-400">{themeOption.description}</p>
              </button>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Texture"
        description="Add a subtle film-grain texture over themed surfaces."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="texture-intensity" className="text-sm font-medium text-neutral-200">
              Grain intensity
            </label>
            <span className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-medium tabular-nums text-neutral-300">
              {textureIntensity}%
            </span>
          </div>

          <input
            id="texture-intensity"
            type="range"
            min={0}
            max={MAX_TEXTURE_INTENSITY}
            step={1}
            value={textureIntensity}
            onChange={(event) => onTextureIntensityChange(Number(event.target.value))}
            className="w-full cursor-pointer accent-neutral-200"
          />

          <div className="flex justify-between text-[10px] uppercase tracking-[0.08em] text-neutral-500">
            <span>Off</span>
            <span>Subtle</span>
            <span>Strong</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Bar Buttons"
        description="Choose which buttons appear on the floating command bar. The Settings button is always visible."
      >
        <div className="space-y-4">
          <MinimalistToggle
            checked={buttonVisibility.appLauncher}
            onChange={(checked) => onButtonVisibilityChange({ ...buttonVisibility, appLauncher: checked })}
            label="App Launcher"
            description="Show the App Launcher button to quickly open your favorite applications."
          />
          <MinimalistToggle
            checked={buttonVisibility.workflow}
            onChange={(checked) => onButtonVisibilityChange({ ...buttonVisibility, workflow: checked })}
            label="Workflows"
            description="Show the Workflows button to run saved scripts and automations."
          />
          <MinimalistToggle
            checked={buttonVisibility.tasks}
            onChange={(checked) => onButtonVisibilityChange({ ...buttonVisibility, tasks: checked })}
            label="Tasks"
            description="Show the Tasks button to quickly capture and check off to-dos."
          />
        </div>
      </SectionCard>

      {isWindows && (
        <SectionCard
          title="App Launcher"
          description="Control which installed applications appear in the command bar search."
        >
          <MinimalistToggle
            checked={launcherShowSystemApps}
            onChange={onLauncherShowSystemAppsChange}
            label="Show Windows system apps"
            description="Include built-in Windows utilities, administrative tools and documentation shortcuts. Leave off to only see the apps you installed."
          />
        </SectionCard>
      )}
    </div>
  )
}

interface GeneralTabProps {
  apiKey: string
  onApiKeyChange: (value: string) => void
  proxyUrl: string
  onProxyUrlChange: (value: string) => void
  isAdvancedOpen: boolean
  onToggleAdvanced: () => void
  onSaveOpenAISettings: () => void
  isSavingApiKey: boolean
  saveFeedbackMessage: string
  launchOnStartup: boolean
  onLaunchOnStartupChange: (value: boolean) => void
  chatModel: string
  onChatModelChange: (value: string) => void
  reasoningEffort: ReasoningEffort
  onReasoningEffortChange: (value: ReasoningEffort) => void
  enableWebSearch: boolean
  onWebSearchChange: (value: boolean) => void
  autoCollapseReasoning: boolean
  onAutoCollapseReasoningChange: (value: boolean) => void
  autoUpdate: boolean
  onAutoUpdateChange: (value: boolean) => void
  updateStatus: UpdateStatus
  onCheckForUpdates: () => void
  onInstallUpdate: () => void
  shortcuts: ShortcutConfig
  onShortcutChange: (field: keyof ShortcutConfig, value: string) => void
}

function GeneralTab({
  apiKey,
  onApiKeyChange,
  proxyUrl,
  onProxyUrlChange,
  isAdvancedOpen,
  onToggleAdvanced,
  onSaveOpenAISettings,
  isSavingApiKey,
  saveFeedbackMessage,
  launchOnStartup,
  onLaunchOnStartupChange,
  chatModel,
  onChatModelChange,
  reasoningEffort,
  onReasoningEffortChange,
  enableWebSearch,
  onWebSearchChange,
  autoCollapseReasoning,
  onAutoCollapseReasoningChange,
  autoUpdate,
  onAutoUpdateChange,
  updateStatus,
  onCheckForUpdates,
  onInstallUpdate,
  shortcuts,
  onShortcutChange
}: GeneralTabProps): JSX.Element {
  return (
    <div className="space-y-6">
      <SectionCard
        title="OpenAI API Key"
        description="Stored in your local OS user data directory. This key is used by Covenant chat requests."
      >
        <div>
          <label htmlFor="openai-key" className="mb-2 block text-sm font-medium text-neutral-300">
            API Key
          </label>

          <div className="flex items-center gap-3">
            <input
              id="openai-key"
              type="password"
              value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder="sk-..."
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
              autoComplete="off"
            />

            <button
              type="button"
              onClick={onSaveOpenAISettings}
              disabled={isSavingApiKey}
              className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingApiKey ? 'Saving...' : 'Save'}
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleAdvanced}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-neutral-100"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={isAdvancedOpen ? 'rotate-90 transition-transform' : 'transition-transform'}
              aria-hidden
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            <span>Advanced settings</span>
          </button>

          {isAdvancedOpen ? (
            <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
              <label htmlFor="openai-proxy-url" className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Proxy URL
              </label>
              <input
                id="openai-proxy-url"
                type="text"
                value={proxyUrl}
                onChange={(event) => onProxyUrlChange(event.target.value)}
                placeholder="http://proxy.company.local:8080"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                autoComplete="off"
              />
              <p className="mt-2 text-xs text-neutral-500">
                Use this when your company routes outbound traffic through a proxy. Applies to OpenAI requests and MCP
                server connections. Leave empty for direct access.
              </p>
            </div>
          ) : null}

          <p className="mt-2 text-xs text-neutral-500">Saved locally in the native user data folder as part of config.json.</p>
          {saveFeedbackMessage ? <p className="mt-2 text-xs text-emerald-300">{saveFeedbackMessage}</p> : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Startup"
        description="Automatically launch Covenant when you start your computer."
      >
        <div className="space-y-4">
          <MinimalistToggle
            checked={launchOnStartup}
            onChange={onLaunchOnStartupChange}
            label="Launch on startup"
            description="Covenant will open automatically when your system starts."
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Updates"
        description="Covenant checks GitHub Releases for new versions in the background."
      >
        <div className="space-y-4">
          <MinimalistToggle
            checked={autoUpdate}
            onChange={onAutoUpdateChange}
            label="Automatically check for updates"
            description="Check GitHub Releases for new versions and let you know when an update is available."
          />

          <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-200">
                  Covenant v{updateStatus.currentVersion}
                </p>
                <p className={`mt-1 text-xs ${updateStatus.state === 'error' ? 'text-red-400' : 'text-neutral-400'}`}>
                  {getUpdateStatusLabel(updateStatus)}
                </p>
              </div>

              {updateStatus.state === 'downloaded' || (updateStatus.state === 'available' && updateStatus.downloadUrl) ? (
                <button
                  type="button"
                  onClick={onInstallUpdate}
                  className="flex-shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
                >
                  {updateStatus.state === 'downloaded' ? 'Restart & install' : 'Download'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onCheckForUpdates}
                  disabled={updateStatus.state === 'checking' || updateStatus.state === 'downloading'}
                  className="flex-shrink-0 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updateStatus.state === 'checking' ? 'Checking…' : 'Check for updates'}
                </button>
              )}
            </div>

            {typeof updateStatus.percent === 'number' &&
            (updateStatus.state === 'downloading' || updateStatus.state === 'downloaded') ? (
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      updateStatus.state === 'downloaded' ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${Math.min(Math.max(updateStatus.percent, 0), 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {Math.round(updateStatus.percent)}%
                  {updateStatus.state === 'downloading' && updateStatus.bytesPerSecond
                    ? ` · ${formatUpdateBytes(updateStatus.transferred)} / ${formatUpdateBytes(updateStatus.total)} · ${formatUpdateBytes(updateStatus.bytesPerSecond)}/s`
                    : ''}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Chat Model"
        description="Select which OpenAI model to use for AI conversations. Changes apply immediately."
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Model
            </label>
            <CustomSelect
              options={CHAT_MODEL_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label
              }))}
              value={chatModel || DEFAULT_CHAT_MODEL}
              onChange={onChatModelChange}
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${modelSupportsExtendedParams(chatModel || DEFAULT_CHAT_MODEL) ? 'text-neutral-300' : 'text-neutral-600'}`}>
              Reasoning Effort
            </label>
            <CustomSelect
              options={REASONING_EFFORT_OPTIONS.map((effort) => ({
                value: effort,
                label: effort.charAt(0).toUpperCase() + effort.slice(1)
              }))}
              value={reasoningEffort || DEFAULT_REASONING_EFFORT}
              onChange={(value) => onReasoningEffortChange(value as ReasoningEffort)}
              disabled={!modelSupportsExtendedParams(chatModel || DEFAULT_CHAT_MODEL)}
            />
            <p className={`mt-2 text-xs ${modelSupportsExtendedParams(chatModel || DEFAULT_CHAT_MODEL) ? 'text-neutral-500' : 'text-neutral-600'}`}>
              {modelSupportsExtendedParams(chatModel || DEFAULT_CHAT_MODEL)
                ? 'Controls how much compute the model spends reasoning.'
                : 'Not supported by this model.'}
            </p>
          </div>

          <MinimalistToggle
            checked={enableWebSearch}
            onChange={onWebSearchChange}
            label="Web Search"
            description="Allow the model to search the web for up-to-date information. Requires Responses API support."
            disabled={!modelSupportsWebSearch(chatModel || DEFAULT_CHAT_MODEL)}
          />

          <MinimalistToggle
            checked={autoCollapseReasoning}
            onChange={onAutoCollapseReasoningChange}
            label="Auto-collapse Reasoning"
            description="Automatically collapse the reasoning panel after the response completes."
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Keyboard Shortcuts"
        description="Configure global shortcuts to open Covenant. These are OS-level shortcuts that work from anywhere. In-app navigation (Tab, Ctrl+Tab) is unaffected by these settings."
      >
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Open App
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Toggles the Covenant command bar open/close.
            </p>
            <ShortcutRecorder
              value={shortcuts.openApp}
              onChange={(val) => onShortcutChange('openApp', val)}
              conflictWarning={
                shortcuts.openApp && shortcuts.openAppTerminal && shortcuts.openApp === shortcuts.openAppTerminal
                  ? 'This shortcut is also assigned to Open App in Terminal Mode'
                  : null
              }
              defaultShortcut={DEFAULT_SHORTCUTS.openApp}
              onReset={() => onShortcutChange('openApp', DEFAULT_SHORTCUTS.openApp)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Open App in Terminal Mode
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Opens Covenant directly with the terminal panel visible and focused, skipping the AI bar.
            </p>
            <ShortcutRecorder
              value={shortcuts.openAppTerminal}
              onChange={(val) => onShortcutChange('openAppTerminal', val)}
              conflictWarning={
                shortcuts.openAppTerminal && shortcuts.openApp && shortcuts.openAppTerminal === shortcuts.openApp
                  ? 'This shortcut is also assigned to Open App'
                  : null
              }
              defaultShortcut={DEFAULT_SHORTCUTS.openAppTerminal}
              onReset={() => onShortcutChange('openAppTerminal', DEFAULT_SHORTCUTS.openAppTerminal)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Open Tasks
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Opens Covenant directly on the Tasks quick-capture list.
            </p>
            <ShortcutRecorder
              value={shortcuts.openTasks}
              onChange={(val) => onShortcutChange('openTasks', val)}
              conflictWarning={
                shortcuts.openTasks && shortcuts.openApp && shortcuts.openTasks === shortcuts.openApp
                  ? 'This shortcut is also assigned to Open App'
                  : shortcuts.openTasks && shortcuts.openAppTerminal && shortcuts.openTasks === shortcuts.openAppTerminal
                    ? 'This shortcut is also assigned to Open App in Terminal Mode'
                    : null
              }
              defaultShortcut={DEFAULT_SHORTCUTS.openTasks}
              onReset={() => onShortcutChange('openTasks', DEFAULT_SHORTCUTS.openTasks)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Open Paste Manager
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Opens the clipboard history window. Only active when Paste Manager is enabled.
            </p>
            <ShortcutRecorder
              value={shortcuts.openPaste}
              onChange={(val) => onShortcutChange('openPaste', val)}
              conflictWarning={
                shortcuts.openPaste && shortcuts.openApp && shortcuts.openPaste === shortcuts.openApp
                  ? 'This shortcut is also assigned to Open App'
                  : shortcuts.openPaste && shortcuts.openAppTerminal && shortcuts.openPaste === shortcuts.openAppTerminal
                    ? 'This shortcut is also assigned to Open App in Terminal Mode'
                    : shortcuts.openPaste && shortcuts.openTasks && shortcuts.openPaste === shortcuts.openTasks
                      ? 'This shortcut is also assigned to Open Tasks'
                      : null
              }
              defaultShortcut={DEFAULT_SHORTCUTS.openPaste}
              onReset={() => onShortcutChange('openPaste', DEFAULT_SHORTCUTS.openPaste)}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

interface TerminalTabProps {
  terminalFont: string
  onTerminalFontSelect: (fontFamily: string) => void
  preferredShell?: string
  onPreferredShellChange: (shell: string) => void
}

function TerminalTab({ terminalFont, onTerminalFontSelect, preferredShell, onPreferredShellChange }: TerminalTabProps): JSX.Element {
  const [availableFonts, setAvailableFonts] = useState<string[]>([])
  const [isLoadingFonts, setIsLoadingFonts] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadFonts = async (): Promise<void> => {
      if (!window.api?.config.getTerminalFonts) return

      try {
        setIsLoadingFonts(true)
        const fonts = await window.api.config.getTerminalFonts()
        if (!isMounted) return
        setAvailableFonts(fonts)
      } catch {
        if (!isMounted) return
        setAvailableFonts([])
      } finally {
        if (!isMounted) return
        setIsLoadingFonts(false)
      }
    }

    void loadFonts()

    return () => {
      isMounted = false
    }
  }, [])

  const selectedFont = normalizeTerminalFont(terminalFont)
  const fontOptions = useMemo(
    () =>
      selectedFont && !availableFonts.includes(selectedFont)
        ? [selectedFont, ...availableFonts]
        : availableFonts,
    [availableFonts, selectedFont]
  )

  return (
    <div className="space-y-6">
      <SectionCard
        title="Terminal Shell"
        description="Choose your preferred shell for Terminal Mode. The app will automatically fall back to available shells if your preference isn't found."
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-100">
              Preferred Shell
            </label>
            <input
              type="text"
              value={preferredShell || ''}
              onChange={(e) => onPreferredShellChange(e.target.value)}
              placeholder="/bin/zsh"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 transition-colors focus:border-neutral-600 focus:outline-none"
            />
            <p className="mt-2 text-xs text-neutral-400">
              Examples: /bin/zsh, /bin/bash, /bin/sh. Leave empty to auto-detect.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Terminal Font"
        description="Choose how your shell text is rendered in Terminal Mode. This updates instantly and is saved locally."
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-100">
              Terminal Fonts
            </label>
            <select
              value={selectedFont}
              onChange={(e) => onTerminalFontSelect(e.target.value)}
              disabled={isLoadingFonts}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 transition-colors focus:border-neutral-600 focus:outline-none disabled:opacity-50"
            >
              <option value="">
                {isLoadingFonts ? 'Loading terminal fonts...' : 'Select a terminal font'}
              </option>
              {fontOptions.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </div>

          {terminalFont && (
            <div>
              <p className="text-xs text-neutral-400 mb-2">Preview:</p>
              <p
                className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                style={{ fontFamily: terminalFont }}
              >
                PS C:\Projects\Covenant&gt; git status
              </p>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}


interface AppLauncherTabProps {
  apps: LauncherApp[]
  isLoading: boolean
  feedbackMessage: string
  onAdd: () => void
  onEdit: (launcherApp: LauncherApp) => void
  onDelete: (launcherApp: LauncherApp) => void
}

function AppLauncherTab({
  apps,
  isLoading,
  feedbackMessage,
  onAdd,
  onEdit,
  onDelete
}: AppLauncherTabProps): JSX.Element {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-100">App Launcher</h2>
          <p className="mt-1 text-sm text-neutral-400">Configure shortcuts for apps launched by the App Launcher button.</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
        >
          Add Application
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/80">
        <div className="grid grid-cols-[80px_1fr_2fr_160px] border-b border-neutral-800 bg-neutral-900 px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
          <span>Icon</span>
          <span>App Name</span>
          <span>Apps</span>
          <span className="text-right">Actions</span>
        </div>

        {isLoading ? (
          <div className="px-4 py-6 text-sm text-neutral-400">Loading applications...</div>
        ) : null}

        {!isLoading && apps.length === 0 ? (
          <div className="px-4 py-6 text-sm text-neutral-500">No applications saved yet. Add your first launcher shortcut.</div>
        ) : null}

        {!isLoading &&
          apps.map((appItem) => (
          <div
            key={appItem.id}
            className="grid grid-cols-[80px_1fr_2fr_160px] items-center border-b border-neutral-800 px-4 py-3 text-sm last:border-b-0"
          >
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-200">
              {getAppBadgeText(appItem.title)}
            </span>
            <span className="text-neutral-100">{appItem.title}</span>
            <span className="truncate text-neutral-400">{getAppTargetsSummary(appItem)}</span>
            <span className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onEdit(appItem)}
                className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(appItem)}
                className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-300"
              >
                Delete
              </button>
            </span>
          </div>
        ))}
      </div>

      {feedbackMessage ? <p className="text-xs text-emerald-300">{feedbackMessage}</p> : null}
    </div>
  )
}

interface WorkflowsTabProps {
  workflows: Workflow[]
  isLoading: boolean
  feedbackMessage: string
  onAdd: () => void
  onEdit: (workflow: Workflow) => void
  onDelete: (workflow: Workflow) => void
}

function WorkflowsTab({
  workflows,
  isLoading,
  feedbackMessage,
  onAdd,
  onEdit,
  onDelete
}: WorkflowsTabProps): JSX.Element {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-100">Workflows & Prompts</h2>
          <p className="mt-1 text-sm text-neutral-400">Build reusable script and prompt actions for the Workflows button.</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
        >
          Add Workflow
        </button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 px-4 py-6 text-sm text-neutral-400">
            Loading workflows...
          </div>
        ) : null}

        {!isLoading && workflows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/70 px-4 py-6 text-sm text-neutral-500">
            No workflows saved yet. Add your first executable workflow.
          </div>
        ) : null}

        {!isLoading && workflows.map((item) => (
          <article key={item.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">{item.title}</h3>
                <span className="mt-2 inline-flex rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs uppercase tracking-[0.06em] text-amber-300">
                  {item.language}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-300"
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-400">
              {item.content.substring(0, 50)}...
            </p>
          </article>
        ))}
      </div>

      {feedbackMessage ? <p className="text-xs text-emerald-300">{feedbackMessage}</p> : null}
    </div>
  )
}

interface PrepromptsTabProps {
  preprompts: Preprompt[]
  isLoading: boolean
  feedbackMessage: string
  onAdd: () => void
  onEdit: (preprompt: Preprompt) => void
  onDelete: (preprompt: Preprompt) => void
  globalInstructions: string
  savedGlobalInstructions: string
  isGlobalInstructionsSaving: boolean
  globalInstructionsFeedbackMessage: string
  onGlobalInstructionsChange: (value: string) => void
  onSaveGlobalInstructions: () => void
}

function PrepromptsTab({
  preprompts,
  isLoading,
  feedbackMessage,
  onAdd,
  onEdit,
  onDelete,
  globalInstructions,
  savedGlobalInstructions,
  isGlobalInstructionsSaving,
  globalInstructionsFeedbackMessage,
  onGlobalInstructionsChange,
  onSaveGlobalInstructions
}: PrepromptsTabProps): JSX.Element {
  const isGlobalInstructionsDirty = globalInstructions !== savedGlobalInstructions

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Global Instructions</h2>
            <p className="mt-1 text-xs text-neutral-400">
              Always applied to every chat, before any selected instruction below.
            </p>
          </div>
          <button
            type="button"
            onClick={onSaveGlobalInstructions}
            disabled={!isGlobalInstructionsDirty || isGlobalInstructionsSaving}
            className="shrink-0 rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGlobalInstructionsSaving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <textarea
          value={globalInstructions}
          onChange={(event) => onGlobalInstructionsChange(event.target.value)}
          placeholder="Write instructions that should apply to every conversation..."
          className="mt-3 min-h-[140px] w-full resize-y rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
        />

        {globalInstructionsFeedbackMessage ? (
          <p className="mt-2 text-xs text-emerald-300">{globalInstructionsFeedbackMessage}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-100">Instructions</h2>
          <p className="mt-1 text-sm text-neutral-400">Reusable instruction presets for the Instructions selector in the bar's Settings popup.</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
        >
          Add Instruction
        </button>
      </div>

      {feedbackMessage ? <p className="text-xs text-emerald-300">{feedbackMessage}</p> : null}

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 px-4 py-6 text-sm text-neutral-400">
            Loading instructions...
          </div>
        ) : null}

        {!isLoading && preprompts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/70 px-4 py-6 text-sm text-neutral-500">
            No instructions saved yet. Add your first reusable instruction.
          </div>
        ) : null}

        {!isLoading &&
          preprompts.map((item) => (
          <article key={item.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-sm font-semibold text-neutral-100">{item.title}</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-300"
                >
                  Delete
                </button>
              </div>
            </div>

            <p className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-400">
              {item.content}
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}

export default function Settings(): JSX.Element {
  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialTab)
  const [apiKey, setApiKey] = useState('')
  const [adminApiKey, setAdminApiKey] = useState('')
  const [usageProjectId, setUsageProjectId] = useState('')
  const [proxyUrl, setProxyUrl] = useState('')
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState(DEFAULT_THEME_GRADIENT)
  const [launchOnStartup, setLaunchOnStartup] = useState(true)
  const [terminalFont, setTerminalFont] = useState(DEFAULT_TERMINAL_FONT)
  const [preferredShell, setPreferredShell] = useState<string | undefined>(undefined)
  const [isSavingApiKey, setIsSavingApiKey] = useState(false)
  const [saveFeedbackMessage, setSaveFeedbackMessage] = useState('')
  const [chatModel, setChatModel] = useState(DEFAULT_CHAT_MODEL)
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT)
  const [enableWebSearch, setEnableWebSearch] = useState(true)
  const [autoCollapseReasoning, setAutoCollapseReasoning] = useState(true)
  const [textureIntensity, setTextureIntensity] = useState(DEFAULT_TEXTURE_INTENSITY)
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle', currentVersion: '' })
  const [buttonVisibility, setButtonVisibility] = useState<ButtonVisibility>({ appLauncher: true, workflow: true, tasks: true })
  const [launcherShowSystemApps, setLauncherShowSystemApps] = useState(false)
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>({ ...DEFAULT_SHORTCUTS })
  const [pasteSettings, setPasteSettings] = useState<PasteManagerSettings>({ ...DEFAULT_PASTE_SETTINGS })
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
        setButtonVisibility(config.buttonVisibility ?? { appLauncher: true, workflow: true, tasks: true })
        setLauncherShowSystemApps(config.launcherShowSystemApps === true)
        setShortcuts(config.shortcuts ?? { ...DEFAULT_SHORTCUTS })
        setPasteSettings(normalizePasteManagerSettings(config.pasteManager))
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
        setButtonVisibility({ appLauncher: true, workflow: true, tasks: true })
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
    try {
      setIsSavingApiKey(true)
      if (window.api?.config.saveOpenAISettings) {
        window.api.config.saveOpenAISettings({ apiKey, proxyUrl, adminApiKey })
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

  const pageTitle = useMemo(() => {
    if (activeTab === 'general') return 'General'
    if (activeTab === 'usage') return 'Usage & Cost'
    if (activeTab === 'appearance') return 'Appearance'
    if (activeTab === 'terminal') return 'Terminal'
    if (activeTab === 'appLauncher') return 'App Launcher'
    if (activeTab === 'workflow') return 'Workflows'
    if (activeTab === 'preprompts') return 'Instructions'
    if (activeTab === 'mcp') return 'MCP Servers'
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
                onSaveAdminKey={handleSaveOpenAISettings}
                isSavingAdminKey={isSavingApiKey}
                adminKeyFeedback={saveFeedbackMessage}
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
