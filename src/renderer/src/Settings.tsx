import { useMemo, useState, type CSSProperties } from 'react'

type SettingsTab = 'general' | 'module2' | 'module3' | 'module4'

type WorkflowActionType = 'Script' | 'Prompt'

interface MockApp {
  id: string
  iconLabel: string
  name: string
  path: string
}

interface MockWorkflow {
  id: string
  title: string
  actionType: WorkflowActionType
  snippet: string
}

interface MockPreprompt {
  id: string
  title: string
  content: string
}

const MOCK_APPS: MockApp[] = [
  {
    id: 'app-1',
    iconLabel: 'N',
    name: 'Notion',
    path: 'C:/Users/T0329915/AppData/Local/Programs/Notion/Notion.exe'
  },
  {
    id: 'app-2',
    iconLabel: 'F',
    name: 'Firefox',
    path: 'C:/Program Files/Mozilla Firefox/firefox.exe'
  },
  {
    id: 'app-3',
    iconLabel: 'T',
    name: 'Terminal',
    path: 'C:/Users/T0329915/AppData/Local/Microsoft/WindowsApps/wt.exe'
  }
]

const MOCK_WORKFLOWS: MockWorkflow[] = [
  {
    id: 'wf-1',
    title: 'Deploy Preview Build',
    actionType: 'Script',
    snippet: 'npm run build && npm run deploy:preview'
  },
  {
    id: 'wf-2',
    title: 'Weekly Status Prompt',
    actionType: 'Prompt',
    snippet: 'Summarize this week by project, blockers, and next milestones in under 200 words.'
  },
  {
    id: 'wf-3',
    title: 'Clean Branches',
    actionType: 'Script',
    snippet: 'git fetch --prune && git branch --merged | grep -v "master"'
  }
]

const MOCK_PREPROMPTS: MockPreprompt[] = [
  {
    id: 'prompt-1',
    title: 'Coding Assistant',
    content:
      'Act as an expert TypeScript developer. Prioritize clean architecture, explicit types, and production-safe patterns.'
  },
  {
    id: 'prompt-2',
    title: 'Product Strategy Coach',
    content:
      'Help structure feature proposals with objectives, assumptions, risks, and measurable success criteria.'
  },
  {
    id: 'prompt-3',
    title: 'Documentation Writer',
    content:
      'Rewrite technical notes into concise, user-friendly documentation with clear headings and examples.'
  }
]

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

function GeneralTab(): JSX.Element {
  const [apiKey, setApiKey] = useState('')
  const [mainBarAccent, setMainBarAccent] = useState('#7a5530')
  const [popupAccent, setPopupAccent] = useState('#4e3d2a')

  return (
    <div className="space-y-6">
      <SectionCard
        title="OpenAI API Key"
        description="Use your API key for prompt-based modules. Data persistence will be wired in a later phase."
      >
        <div>
          <label htmlFor="openai-key" className="mb-2 block text-sm font-medium text-neutral-300">
            API Key
          </label>
          <input
            id="openai-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
            autoComplete="off"
          />
          <p className="mt-2 text-xs text-neutral-500">
            This key will be stored locally on your machine once persistence is enabled.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Appearance"
        description="Mock controls for editing the gradient accents on the command bar and module popups."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4">
            <p className="text-sm font-medium text-neutral-200">Main Bar Accent</p>
            <div
              className="mt-3 h-10 w-full rounded-lg border border-neutral-700"
              style={{
                backgroundImage: `linear-gradient(135deg, rgba(23, 23, 23, 0.9) 0%, ${mainBarAccent} 100%)`
              }}
            />
            <div className="mt-3 flex items-center gap-3">
              <input
                type="color"
                value={mainBarAccent}
                onChange={(event) => setMainBarAccent(event.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-neutral-700 bg-transparent"
                aria-label="Main bar gradient accent"
              />
              <input
                type="text"
                value={mainBarAccent}
                onChange={(event) => setMainBarAccent(event.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 focus:border-neutral-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4">
            <p className="text-sm font-medium text-neutral-200">Popup Accent</p>
            <div
              className="mt-3 h-10 w-full rounded-lg border border-neutral-700"
              style={{
                backgroundImage: `linear-gradient(135deg, rgba(23, 23, 23, 0.9) 0%, ${popupAccent} 100%)`
              }}
            />
            <div className="mt-3 flex items-center gap-3">
              <input
                type="color"
                value={popupAccent}
                onChange={(event) => setPopupAccent(event.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-neutral-700 bg-transparent"
                aria-label="Popup gradient accent"
              />
              <input
                type="text"
                value={popupAccent}
                onChange={(event) => setPopupAccent(event.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 focus:border-neutral-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

function AppLauncherTab(): JSX.Element {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-100">App Launcher</h2>
          <p className="mt-1 text-sm text-neutral-400">Configure shortcuts for apps launched by Module 2.</p>
        </div>
        <button
          type="button"
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

        {MOCK_APPS.map((appItem) => (
          <div
            key={appItem.id}
            className="grid grid-cols-[80px_1fr_2fr_160px] items-center border-b border-neutral-800 px-4 py-3 text-sm last:border-b-0"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950 text-sm font-semibold text-neutral-200">
              {appItem.iconLabel}
            </span>
            <span className="text-neutral-100">{appItem.name}</span>
            <span className="truncate text-neutral-400">{appItem.path}</span>
            <span className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
              >
                Edit
              </button>
              <button
                type="button"
                className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-300"
              >
                Delete
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WorkflowsTab(): JSX.Element {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-100">Workflows & Prompts</h2>
          <p className="mt-1 text-sm text-neutral-400">Build reusable script and prompt actions for Module 3.</p>
        </div>
        <button
          type="button"
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
        >
          Add Workflow
        </button>
      </div>

      <div className="space-y-3">
        {MOCK_WORKFLOWS.map((item) => (
          <article key={item.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">{item.title}</h3>
                <span
                  className={`mt-2 inline-flex rounded-md border px-2 py-1 text-xs ${
                    item.actionType === 'Script'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                  }`}
                >
                  {item.actionType}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-300"
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-400">
              {item.snippet}
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}

function PrepromptsTab(): JSX.Element {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-100">Preprompts</h2>
          <p className="mt-1 text-sm text-neutral-400">Reusable instruction presets for Module 4 prompt injection.</p>
        </div>
        <button
          type="button"
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
        >
          Add Preprompt
        </button>
      </div>

      <div className="space-y-3">
        {MOCK_PREPROMPTS.map((item) => (
          <article key={item.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-sm font-semibold text-neutral-100">{item.title}</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
                >
                  Edit
                </button>
                <button
                  type="button"
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
  const dragRegionStyle = { WebkitAppRegion: 'drag' } as CSSProperties
  const noDragRegionStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties

  const handleMinimizeWindow = (): void => {
    window.electronAPI?.minimizeSettings?.()
  }

  const handleCloseWindow = (): void => {
    window.electronAPI?.closeSettings?.()
  }

  const pageTitle = useMemo(() => {
    if (activeTab === 'general') return 'General'
    if (activeTab === 'module2') return 'App Launcher (Mod 2)'
    if (activeTab === 'module3') return 'Workflows (Mod 3)'
    return 'Preprompts (Mod 4)'
  }, [activeTab])

  return (
    <div className="h-screen w-screen bg-transparent p-3 font-sans text-neutral-200">
      <div className="relative h-full overflow-hidden rounded-xl border border-neutral-800/80 bg-neutral-900/95 shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
        <div
          className="absolute top-0 h-10 w-full flex justify-between items-center px-4 bg-transparent border-b border-neutral-800/80"
          style={dragRegionStyle}
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-neutral-500">
            <span className="h-2 w-2 rounded-full bg-amber-400/80" />
            <span>Prometheus Settings</span>
          </div>

          <div className="flex items-center gap-1" style={noDragRegionStyle}>
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

        <div className="flex h-full pt-10">
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

            {activeTab === 'general' && <GeneralTab />}
            {activeTab === 'module2' && <AppLauncherTab />}
            {activeTab === 'module3' && <WorkflowsTab />}
            {activeTab === 'module4' && <PrepromptsTab />}
          </main>
        </div>
      </div>
    </div>
  )
}
