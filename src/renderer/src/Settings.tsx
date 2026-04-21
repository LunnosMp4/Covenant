import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { AnimatePresence } from 'framer-motion'
import AppFormModal from './components/AppFormModal'
import ConfirmDeleteModal from './components/ConfirmDeleteModal'
import PrepromptFormModal from './components/PrepromptFormModal'
import WorkflowFormModal from './components/WorkflowFormModal'
import type { LauncherApp } from './types/launcher-app'
import type { Preprompt } from './types/preprompt'
import type { Workflow } from './types/workflow'

type SettingsTab = 'general' | 'module2' | 'module3' | 'module4'

interface ThemeOption {
  id: string
  label: string
  description: string
  gradientClass: string
}

interface AppConfig {
  apiKey: string
  themeGradient: string
  proxyUrl: string
}

const DEFAULT_THEME_GRADIENT = 'from-neutral-900/95 to-neutral-900/95'
const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'dark-default',
    label: 'Dark Neutral',
    description: 'Balanced dark gradient',
    gradientClass: 'from-neutral-900/95 to-neutral-900/95'
  },
  {
    id: 'blue-depth',
    label: 'Blue Depth',
    description: 'Cool steel tone',
    gradientClass: 'from-slate-900/95 to-blue-900/95'
  },
  {
    id: 'violet-focus',
    label: 'Violet Focus',
    description: 'Focused creative mood',
    gradientClass: 'from-zinc-900/95 to-violet-900/95'
  },
  {
    id: 'emerald-night',
    label: 'Emerald Night',
    description: 'Dark green accent',
    gradientClass: 'from-neutral-900/95 to-emerald-900/95'
  }
]

const THEME_GRADIENT_SET = new Set<string>(THEME_OPTIONS.map((option) => option.gradientClass))

function normalizeThemeGradient(themeGradient: string | undefined): string {
  if (!themeGradient) return DEFAULT_THEME_GRADIENT
  return THEME_GRADIENT_SET.has(themeGradient) ? themeGradient : DEFAULT_THEME_GRADIENT
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

  if (tab === 'module2') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.6" />
        <rect x="14" y="3" width="7" height="7" rx="1.6" />
        <rect x="3" y="14" width="7" height="7" rx="1.6" />
        <rect x="14" y="14" width="7" height="7" rx="1.6" />
      </svg>
    )
  }

  if (tab === 'module4') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M9 9h8" />
        <path d="M9 13h5" />
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

function getAppBadgeText(title: string): string {
  const trimmedTitle = title.trim()
  return trimmedTitle.slice(0, 2).toUpperCase() || 'AP'
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
  selectedTheme: string
  onSelectTheme: (gradientClass: string) => void
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
  selectedTheme,
  onSelectTheme
}: GeneralTabProps): JSX.Element {
  return (
    <div className="space-y-6">
      <SectionCard
        title="OpenAI API Key"
        description="Stored in your local OS user data directory. This key is used by Prometheus chat requests."
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
                Use this when your company routes outbound traffic through a proxy. Leave empty for direct access.
              </p>
            </div>
          ) : null}

          <p className="mt-2 text-xs text-neutral-500">Saved locally in the native user data folder as part of config.json.</p>
          {saveFeedbackMessage ? <p className="mt-2 text-xs text-emerald-300">{saveFeedbackMessage}</p> : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Appearance"
        description="Pick a gradient preset for the floating command bar. Changes apply instantly across windows."
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
                <div className={`h-10 rounded-lg bg-gradient-to-r ${themeOption.gradientClass}`} />
                <p className="mt-3 text-sm font-medium text-neutral-100">{themeOption.label}</p>
                <p className="mt-1 text-xs text-neutral-400">{themeOption.description}</p>
              </button>
            )
          })}
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
          <p className="mt-1 text-sm text-neutral-400">Configure shortcuts for apps launched by Module 2.</p>
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
          <span>Path</span>
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
            <span className="truncate text-neutral-400">{appItem.path}</span>
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
          <p className="mt-1 text-sm text-neutral-400">Build reusable script and prompt actions for Module 3.</p>
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
              {item.content}
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
  onAdd: () => void
  onEdit: (preprompt: Preprompt) => void
  onDelete: (preprompt: Preprompt) => void
}

function PrepromptsTab({ preprompts, isLoading, onAdd, onEdit, onDelete }: PrepromptsTabProps): JSX.Element {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-100">Preprompts</h2>
          <p className="mt-1 text-sm text-neutral-400">Reusable instruction presets for Module 4 prompt injection.</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
        >
          Add Preprompt
        </button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 px-4 py-6 text-sm text-neutral-400">
            Loading preprompts...
          </div>
        ) : null}

        {!isLoading && preprompts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/70 px-4 py-6 text-sm text-neutral-500">
            No preprompts saved yet. Add your first reusable prompt.
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
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [apiKey, setApiKey] = useState('')
  const [proxyUrl, setProxyUrl] = useState('')
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState(DEFAULT_THEME_GRADIENT)
  const [isSavingApiKey, setIsSavingApiKey] = useState(false)
  const [saveFeedbackMessage, setSaveFeedbackMessage] = useState('')
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
  const [isPrepromptFormOpen, setIsPrepromptFormOpen] = useState(false)
  const [editingPreprompt, setEditingPreprompt] = useState<Preprompt | undefined>(undefined)
  const [deletingPreprompt, setDeletingPreprompt] = useState<Preprompt | undefined>(undefined)

  const dragRegionStyle = { WebkitAppRegion: 'drag' } as CSSProperties
  const noDragRegionStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties

  useEffect(() => {
    let isMounted = true

    const loadConfig = async (): Promise<void> => {
      if (!window.api?.config.getConfig) return

      try {
        const config = (await window.api.config.getConfig()) as AppConfig
        if (!isMounted) return

        setApiKey(typeof config.apiKey === 'string' ? config.apiKey : '')
        setProxyUrl(typeof config.proxyUrl === 'string' ? config.proxyUrl : '')
        setSelectedTheme(normalizeThemeGradient(config.themeGradient))
      } catch {
        if (!isMounted) return
        setApiKey('')
        setProxyUrl('')
        setSelectedTheme(DEFAULT_THEME_GRADIENT)
      }
    }

    void loadConfig()

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

    return () => {
      isMounted = false
    }
  }, [])

  const handleMinimizeWindow = (): void => {
    window.api?.window.minimizeSettings?.()
  }

  const handleCloseWindow = (): void => {
    window.api?.window.closeSettings?.()
  }

  const handleSaveOpenAISettings = (): void => {
    try {
      setIsSavingApiKey(true)
      if (window.api?.config.saveOpenAISettings) {
        window.api.config.saveOpenAISettings({ apiKey, proxyUrl })
      } else {
        window.api?.config.saveApiKey?.(apiKey)
      }

      setSaveFeedbackMessage('OpenAI settings saved locally.')
      window.setTimeout(() => setSaveFeedbackMessage(''), 1800)
    } finally {
      setIsSavingApiKey(false)
    }
  }

  const handleThemeSelect = (gradientClass: string): void => {
    const safeTheme = normalizeThemeGradient(gradientClass)
    setSelectedTheme(safeTheme)
    window.api?.config.updateTheme?.(safeTheme)
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
    path: string
    iconBase64: string
    arguments: string
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

    const updatedPreprompts = await window.api.store.savePreprompt(payload)
    setPreprompts(updatedPreprompts)
    setIsPrepromptFormOpen(false)
    setEditingPreprompt(undefined)
  }

  const handleConfirmDeletePreprompt = async (): Promise<void> => {
    const target = deletingPreprompt
    if (!target || !window.api?.store.deletePreprompt) return

    const updatedPreprompts = await window.api.store.deletePreprompt(target.id)
    setPreprompts(updatedPreprompts)
    setDeletingPreprompt(undefined)
  }

  const pageTitle = useMemo(() => {
    if (activeTab === 'general') return 'General'
    if (activeTab === 'module2') return 'App Launcher (Mod 2)'
    if (activeTab === 'module3') return 'Workflows (Mod 3)'
    return 'Preprompts (Mod 4)'
  }, [activeTab])

  return (
    <div className="h-screen w-screen bg-transparent p-3 font-sans text-neutral-200">
      <div className="h-full overflow-hidden rounded-xl border border-neutral-800/80 bg-neutral-900/95 shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
        <div className="relative h-10 w-full">
          <div className="absolute inset-0 border-b border-neutral-800/80 bg-neutral-900/40" style={dragRegionStyle}>
            <div className="flex h-full items-center px-4 text-xs uppercase tracking-[0.1em] text-neutral-500">
              <span className="h-2 w-2 rounded-full bg-amber-400/80" />
              <span className="ml-2">Prometheus Settings</span>
            </div>
          </div>

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
        </div>

        <div className="flex h-[calc(100%-2.5rem)]">
          <aside className="w-64 border-r border-neutral-800 bg-neutral-950/70 p-4">
            <div className="px-2 pb-4 pt-2">
              <p className="text-xs uppercase tracking-[0.1em] text-neutral-500">Prometheus</p>
              <h1 className="mt-2 text-lg font-semibold text-neutral-100">Settings</h1>
            </div>

            <nav className="space-y-1">
              {[
                { id: 'general' as const, label: 'General' },
                { id: 'module2' as const, label: 'App Launcher (Mod 2)' },
                { id: 'module3' as const, label: 'Workflows (Mod 3)' },
                { id: 'module4' as const, label: 'Preprompts (Mod 4)' }
              ].map((item) => {
                const isActive = activeTab === item.id

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                      isActive
                        ? 'border-neutral-700 bg-neutral-800 text-neutral-100'
                        : 'border-transparent text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                    }`}
                  >
                    <span className="text-neutral-300">
                      <SidebarGlyph tab={item.id} />
                    </span>
                    <span>{item.label}</span>
                  </button>
                )
              })}
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
                selectedTheme={selectedTheme}
                onSelectTheme={handleThemeSelect}
              />
            )}
            {activeTab === 'module2' && (
              <AppLauncherTab
                apps={apps}
                isLoading={isAppsLoading}
                feedbackMessage={appsFeedbackMessage}
                onAdd={handleOpenAddApp}
                onEdit={handleOpenEditApp}
                onDelete={(launcherApp) => setDeletingApp(launcherApp)}
              />
            )}
            {activeTab === 'module3' && (
              <WorkflowsTab
                workflows={workflows}
                isLoading={isWorkflowsLoading}
                feedbackMessage={workflowsFeedbackMessage}
                onAdd={handleOpenAddWorkflow}
                onEdit={handleOpenEditWorkflow}
                onDelete={(workflow) => setDeletingWorkflow(workflow)}
              />
            )}
            {activeTab === 'module4' && (
              <PrepromptsTab
                preprompts={preprompts}
                isLoading={isPrepromptsLoading}
                onAdd={handleOpenAddPreprompt}
                onEdit={handleOpenEditPreprompt}
                onDelete={(preprompt) => setDeletingPreprompt(preprompt)}
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
            title="Delete Preprompt"
            message={`Are you sure you want to delete \"${deletingPreprompt.title}\"? This action cannot be undone.`}
            onCancel={() => setDeletingPreprompt(undefined)}
            onConfirm={() => {
              void handleConfirmDeletePreprompt()
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
