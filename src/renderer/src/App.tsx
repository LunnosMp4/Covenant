import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

declare global {
  interface Window {
    electronAPI?: {
      hideWindow: () => void
      askPrometheus: (prompt: string) => Promise<string>
      onToggleVisibility: (callback: (visible: boolean) => void) => void
    }
  }
}

function SparkIcon({ loading }: { loading: boolean }): JSX.Element {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`flex-shrink-0 ${loading ? 'animate-pulse' : ''}`}
    >
      <defs>
        <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#C2410C" />
        </linearGradient>
      </defs>
      <path
        d="M12 2L13.5 9H21L15 13.5L17.5 21L12 16.5L6.5 21L9 13.5L3 9H10.5L12 2Z"
        fill="url(#sparkGrad)"
      />
    </svg>
  )
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
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onToggleVisibility((v) => {
        setVisible(v)
        if (!v) {
          setTimeout(() => {
            setQuery('')
            setIsLoading(false)
            setAiResponse('')
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
    setVisible(false)
    setTimeout(() => {
      setQuery('')
      setIsLoading(false)
      setAiResponse('')
      window.electronAPI?.hideWindow()
    }, 240)
  }, [])

  const handleSubmit = useCallback(async () => {
    const prompt = query.trim()
    if (!prompt || isLoading) return

    setIsLoading(true)
    setQuery('')

    try {
      if (!window.electronAPI?.askPrometheus) {
        setAiResponse('OpenAI chat is only available in the Electron app.')
        return
      }

      const response = await window.electronAPI.askPrometheus(prompt)
      setAiResponse(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch AI response.'
      setAiResponse(`Error: ${message}`)
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }, [query, isLoading])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        handleClose()
      } else if (e.key === 'Enter') {
        void handleSubmit()
      }
    },
    [handleClose, handleSubmit]
  )

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        handleClose()
      }
    },
    [handleClose]
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
            className="flex flex-col w-[750px] max-w-full"
          >
            <div
              className="flex items-center w-full rounded-2xl overflow-hidden p-2 bg-neutral-900/70 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/60"
              style={{
                WebkitBackdropFilter: 'blur(40px)',
                backdropFilter: 'blur(40px)',
                backgroundImage:
                  'linear-gradient(135deg, rgba(23, 23, 23, 0.92) 0%, rgba(26, 22, 18, 0.94) 100%)',
              }}
            >
              <div className="flex items-center justify-center pl-2 pr-1">
                <SparkIcon loading={isLoading} />
              </div>

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

              <button
                onClick={() => console.log('Module 2: App Launcher Clicked')}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-150"
                aria-label="Module 2"
              >
                <GridIcon />
              </button>

              <button
                onClick={() => console.log('Module 3: Workflows Clicked')}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-150"
                aria-label="Module 3"
              >
                <BoltIcon />
              </button>
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
