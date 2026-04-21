import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ModulePopup, { type ActivePopup, type PopupItem } from './components/ModulePopup'
import type { LauncherApp } from './types/launcher-app'
import type { Preprompt } from './types/preprompt'
import type { Workflow } from './types/workflow'

interface AppConfig {
  apiKey: string
  themeGradient: string
  proxyUrl: string
}

const DEFAULT_THEME_GRADIENT = 'from-neutral-900/95 to-neutral-900/95'
const AVAILABLE_THEME_GRADIENTS = [
  DEFAULT_THEME_GRADIENT,
  'from-slate-900/95 to-blue-900/95',
  'from-zinc-900/95 to-violet-900/95',
  'from-neutral-900/95 to-emerald-900/95'
] as const

const AVAILABLE_THEME_GRADIENT_SET = new Set<string>(AVAILABLE_THEME_GRADIENTS)

function normalizeThemeGradient(themeGradient: string | undefined): string {
  if (!themeGradient) return DEFAULT_THEME_GRADIENT
  return AVAILABLE_THEME_GRADIENT_SET.has(themeGradient) ? themeGradient : DEFAULT_THEME_GRADIENT
}

function SendIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

function GridIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function BoltIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2L5 13h6l-1 9 8-11h-6l1-9z" />
    </svg>
  )
}

function CodeIcon(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.2354 7.14709C14.3167 6.74092 14.0533 6.3458 13.6471 6.26456C13.2409 6.18333 12.8458 6.44674 12.7646 6.85291L14.2354 7.14709ZM10.7646 16.8529C10.6833 17.2591 10.9467 17.6542 11.3529 17.7354C11.7591 17.8167 12.1542 17.5533 12.2354 17.1471L10.7646 16.8529ZM7.97342 15.4921C8.26837 15.7829 8.74323 15.7795 9.03406 15.4846C9.32488 15.1896 9.32153 14.7148 9.02658 14.4239L7.97342 15.4921ZM5.5 12L4.97342 11.4659C4.83048 11.6069 4.75 11.7993 4.75 12C4.75 12.2007 4.83048 12.3931 4.97342 12.5341L5.5 12ZM9.02658 9.57606C9.32153 9.28523 9.32488 8.81037 9.03406 8.51542C8.74323 8.22047 8.26837 8.21712 7.97342 8.50794L9.02658 9.57606ZM15.9773 14.3782C15.6802 14.6669 15.6735 15.1417 15.9622 15.4387C16.2509 15.7358 16.7257 15.7425 17.0227 15.4538L15.9773 14.3782ZM19.5 12L20.0227 12.5378C20.1667 12.3979 20.2486 12.2061 20.25 12.0053C20.2514 11.8046 20.1723 11.6116 20.0303 11.4697L19.5 12ZM17.0303 8.46967C16.7374 8.17678 16.2626 8.17678 15.9697 8.46967C15.6768 8.76256 15.6768 9.23744 15.9697 9.53033L17.0303 8.46967ZM12.7646 6.85291L10.7646 16.8529L12.2354 17.1471L14.2354 7.14709L12.7646 6.85291ZM9.02658 14.4239L6.02658 11.4659L4.97342 12.5341L7.97342 15.4921L9.02658 14.4239ZM6.02658 12.5341L9.02658 9.57606L7.97342 8.50794L4.97342 11.4659L6.02658 12.5341ZM17.0227 15.4538L20.0227 12.5378L18.9773 11.4622L15.9773 14.3782L17.0227 15.4538ZM20.0303 11.4697L17.0303 8.46967L15.9697 9.53033L18.9697 12.5303L20.0303 11.4697Z"/>
    </svg>
  )
}

function SpinnerIcon(): JSX.Element {
  return (
    <svg
      className="animate-spin"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" className="opacity-30" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  )
}

export default function App(): JSX.Element {
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [aiResponse, setAiResponse] = useState('')
  const [themeGradient, setThemeGradient] = useState<string>(DEFAULT_THEME_GRADIENT)
  const [apps, setApps] = useState<LauncherApp[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [preprompts, setPreprompts] = useState<Preprompt[]>([])
  const [activePopup, setActivePopup] = useState<ActivePopup | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const moduleButtonsRef = useRef<HTMLDivElement>(null)
  const module4ButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let isMounted = true

    const loadInitialTheme = async (): Promise<void> => {
      if (!window.api?.config.getConfig) return

      try {
        const config = (await window.api.config.getConfig()) as AppConfig
        if (isMounted) {
          setThemeGradient(normalizeThemeGradient(config.themeGradient))
        }
      } catch {
        if (isMounted) {
          setThemeGradient(DEFAULT_THEME_GRADIENT)
        }
      }
    }

    void loadInitialTheme()

    const unsubscribeThemeListener = window.api?.config.onThemeUpdated?.((newGradientClass) => {
      setThemeGradient(normalizeThemeGradient(newGradientClass))
    })

    return () => {
      isMounted = false
      if (typeof unsubscribeThemeListener === 'function') {
        unsubscribeThemeListener()
      }
    }
  }, [])

  useEffect(() => {
    if (window.api?.window.onToggleVisibility) {
      window.api.window.onToggleVisibility((v) => {
        setVisible(v)
        if (!v) {
          setTimeout(() => {
            setQuery('')
            setIsLoading(false)
            setAiResponse('')
            setActivePopup(null)
          }, 250)
        }
      })
    } else {
      setVisible(true)
    }
  }, [])

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [visible])

  const handleClose = useCallback(() => {
    setActivePopup(null)
    setVisible(false)
    setTimeout(() => {
      setQuery('')
      setIsLoading(false)
      setAiResponse('')
      window.api?.window.hideWindow()
    }, 240)
  }, [])

  const loadPreprompts = useCallback(async (): Promise<void> => {
    if (!window.api?.store.getPreprompts) {
      setPreprompts([])
      return
    }

    try {
      const savedPreprompts = await window.api.store.getPreprompts()
      setPreprompts(savedPreprompts)
    } catch {
      setPreprompts([])
    }
  }, [])

  const loadApps = useCallback(async (): Promise<void> => {
    if (!window.api?.store.getApps) {
      setApps([])
      return
    }

    try {
      const savedApps = await window.api.store.getApps()
      setApps(savedApps)
    } catch {
      setApps([])
    }
  }, [])

  const loadWorkflows = useCallback(async (): Promise<void> => {
    if (!window.api?.store.getWorkflows) {
      setWorkflows([])
      return
    }

    try {
      const savedWorkflows = await window.api.store.getWorkflows()
      setWorkflows(savedWorkflows)
    } catch {
      setWorkflows([])
    }
  }, [])

  useEffect(() => {
    if (activePopup === 'module4') {
      void loadPreprompts()
      return
    }

    if (activePopup === 'module2') {
      void loadApps()
      return
    }

    if (activePopup === 'module3') {
      void loadWorkflows()
    }
  }, [activePopup, loadApps, loadPreprompts, loadWorkflows])

  const togglePopup = useCallback((popup: ActivePopup) => {
    setActivePopup((current) => (current === popup ? null : popup))
  }, [])

  useEffect(() => {
    if (!activePopup) return

    const handleClickOutsidePopup = (event: MouseEvent) => {
      const target = event.target as Node
      const clickedInsidePopup = popupRef.current?.contains(target)
      const clickedInsideModuleButtons = moduleButtonsRef.current?.contains(target)
      const clickedInsideModule4Button = module4ButtonRef.current?.contains(target)

      if (!clickedInsidePopup && !clickedInsideModuleButtons && !clickedInsideModule4Button) {
        setActivePopup(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutsidePopup)
    return () => {
      document.removeEventListener('mousedown', handleClickOutsidePopup)
    }
  }, [activePopup])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activePopup) {
        event.preventDefault()
        setActivePopup(null)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [activePopup])

  const handleSubmit = useCallback(async () => {
    const prompt = query.trim()
    if (!prompt || isLoading) return

    setIsLoading(true)
    setQuery('')

    try {
      if (!window.api?.chat.askPrometheus) {
        setAiResponse('OpenAI chat is only available in the Electron app.')
        return
      }

      const response = await window.api.chat.askPrometheus(prompt)
      setAiResponse(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch AI response.'
      setAiResponse(`Error: ${message}`)
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }, [query, isLoading])

  const handlePopupItemSelect = useCallback(
    (item: PopupItem) => {
      if (activePopup === 'module4' && item.promptText) {
        setQuery((previous) => {
          const trimmedPrevious = previous.trim()
          if (!trimmedPrevious) {
            return item.promptText as string
          }

          return `${trimmedPrevious}\n\n${item.promptText}`
        })

        setTimeout(() => inputRef.current?.focus(), 40)
      } else if (activePopup === 'module2' && item.appPath) {
        if (!window.api?.launchApp) {
          setAiResponse('App launching is only available in the Electron app.')
        } else {
          void window.api
            .launchApp(item.appPath, item.launchArguments ?? '')
            .then((result) => {
              if (!result.success) {
                setAiResponse(`Error: ${result.error ?? 'Unable to launch application.'}`)
              }
            })
            .catch((error) => {
              const message = error instanceof Error ? error.message : 'Unable to launch application.'
              setAiResponse(`Error: ${message}`)
            })
        }
      } else if (activePopup === 'module3' && item.workflowData) {
        if (!window.api?.executeWorkflow) {
          setAiResponse('Workflow execution is only available in the Electron app.')
        } else {
          void window.api
            .executeWorkflow(item.workflowData)
            .then((result) => {
              if (!result.success) {
                setAiResponse(`Error: ${result.error ?? 'Unable to execute workflow.'}`)
                return
              }

              if (result.stdout) {
                setAiResponse(result.stdout)
                return
              }

              if (result.stderr) {
                setAiResponse(result.stderr)
                return
              }

              setAiResponse('Workflow executed successfully.')
            })
            .catch((error) => {
              const message = error instanceof Error ? error.message : 'Unable to execute workflow.'
              setAiResponse(`Error: ${message}`)
            })
        }
      } else {
        console.log(`${item.title} selected`)
      }

      setActivePopup(null)
    },
    [activePopup]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        if (activePopup) {
          setActivePopup(null)
          return
        }

        handleClose()
      } else if (e.key === 'Enter') {
        void handleSubmit()
      }
    },
    [activePopup, handleClose, handleSubmit]
  )

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        if (activePopup) {
          setActivePopup(null)
          return
        }

        handleClose()
      }
    },
    [activePopup, handleClose]
  )

  return (
    <div
      className="w-screen h-screen flex items-end justify-center pb-5 select-none"
      style={{ background: 'transparent' }}
      onClick={handleOverlayClick}
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            key="command-bar"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ type: 'spring', damping: 15, stiffness: 120, mass: 0.8 }}
            className="relative flex flex-col w-[750px] max-w-full"
          >
            <AnimatePresence>
              {activePopup && (
                <ModulePopup
                  activePopup={activePopup}
                  popupRef={popupRef}
                  themeGradient={themeGradient}
                  module2Items={apps.map((item) => ({
                    id: item.id,
                    title: item.title,
                    subtitle: item.path,
                    icon: 'grid',
                    appPath: item.path,
                    launchArguments: item.arguments
                  }))}
                  module3Items={workflows.map((item) => ({
                    id: item.id,
                    title: item.title,
                    subtitle: item.language,
                    icon: 'bolt',
                    workflowData: item
                  }))}
                  module4Items={preprompts.map((item) => ({
                    id: item.id,
                    title: item.title,
                    subtitle: item.content,
                    icon: 'doc',
                    promptText: item.content
                  }))}
                  onAddNew={() => {
                    setActivePopup(null)
                    if (window.api?.window.openSettings) {
                      window.api.window.openSettings()
                    } else {
                      console.log('Settings window is only available in the Electron app.')
                    }
                  }}
                  onSelectItem={handlePopupItemSelect}
                  anchorSide={activePopup === 'module4' ? 'left' : 'right'}
                />
              )}
            </AnimatePresence>

            <div
              className={`flex items-center w-full rounded-2xl overflow-hidden p-2 bg-gradient-to-br ${themeGradient} border border-white/10`}
              style={{
                WebkitBackdropFilter: 'blur(40px)',
                backdropFilter: 'blur(40px)'
              }}
            >

            <button
              ref={module4ButtonRef}
              onClick={(e) => {
                e.stopPropagation()
                togglePopup('module4')
              }}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-150"
              aria-label="Module 4"
              aria-pressed={activePopup === 'module4'}
            >
              <BoltIcon />
            </button>

              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What can I help you with today?"
                className="flex-1 bg-transparent text-lg text-neutral-100 placeholder:text-neutral-500 border-none focus:outline-none focus:ring-0 px-4 py-3 caret-orange-400"
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
              />

              <button
                onClick={() => void handleSubmit()}
                disabled={!query.trim() || isLoading}
                className="flex items-center justify-center w-8 h-8 mr-1 rounded-lg bg-neutral-700/60 hover:bg-neutral-600/80 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-300 transition-all duration-150 border border-white/8"
                aria-label="Submit prompt"
              >
                {isLoading ? <SpinnerIcon /> : <SendIcon />}
              </button>

              <div ref={moduleButtonsRef} className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    togglePopup('module2')
                  }}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-150"
                  aria-label="Module 2"
                  aria-pressed={activePopup === 'module2'}
                >
                  <GridIcon />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    togglePopup('module3')
                  }}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-150"
                  aria-label="Module 3"
                  aria-pressed={activePopup === 'module3'}
                >
                  <CodeIcon />
                </button>
              </div>
            </div>

            <AnimatePresence>
              {aiResponse && (
                <motion.div
                  key="ai-response"
                  initial={{ opacity: 0, y: -6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -4, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="mt-2 px-4 py-3 text-sm text-neutral-200 bg-neutral-900/65 backdrop-blur-2xl rounded-xl border border-white/10 border-t-white/15 max-h-44 overflow-y-auto"
                  style={{ WebkitBackdropFilter: 'blur(30px)', backdropFilter: 'blur(30px)' }}
                >
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                    {aiResponse}
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
