import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Declare the Electron API exposed via contextBridge
declare global {
  interface Window {
    electronAPI?: {
      hideWindow: () => void
      onToggleVisibility: (callback: (visible: boolean) => void) => void
    }
  }
}

// ---------------------------------------------------------------------------
// Mock AI function-calling engine
// ---------------------------------------------------------------------------

type IntentAction =
  | { type: 'system_command'; command: string; args?: string[] }
  | { type: 'web_search'; query: string }
  | { type: 'open_app'; app: string }
  | { type: 'unknown'; raw: string }

function parseIntent(text: string): IntentAction {
  const lower = text.toLowerCase().trim()

  if (lower.includes('open') && lower.includes('folder')) {
    const folder = lower.replace('open', '').replace('folder', '').trim()
    return { type: 'system_command', command: 'open_folder', args: [folder] }
  }
  if (lower.startsWith('search ') || lower.startsWith('google ')) {
    const query = text.replace(/^(search|google)\s+/i, '')
    return { type: 'web_search', query }
  }
  if (lower.startsWith('open ')) {
    const app = text.replace(/^open\s+/i, '')
    return { type: 'open_app', app }
  }
  return { type: 'unknown', raw: text }
}

// ---------------------------------------------------------------------------
// Spark / Logo icon (SVG)
// ---------------------------------------------------------------------------

function SparkIcon(): JSX.Element {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
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

// ---------------------------------------------------------------------------
// Send / Submit icon
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Result / Response pill
// ---------------------------------------------------------------------------

interface ResultPillProps {
  intent: IntentAction
}

function ResultPill({ intent }: ResultPillProps): JSX.Element {
  const label = (() => {
    switch (intent.type) {
      case 'system_command':
        return `⚡ System command: ${intent.command}${intent.args ? ` → ${intent.args.join(', ')}` : ''}`
      case 'web_search':
        return `🔍 Web search: "${intent.query}"`
      case 'open_app':
        return `🚀 Open app: ${intent.app}`
      default:
        return `💬 ${intent.raw}`
    }
  })()

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      className="mt-1.5 px-4 py-2.5 text-sm text-neutral-300 bg-white/5 rounded-xl border border-white/8"
    >
      {label}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export default function App(): JSX.Element {
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [lastIntent, setLastIntent] = useState<IntentAction | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Listen to show/hide events from main process
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onToggleVisibility((v) => {
        setVisible(v)
        if (!v) {
          // Clear state on close
          setTimeout(() => {
            setQuery('')
            setLastIntent(null)
          }, 250)
        }
      })
    } else {
      // Dev fallback: start visible in browser
      setVisible(true)
    }
  }, [])

  // Auto-focus input when visible
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [visible])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(() => {
      setQuery('')
      setLastIntent(null)
      window.electronAPI?.hideWindow()
    }, 240)
  }, [])

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        handleClose()
      } else if (e.key === 'Enter' && query.trim()) {
        const intent = parseIntent(query.trim())
        console.log('[Prometheus] Detected intent:', intent)
        setLastIntent(intent)
        setQuery('')
      }
    },
    [query, handleClose]
  )

  const handleSubmit = useCallback(() => {
    if (!query.trim()) return
    const intent = parseIntent(query.trim())
    console.log('[Prometheus] Detected intent:', intent)
    setLastIntent(intent)
    setQuery('')
    inputRef.current?.focus()
  }, [query])

  // Click-outside overlay (in browser preview mode)
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        handleClose()
      }
    },
    [handleClose]
  )

  return (
    // Full-screen transparent overlay to capture outside clicks
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
            transition={{
              type: 'spring',
              damping: 15,
              stiffness: 120,
              mass: 0.8
            }}
            className="flex flex-col w-[750px] max-w-full"
          >
            {/* Main command bar */}
            <div
              className="
                flex items-center
                w-full rounded-2xl overflow-hidden
                p-2
                bg-neutral-900/70
                backdrop-blur-2xl
                border border-white/10
                shadow-2xl shadow-black/60
              "
              style={{
                WebkitBackdropFilter: 'blur(40px)',
                backdropFilter: 'blur(40px)'
              }}
            >
              {/* Left spark icon */}
              <div className="flex items-center justify-center pl-2 pr-1">
                <SparkIcon />
              </div>

              {/* Text input */}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What can I help you with today?"
                className="
                  flex-1
                  bg-transparent
                  text-lg
                  text-neutral-100
                  placeholder:text-neutral-500
                  border-none
                  focus:outline-none focus:ring-0
                  px-4 py-3
                  caret-orange-400
                "
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
              />

              {/* Submit button */}
              <button
                onClick={handleSubmit}
                disabled={!query.trim()}
                className="
                  flex items-center justify-center
                  w-8 h-8 mr-1
                  rounded-lg
                  bg-neutral-700/60
                  hover:bg-neutral-600/80
                  disabled:opacity-30 disabled:cursor-not-allowed
                  text-neutral-300
                  transition-all duration-150
                  border border-white/8
                "
              >
                <SendIcon />
              </button>
            </div>

            {/* Result pill (AnimatePresence for smooth enter/exit) */}
            <AnimatePresence>
              {lastIntent && <ResultPill key="result" intent={lastIntent} />}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
