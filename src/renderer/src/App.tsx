import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Prism from 'prismjs'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-batch'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-powershell'
import 'prismjs/components/prism-python'
import ModulePopup, { type ActivePopup, type PopupItem } from './components/ModulePopup'
import TerminalView from './components/TerminalView'
import VoiceWaveform from './components/VoiceWaveform'
import { DEFAULT_TERMINAL_FONT, normalizeTerminalFont } from './constants/terminalFonts'
import {
  DEFAULT_THEME_GRADIENT,
  getThemePalette,
  normalizeThemeGradient
} from './constants/theme'
import type { ButtonVisibility, ReasoningEffort } from '../../shared/config'
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL, DEFAULT_REASONING_EFFORT } from '../../shared/config'
import type { LauncherApp, LauncherAppTarget } from './types/launcher-app'
import type { Preprompt } from './types/preprompt'
import type {
  Workflow,
  WorkflowExecutionState,
  WorkflowLogPayload,
  WorkflowStatusUpdatePayload
} from './types/workflow'

type ChatRole = 'user' | 'assistant' | 'system'

interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  reasoning?: string
  usage?: ChatUsage
  model?: string
}

interface ChatUsage {
  promptTokens?: number
  cachedPromptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

interface ChatConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  systemPrompt?: string
}

interface SelectedSystemPrompt {
  id: string
  title: string
  content: string
}

interface ChatStreamEvent {
  id: string
  type: 'content' | 'reasoning' | 'done' | 'error'
  delta?: string
  usage?: ChatUsage
  error?: string
  model?: string
}

type AppMode = 'ai' | 'terminal'

const MAX_WORKFLOW_LOG_LINES = 200
const MAX_CONVERSATION_TITLE_LENGTH = 48
const DEFAULT_CONVERSATION_TITLE = 'New chat'
const CHAT_SCROLL_HEIGHT = 300
const CHAT_ROLE_ORDER: ChatRole[] = ['system', 'user', 'assistant']

function splitWorkflowLogLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
}

function normalizeLauncherAppTargets(app: LauncherApp): LauncherAppTarget[] {
  if (Array.isArray(app.targets) && app.targets.length > 0) {
    return app.targets
  }

  const legacyPath = typeof app.path === 'string' ? app.path.trim() : ''
  if (!legacyPath) {
    return []
  }

  return [{ path: legacyPath, arguments: app.arguments ?? '' }]
}

function normalizePopupLaunchTargets(item: PopupItem): LauncherAppTarget[] {
  if (Array.isArray(item.appLaunchTargets) && item.appLaunchTargets.length > 0) {
    return item.appLaunchTargets
  }

  const legacyPath = typeof item.appPath === 'string' ? item.appPath.trim() : ''
  if (!legacyPath) {
    return []
  }

  return [{ path: legacyPath, arguments: item.launchArguments ?? '' }]
}

function formatTargetsSummary(targets: LauncherAppTarget[]): string {
  const count = targets.length
  if (count === 0) {
    return 'No apps'
  }

  return `${count} app${count === 1 ? '' : 's'}`
}

const CHAT_MODEL_PRICING: Record<
  string,
  {
    inputPerMillion: number
    cachedInputPerMillion: number
    outputPerMillion: number
  }
> = {
  'gpt-4o-mini': {
    inputPerMillion: 0.15,
    cachedInputPerMillion: 0.08,
    outputPerMillion: 0.6
  },
  'gpt-5.4-nano': {
    inputPerMillion: 0.2,
    cachedInputPerMillion: 0.02,
    outputPerMillion: 1.25
  },
  'gpt-5.6-luna': {
    inputPerMillion: 1,
    cachedInputPerMillion: 0.10,
    outputPerMillion: 6
  },
  'gpt-5.6-terra': {
    inputPerMillion: 2.50,
    cachedInputPerMillion: 0.25,
    outputPerMillion: 15
  }
}

function formatTokenCount(tokens: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(tokens)
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  }).format(amount)
}

function formatUsageSummary(message: ChatMessage): string | undefined {
  const usage = message.usage
  if (!usage) {
    return undefined
  }

  const promptTokens = usage.promptTokens ?? 0
  const cachedPromptTokens = Math.min(usage.cachedPromptTokens ?? 0, promptTokens)
  const completionTokens = usage.completionTokens ?? 0
  const pricing = message.model ? CHAT_MODEL_PRICING[message.model.trim()] : undefined

  const inputTokens = promptTokens - cachedPromptTokens
  const inputCost = pricing ? (inputTokens * pricing.inputPerMillion) / 1_000_000 : 0
  const cachedInputCost = pricing ? (cachedPromptTokens * pricing.cachedInputPerMillion) / 1_000_000 : 0
  const outputCost = pricing ? (completionTokens * pricing.outputPerMillion) / 1_000_000 : 0
  const totalCost = inputCost + cachedInputCost + outputCost

  const parts = [
    `>${formatTokenCount(promptTokens)}tk`,
    `${formatTokenCount(completionTokens)}tk`
  ]

  if (pricing) {
    parts.push(formatCurrency(totalCost))
  } else {
    const totalTokens = usage.totalTokens ?? promptTokens + completionTokens
    parts.push(`${formatTokenCount(totalTokens)}tk`)
  }

  return parts.join(' · ')
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

function SettingsIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 6.5H16" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6 6.5H2" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 10C11.933 10 13.5 8.433 13.5 6.5C13.5 4.567 11.933 3 10 3C8.067 3 6.5 4.567 6.5 6.5C6.5 8.433 8.067 10 10 10Z" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M22 17.5H18" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M8 17.5H2" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14 21C15.933 21 17.5 19.433 17.5 17.5C17.5 15.567 15.933 14 14 14C12.067 14 10.5 15.567 10.5 17.5C10.5 19.433 12.067 21 14 21Z" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  )
}

function MenuIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  )
}

function PinIcon({ active }: { active: boolean }): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2z" />
    </svg>
  )
}

function MicIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

function StopIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function createConversationTitle(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return DEFAULT_CONVERSATION_TITLE
  const firstLine = trimmed.split('\n')[0] || trimmed
  if (firstLine.length <= MAX_CONVERSATION_TITLE_LENGTH) return firstLine
  return `${firstLine.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 3)}...`
}

function createMessageId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `msg_${Math.random().toString(36).slice(2)}_${Date.now()}`
}

function createSelectedSystemPrompt(preprompt: Preprompt): SelectedSystemPrompt {
  return {
    id: preprompt.id,
    title: preprompt.title,
    content: preprompt.content
  }
}

function createCustomSystemPromptSelection(conversationId: string, content: string): SelectedSystemPrompt {
  return {
    id: `conversation-${conversationId}`,
    title: 'Custom system prompt',
    content
  }
}

function sortConversations(conversations: ChatConversation[]): ChatConversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
}

function normalizeMessageOrder(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    return CHAT_ROLE_ORDER.indexOf(a.role) - CHAT_ROLE_ORDER.indexOf(b.role)
  })
}

function highlightMarkdownCode(code: string, language: string | undefined): string {
  if (!language) return code
  const grammar = Prism.languages[language]
  if (!grammar) return code
  return Prism.highlight(code, grammar, language)
}

function AssistantMarkdown({ content }: { content: string }): JSX.Element {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className="chat-markdown"
      components={{
        a({ href, children, ...props }) {
          const safeHref = typeof href === 'string' ? href : undefined
          return (
            <a href={safeHref} target="_blank" rel="noreferrer" {...props}>
              {children}
            </a>
          )
        },
        code({ inline, className, children, ...props }) {
          const rawCode = String(children ?? '').replace(/\n$/, '')
          const match = /language-(\w+)/.exec(className ?? '')
          const language = match?.[1]

          if (!inline) {
            const highlighted = highlightMarkdownCode(rawCode, language)
            return (
              <pre className="chat-code-block">
                <code
                  className={className}
                  dangerouslySetInnerHTML={{ __html: highlighted }}
                  {...props}
                />
              </pre>
            )
          }

          return (
            <code className="chat-code-inline" {...props}>
              {children}
            </code>
          )
        }
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

export default function App(): JSX.Element {
  const [visible, setVisible] = useState(false)
  // Tracks whether the window is truly visible to the user (including after the
  // exit animation has finished). When false, heavy components are fully
  // unmounted from the React DOM so they release their memory.
  const [isAppVisible, setIsAppVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConversation, setActiveConversation] = useState<ChatConversation | null>(null)
  const [selectedSystemPrompt, setSelectedSystemPrompt] = useState<SelectedSystemPrompt | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [mode, setMode] = useState<AppMode>('ai')
  const [hasInitializedTerminal, setHasInitializedTerminal] = useState(false)
  const [themeGradient, setThemeGradient] = useState<string>(DEFAULT_THEME_GRADIENT)
  const [terminalFont, setTerminalFont] = useState<string>(DEFAULT_TERMINAL_FONT)
  const [thinkingOpenById, setThinkingOpenById] = useState<Record<string, boolean>>({})
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null)
  const [activeStreamMessageId, setActiveStreamMessageId] = useState<string | null>(null)
  const [activeStreamConversationId, setActiveStreamConversationId] = useState<string | null>(null)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
  const [apps, setApps] = useState<LauncherApp[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [preprompts, setPreprompts] = useState<Preprompt[]>([])
  const [workflowExecutionById, setWorkflowExecutionById] = useState<
    Record<string, WorkflowExecutionState>
  >({})
  const [workflowLogsOpenById, setWorkflowLogsOpenById] = useState<Record<string, boolean>>({})
  const [activePopup, setActivePopup] = useState<ActivePopup | null>(null)
  const [buttonVisibility, setButtonVisibility] = useState<ButtonVisibility>({ appLauncher: true, workflow: true })
  const [chatModel, setChatModel] = useState<string>(DEFAULT_CHAT_MODEL)
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT)
  const [isPinned, setIsPinned] = useState(false)
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing' | 'error'>('idle')
  const micStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const moduleButtonsRef = useRef<HTMLDivElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const historyMenuRef = useRef<HTMLDivElement>(null)
  const historyButtonRef = useRef<HTMLButtonElement>(null)
  const successResetTimersRef = useRef<Record<string, number>>({})
  const activeConversationRef = useRef<ChatConversation | null>(null)
  const streamBufferRef = useRef<{ content: string; reasoning: string } | null>(null)
  // Ref for the hide-delay timer so it can be cancelled on rapid show/hide.
  const hideDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadInitialTheme = async (): Promise<void> => {
      if (!window.api?.config.getConfig) return

      try {
        const config = await window.api.config.getConfig()
        if (isMounted) {
          setThemeGradient(normalizeThemeGradient(config.themeGradient))
          setTerminalFont(normalizeTerminalFont(config.terminalFont))
          if (config.buttonVisibility) {
            setButtonVisibility(config.buttonVisibility)
          }
          if (config.chatModel) {
            setChatModel(config.chatModel)
          }
          if (config.reasoningEffort) {
            setReasoningEffort(config.reasoningEffort)
          }
        }
      } catch {
        if (isMounted) {
          setThemeGradient(DEFAULT_THEME_GRADIENT)
          setTerminalFont(DEFAULT_TERMINAL_FONT)
        }
      }
    }

    void loadInitialTheme()

    const unsubscribeThemeListener = window.api?.config.onThemeUpdated?.((newGradientClass) => {
      setThemeGradient(normalizeThemeGradient(newGradientClass))
    })

    const unsubscribeTerminalFontListener = window.api?.config.onTerminalFontUpdated?.((newTerminalFont) => {
      setTerminalFont(normalizeTerminalFont(newTerminalFont))
    })

    const unsubscribeButtonVisibilityListener = window.api?.config.onButtonVisibilityUpdated?.((newButtonVisibility) => {
      setButtonVisibility(newButtonVisibility)
    })

    const unsubscribeChatModelListener = window.api?.config.onChatModelUpdated?.((newChatModel) => {
      setChatModel(newChatModel)
    })

    const unsubscribeReasoningEffortListener = window.api?.config.onReasoningEffortUpdated?.((newReasoningEffort) => {
      setReasoningEffort(newReasoningEffort)
    })

    return () => {
      isMounted = false
      if (typeof unsubscribeThemeListener === 'function') {
        unsubscribeThemeListener()
      }
      if (typeof unsubscribeTerminalFontListener === 'function') {
        unsubscribeTerminalFontListener()
      }
      if (typeof unsubscribeButtonVisibilityListener === 'function') {
        unsubscribeButtonVisibilityListener()
      }
      if (typeof unsubscribeChatModelListener === 'function') {
        unsubscribeChatModelListener()
      }
      if (typeof unsubscribeReasoningEffortListener === 'function') {
        unsubscribeReasoningEffortListener()
      }
    }
  }, [])

  useEffect(() => {
    if (window.api?.window.onToggleVisibility) {
      // IMPORTANT: capture the returned cleanup function to prevent an IPC
      // listener leak — each call to onToggleVisibility registers a new
      // ipcRenderer listener that must be removed when this effect tears down.
      const unsubscribe = window.api.window.onToggleVisibility((v) => {
        if (v) {
          // Cancel any pending hide timer so rapid show/hide doesn't race.
          if (hideDelayTimerRef.current !== null) {
            clearTimeout(hideDelayTimerRef.current)
            hideDelayTimerRef.current = null
          }
          setIsAppVisible(true)
          setVisible(true)
        } else {
          setVisible(false)
          setIsPinned(false)
          window.api?.window.setPinned?.(false)
          // Wait for the exit animation (~250 ms) before resetting state and
          // unmounting heavy components to free memory.
          hideDelayTimerRef.current = setTimeout(() => {
            hideDelayTimerRef.current = null
            setQuery('')
            setIsLoading(false)
            setIsChatOpen(false)
            setIsHistoryOpen(false)
            setMode('ai')
            setActivePopup(null)
            // isAppVisible is set to false via AnimatePresence onExitComplete,
            // which fires once the spring exit animation fully completes.
          }, 300)
        }
      })

      return () => {
        unsubscribe()
        if (hideDelayTimerRef.current !== null) {
          clearTimeout(hideDelayTimerRef.current)
          hideDelayTimerRef.current = null
        }
      }
    } else {
      // Dev/browser fallback — always visible.
      setVisible(true)
      setIsAppVisible(true)
      return undefined
    }
  }, [])

  useEffect(() => {
    if (!visible || mode !== 'ai') {
      return
    }

    const focusTimer = setTimeout(() => {
      inputRef.current?.focus()
    }, 80)

    return () => {
      clearTimeout(focusTimer)
    }
  }, [visible, mode])

  const toggleMode = useCallback(() => {
    setMode((currentMode) => {
      const nextMode: AppMode = currentMode === 'ai' ? 'terminal' : 'ai'
      if (nextMode === 'terminal') {
        setHasInitializedTerminal(true)
      }

      return nextMode
    })

    setActivePopup(null)
  }, [])

  const switchToAiMode = useCallback(() => {
    setMode('ai')
    setActivePopup(null)
  }, [])

  const handleTogglePin = useCallback(() => {
    setIsPinned((prev) => {
      const next = !prev
      window.api?.window.setPinned?.(next)
      return next
    })
  }, [])

  const handleClose = useCallback(() => {
    setActivePopup(null)
    setMode('ai')
    setVisible(false)
    setIsPinned(false)
    window.api?.window.setPinned?.(false)
    setTimeout(() => {
      setQuery('')
      setIsLoading(false)
      setIsChatOpen(false)
      setIsHistoryOpen(false)
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

  const loadConversations = useCallback(async (): Promise<void> => {
    if (!window.api?.chat.getConversations) {
      setConversations([])
      return
    }

    try {
      const savedConversations = await window.api.chat.getConversations()
      setConversations(sortConversations(savedConversations))
    } catch {
      setConversations([])
    }
  }, [])

  const upsertConversation = useCallback((conversation: ChatConversation): void => {
    setConversations((previous) => {
      const filtered = previous.filter((item) => item.id !== conversation.id)
      return sortConversations([conversation, ...filtered])
    })
  }, [])

  const persistConversation = useCallback((conversation: ChatConversation): void => {
    if (!window.api?.chat.saveConversation) return

    void window.api.chat
      .saveConversation(conversation)
      .then((nextConversations) => {
        setConversations(sortConversations(nextConversations))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    activeConversationRef.current = activeConversation
  }, [activeConversation])

  useEffect(() => {
    if (!isChatOpen) return
    setAutoScrollEnabled(true)
  }, [isChatOpen, activeConversation?.id])

  useEffect(() => {
    if (!isChatOpen || !autoScrollEnabled) return

    const scrollTimer = window.setTimeout(() => {
      if (!chatScrollRef.current) return
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }, 40)

    return () => {
      window.clearTimeout(scrollTimer)
    }
  }, [isChatOpen, activeConversation, isLoading, autoScrollEnabled])

  const handleChatScroll = useCallback(() => {
    const scrollElement = chatScrollRef.current
    if (!scrollElement) return

    const threshold = 24
    const atBottom =
      scrollElement.scrollTop + scrollElement.clientHeight >=
      scrollElement.scrollHeight - threshold

    setAutoScrollEnabled((previous) => (previous === atBottom ? previous : atBottom))
  }, [])

  useEffect(() => {
    if (!isHistoryOpen) return

    const handleClickOutsideHistory = (event: MouseEvent) => {
      const target = event.target as Node
      if (historyMenuRef.current?.contains(target)) return
      if (historyButtonRef.current?.contains(target)) return
      setIsHistoryOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutsideHistory)
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideHistory)
    }
  }, [isHistoryOpen])

  useEffect(() => {
    if (activePopup === 'settings') {
      void loadPreprompts()
      return
    }

    if (activePopup === 'appLauncher') {
      void loadApps()
      return
    }

    if (activePopup === 'workflow') {
      void loadWorkflows()
    }
  }, [activePopup, loadApps, loadPreprompts, loadWorkflows])

  useEffect(() => {
    if (!activeConversation) {
      return
    }

    const systemPrompt = activeConversation.systemPrompt?.trim() ?? ''
    if (!systemPrompt) {
      setSelectedSystemPrompt(null)
      return
    }

    const matchingPreprompt = preprompts.find((item) => item.content.trim() === systemPrompt)
    setSelectedSystemPrompt(
      matchingPreprompt
        ? createSelectedSystemPrompt(matchingPreprompt)
        : createCustomSystemPromptSelection(activeConversation.id, systemPrompt)
    )
  }, [activeConversation, preprompts])

  const togglePopup = useCallback(
    (popup: ActivePopup) => {
      if (mode !== 'ai') {
        return
      }

      setActivePopup((current) => (current === popup ? null : popup))
    },
    [mode]
  )

  useEffect(() => {
    if (!activePopup) return

    const handleClickOutsidePopup = (event: MouseEvent) => {
      const target = event.target as Node
      const clickedInsidePopup = popupRef.current?.contains(target)
      const clickedInsideModuleButtons = moduleButtonsRef.current?.contains(target)
      const clickedInsideSettingsButton = settingsButtonRef.current?.contains(target)

      if (!clickedInsidePopup && !clickedInsideModuleButtons && !clickedInsideSettingsButton) {
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

  useEffect(() => {
    const clearSuccessTimer = (workflowId: string): void => {
      const timeoutId = successResetTimersRef.current[workflowId]
      if (!timeoutId) return

      window.clearTimeout(timeoutId)
      delete successResetTimersRef.current[workflowId]
    }

    const statusUnsubscribe = window.api?.onWorkflowStatusUpdate?.(
      (payload: WorkflowStatusUpdatePayload) => {
        const workflowId = payload.id?.trim()
        if (!workflowId) return

        clearSuccessTimer(workflowId)

        setWorkflowExecutionById((previous) => {
          const existingState = previous[workflowId] ?? {
            status: 'idle',
            logs: []
          }

          return {
            ...previous,
            [workflowId]: {
              status: payload.status,
              logs: payload.status === 'running' ? [] : existingState.logs
            }
          }
        })

        if (payload.status === 'success') {
          successResetTimersRef.current[workflowId] = window.setTimeout(() => {
            setWorkflowExecutionById((previous) => {
              const existingState = previous[workflowId]
              if (!existingState || existingState.status !== 'success') {
                return previous
              }

              return {
                ...previous,
                [workflowId]: {
                  ...existingState,
                  status: 'idle'
                }
              }
            })

            setWorkflowLogsOpenById((previous) => {
              if (!previous[workflowId]) return previous

              return {
                ...previous,
                [workflowId]: false
              }
            })

            delete successResetTimersRef.current[workflowId]
          }, 3000)
        }
      }
    )

    const logUnsubscribe = window.api?.onWorkflowLog?.((payload: WorkflowLogPayload) => {
      const workflowId = payload.id?.trim()
      if (!workflowId) return

      const nextLines = splitWorkflowLogLines(payload.text).map(
        (line) => `[${payload.type.toUpperCase()}] ${line}`
      )

      if (nextLines.length === 0) return

      setWorkflowExecutionById((previous) => {
        const existingState = previous[workflowId] ?? {
          status: 'idle',
          logs: []
        }

        return {
          ...previous,
          [workflowId]: {
            ...existingState,
            logs: [...existingState.logs, ...nextLines].slice(-MAX_WORKFLOW_LOG_LINES)
          }
        }
      })
    })

    return () => {
      if (typeof statusUnsubscribe === 'function') {
        statusUnsubscribe()
      }

      if (typeof logUnsubscribe === 'function') {
        logUnsubscribe()
      }

      Object.values(successResetTimersRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
      successResetTimersRef.current = {}
    }
  }, [])

  const handleToggleWorkflowLogs = useCallback((workflowId: string): void => {
    setWorkflowLogsOpenById((previous) => ({
      ...previous,
      [workflowId]: !previous[workflowId]
    }))
  }, [])

  const updateConversationMessage = useCallback(
    (conversationId: string, messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
      setActiveConversation((current) => {
        if (!current || current.id !== conversationId) return current

        const nextMessages = current.messages.map((message) =>
          message.id === messageId ? updater(message) : message
        )

        return {
          ...current,
          messages: normalizeMessageOrder(nextMessages)
        }
      })
    },
    []
  )

  useEffect(() => {
    if (!window.api?.chat.onStreamEvent) {
      return
    }

    const unsubscribe = window.api.chat.onStreamEvent((event: ChatStreamEvent) => {
      if (!activeStreamId || event.id !== activeStreamId) return

      const conversationId = activeStreamConversationId
      const messageId = activeStreamMessageId
      if (!conversationId || !messageId) return

      if (event.type === 'content' && event.delta) {
        streamBufferRef.current = {
          content: `${streamBufferRef.current?.content ?? ''}${event.delta}`,
          reasoning: streamBufferRef.current?.reasoning ?? ''
        }

        updateConversationMessage(conversationId, messageId, (message) => ({
          ...message,
          content: `${message.content}${event.delta}`
        }))
        return
      }

      if (event.type === 'reasoning' && event.delta) {
        streamBufferRef.current = {
          content: streamBufferRef.current?.content ?? '',
          reasoning: `${streamBufferRef.current?.reasoning ?? ''}${event.delta}`
        }

        updateConversationMessage(conversationId, messageId, (message) => ({
          ...message,
          reasoning: `${message.reasoning ?? ''}${event.delta}`
        }))
        return
      }

      if (event.type === 'error') {
        updateConversationMessage(conversationId, messageId, (message) => ({
          ...message,
          content: `Error: ${event.error ?? 'Unable to fetch AI response.'}`
        }))
        setIsLoading(false)
        setActiveStreamId(null)
        setActiveStreamMessageId(null)
        setActiveStreamConversationId(null)
        setThinkingOpenById((previous) => ({
          ...previous,
          [messageId]: false
        }))
        streamBufferRef.current = null
        return
      }

      if (event.type === 'done') {
        const currentConversation = activeConversationRef.current
        if (!currentConversation || currentConversation.id !== conversationId) {
          setIsLoading(false)
          setActiveStreamId(null)
          setActiveStreamMessageId(null)
          setActiveStreamConversationId(null)
          streamBufferRef.current = null
          return
        }

        const updatedMessages = normalizeMessageOrder(
          currentConversation.messages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content: streamBufferRef.current?.content ?? message.content,
                  usage: event.usage,
                  reasoning: streamBufferRef.current?.reasoning ?? message.reasoning,
                  model: event.model ?? message.model
                }
              : message
          )
        )

        const updatedConversation: ChatConversation = {
          ...currentConversation,
          updatedAt: Date.now(),
          messages: updatedMessages
        }

        setActiveConversation(updatedConversation)
        upsertConversation(updatedConversation)
        persistConversation(updatedConversation)
        setIsLoading(false)
        setActiveStreamId(null)
        setActiveStreamMessageId(null)
        setActiveStreamConversationId(null)
        setThinkingOpenById((previous) => ({
          ...previous,
          [messageId]: false
        }))
        streamBufferRef.current = null
      }
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [
    activeStreamConversationId,
    activeStreamId,
    activeStreamMessageId,
    persistConversation,
    updateConversationMessage,
    upsertConversation
  ])

  const handleSubmit = useCallback(async () => {
    const rawPrompt = query.trim()
    if (!rawPrompt || isLoading) return

    const now = Date.now()
    const activeSystemPrompt = selectedSystemPrompt?.content.trim() || activeConversation?.systemPrompt?.trim() || ''

    const shouldStartNewConversation = !isChatOpen
    let nextConversation = shouldStartNewConversation ? null : activeConversation
    if (!nextConversation) {
      const createdAt = now
      nextConversation = {
        id: createMessageId(),
        title: createConversationTitle(rawPrompt),
        createdAt,
        updatedAt: createdAt,
        messages: [],
        systemPrompt: activeSystemPrompt || undefined
      }
      setActiveConversation(nextConversation)
    }

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: rawPrompt,
      createdAt: now
    }

    const userConversation: ChatConversation = {
      ...nextConversation,
      updatedAt: now,
      messages: normalizeMessageOrder([...nextConversation.messages, userMessage]),
      systemPrompt: nextConversation.systemPrompt ?? (activeSystemPrompt || undefined)
    }

    setIsLoading(true)
    setIsChatOpen(true)
    setIsHistoryOpen(false)
    setQuery('')
    setActiveConversation(userConversation)
    upsertConversation(userConversation)
    persistConversation(userConversation)

    let keepLoading = false

    try {
      if (!window.api?.chat.askCovenant) {
        throw new Error('OpenAI chat is only available in the Electron app.')
      }

      const requestMessages = [
        ...(userConversation.systemPrompt
          ? [{ role: 'system' as const, content: userConversation.systemPrompt }]
          : []),
        ...userConversation.messages.map((message) => ({
          role: message.role,
          content: message.content
        }))
      ]

      const assistantMessageId = createMessageId()
      const placeholderAssistant: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        reasoning: ''
      }

      const placeholderConversation: ChatConversation = {
        ...userConversation,
        updatedAt: Date.now(),
        messages: normalizeMessageOrder([...userConversation.messages, placeholderAssistant])
      }

      setActiveConversation(placeholderConversation)
      upsertConversation(placeholderConversation)
      streamBufferRef.current = { content: '', reasoning: '' }

      if (window.api.chat.askCovenantStream) {
        const streamResponse = await window.api.chat.askCovenantStream(requestMessages)
        setActiveStreamId(streamResponse.id)
        setActiveStreamMessageId(assistantMessageId)
        setActiveStreamConversationId(placeholderConversation.id)
        keepLoading = true
      } else {
        const response = await window.api.chat.askCovenant(requestMessages)
        const updatedConversation: ChatConversation = {
          ...placeholderConversation,
          updatedAt: Date.now(),
          messages: normalizeMessageOrder(
            placeholderConversation.messages.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: response,
                    model: chatModel
                  }
                : message
            )
          )
        }

        setActiveConversation(updatedConversation)
        upsertConversation(updatedConversation)
        persistConversation(updatedConversation)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch AI response.'
      const errorMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: `Error: ${message}`,
        createdAt: Date.now()
      }

      const updatedConversation: ChatConversation = {
        ...userConversation,
        updatedAt: Date.now(),
        messages: normalizeMessageOrder([...userConversation.messages, errorMessage])
      }

      setActiveConversation(updatedConversation)
      upsertConversation(updatedConversation)
      persistConversation(updatedConversation)
    } finally {
      if (!keepLoading) {
        setIsLoading(false)
        if (mode === 'ai') {
          inputRef.current?.focus()
        }
      }
    }
  }, [
    query,
    isLoading,
    mode,
    activeConversation,
    selectedSystemPrompt,
    upsertConversation,
    persistConversation
  ])

  const setCurrentSystemPrompt = useCallback(
    (selection: SelectedSystemPrompt | null) => {
      setSelectedSystemPrompt(selection)

      const currentConversation = activeConversationRef.current
      if (!currentConversation) {
        return
      }

      const updatedConversation: ChatConversation = {
        ...currentConversation,
        updatedAt: Date.now(),
        systemPrompt: selection?.content.trim() || undefined
      }

      setActiveConversation(updatedConversation)
      upsertConversation(updatedConversation)
      persistConversation(updatedConversation)
    },
    [persistConversation, upsertConversation]
  )

  const clearCurrentSystemPrompt = useCallback(() => {
    setCurrentSystemPrompt(null)
  }, [setCurrentSystemPrompt])

  const appendAssistantMessage = useCallback(
    (content: string) => {
      const now = Date.now()
      const baseConversation =
        activeConversation ??
        ({
          id: createMessageId(),
          title: DEFAULT_CONVERSATION_TITLE,
          createdAt: now,
          updatedAt: now,
          messages: [],
          systemPrompt: undefined
        } as ChatConversation)

      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content,
        createdAt: now
      }

      const updatedConversation: ChatConversation = {
        ...baseConversation,
        updatedAt: now,
        messages: normalizeMessageOrder([...baseConversation.messages, assistantMessage])
      }

      setActiveConversation(updatedConversation)
      setIsChatOpen(true)
      setIsHistoryOpen(false)
      upsertConversation(updatedConversation)
      persistConversation(updatedConversation)
    },
    [activeConversation, persistConversation, upsertConversation]
  )

  const handlePopupItemSelect = useCallback(
    (item: PopupItem) => {
      if (activePopup === 'settings' && item.promptText) {
        setCurrentSystemPrompt({
          id: item.id,
          title: item.title,
          content: item.promptText
        })

        setTimeout(() => inputRef.current?.focus(), 40)
      } else if (activePopup === 'appLauncher') {
        const launchTargets = normalizePopupLaunchTargets(item)
        if (launchTargets.length === 0) {
          return
        }

        const launchApp = window.api?.launchApp
        if (!launchApp) {
          appendAssistantMessage('App launching is only available in the Electron app.')
        } else {
          void (async () => {
            for (const target of launchTargets) {
              const result = await launchApp(target.path, target.arguments ?? '')
              if (!result.success) {
                appendAssistantMessage(`Error: ${result.error ?? 'Unable to launch application.'}`)
                return
              }
            }
          })().catch((error) => {
            const message = error instanceof Error ? error.message : 'Unable to launch application.'
            appendAssistantMessage(`Error: ${message}`)
          })
        }
      } else if (activePopup === 'workflow' && item.workflowData) {
        if (!window.api?.executeWorkflow) {
          appendAssistantMessage('Workflow execution is only available in the Electron app.')
        } else {
          const workflowId = item.workflowData.id
          const activeSuccessTimeout = successResetTimersRef.current[workflowId]

          if (activeSuccessTimeout) {
            window.clearTimeout(activeSuccessTimeout)
            delete successResetTimersRef.current[workflowId]
          }

          setWorkflowExecutionById((previous) => ({
            ...previous,
            [workflowId]: {
              status: 'running',
              logs: []
            }
          }))

          setWorkflowLogsOpenById((previous) => ({
            ...previous,
            [workflowId]: false
          }))

          void window.api
            .executeWorkflow(item.workflowData)
            .then((result) => {
              if (!result.success) {
                const message = result.error ?? 'Unable to execute workflow.'

                setWorkflowExecutionById((previous) => {
                  const existingState = previous[workflowId] ?? {
                    status: 'idle',
                    logs: []
                  }

                  return {
                    ...previous,
                    [workflowId]: {
                      status: 'error',
                      logs: [...existingState.logs, `[ERROR] ${message}`].slice(-MAX_WORKFLOW_LOG_LINES)
                    }
                  }
                })

                setWorkflowLogsOpenById((previous) => ({
                  ...previous,
                  [workflowId]: true
                }))
              }
            })
            .catch((error) => {
              const message = error instanceof Error ? error.message : 'Unable to execute workflow.'

              setWorkflowExecutionById((previous) => {
                const existingState = previous[workflowId] ?? {
                  status: 'idle',
                  logs: []
                }

                return {
                  ...previous,
                  [workflowId]: {
                    status: 'error',
                    logs: [...existingState.logs, `[ERROR] ${message}`].slice(-MAX_WORKFLOW_LOG_LINES)
                  }
                }
              })

              setWorkflowLogsOpenById((previous) => ({
                ...previous,
                [workflowId]: true
              }))
            })
        }
      } else {
        console.log(`${item.title} selected`)
      }

      if (activePopup !== 'workflow' && activePopup !== 'settings') {
        setActivePopup(null)
      } else {
        if (mode === 'ai') {
          window.setTimeout(() => inputRef.current?.focus(), 40)
        }
      }
    },
    [activePopup, appendAssistantMessage, mode]
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

  const toggleRecording = useCallback(async () => {
    if (voiceState === 'transcribing') return

    if (voiceState === 'recording') {
      mediaRecorderRef.current?.stop()
      micStreamRef.current?.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      audioChunksRef.current = []

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        setVoiceState('transcribing')
        micStreamRef.current?.getTracks().forEach((t) => t.stop())
        micStreamRef.current = null

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        blob.arrayBuffer().then(async (buffer) => {
          try {
            const text = await window.api!.voice.transcribe(buffer)
            if (text.trim()) {
              setQuery((prev) => (prev ? prev + ' ' + text.trim() : text.trim()))
              setTimeout(() => inputRef.current?.focus(), 50)
            }
            setVoiceState('idle')
          } catch {
            setVoiceState('error')
            setTimeout(() => setVoiceState('idle'), 400)
          }
        })
      }

      recorder.start(250)
      setVoiceState('recording')
    } catch {
      setVoiceState('error')
      setTimeout(() => setVoiceState('idle'), 400)
    }
  }, [voiceState])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return

      if (activePopup) {
        setActivePopup(null)
        return
      }

      if (isChatOpen) {
        return
      }

      handleClose()
    },
    [activePopup, handleClose, isChatOpen]
  )

  const handleRootKeyDownCapture = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        mode === 'ai' &&
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === 'm' || event.key === 'M')
      ) {
        event.preventDefault()
        event.stopPropagation()
        void toggleRecording()
        return
      }

      const hasChatHistory = Boolean(activeConversation?.messages.length || conversations.length)
      if (
        mode === 'ai' &&
        hasChatHistory &&
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === 'Tab' || event.key === '`')
      ) {
        event.preventDefault()
        event.stopPropagation()
        setIsChatOpen((open) => !open)
        setIsHistoryOpen(false)
        return
      }

      if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        event.stopPropagation()
        toggleMode()
        return
      }

      if (event.key === 'Escape' && mode === 'terminal' && !activePopup) {
        event.preventDefault()
        switchToAiMode()
      }
    },
    [activeConversation, activePopup, conversations, mode, switchToAiMode, toggleMode, toggleRecording]
  )

  const chatMessages = activeConversation
    ? normalizeMessageOrder(activeConversation.messages)
    : []

  const themePalette = getThemePalette(themeGradient)
  const themeStyles: CSSProperties = {
    '--chat-accent': themePalette.accent,
    '--chat-accent-soft': themePalette.accentSoft,
    '--chat-accent-strong': themePalette.accentStrong,
    '--chat-user-text': themePalette.userText,
    '--chat-assistant-text': themePalette.assistantText,
    '--chat-assistant-bg': themePalette.assistantBg,
    '--chat-assistant-border': themePalette.assistantBorder,
    '--chat-scroll-thumb': themePalette.scrollbarThumb,
    '--chat-scroll-thumb-hover': themePalette.scrollbarThumbHover,
    '--chat-meta-text': themePalette.metaText
  } as CSSProperties

  return (
    <div
      className="relative w-screen h-screen flex items-end justify-center pb-5 select-none"
      style={{ background: 'transparent' }}
      onClick={handleOverlayClick}
      onKeyDownCapture={handleRootKeyDownCapture}
    >
      {/*
        isAppVisible tracks whether the visible command bar has finished its
        exit animation. Heavy transient UI such as popups should respect it,
        but the terminal host stays mounted so its scrollback survives hide/
        show cycles.
      */}
      <AnimatePresence onExitComplete={() => setIsAppVisible(false)}>
        {visible && (
          <motion.div
            key="command-bar"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ type: 'spring', damping: 15, stiffness: 120, mass: 0.8 }}
            className="relative flex flex-col w-[750px] max-w-full"
            style={themeStyles}
          >
            <AnimatePresence>
              {mode === 'ai' && isChatOpen && (
                <motion.div
                  key="chat-window"
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -6, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`mb-2 rounded-2xl border border-white/10 bg-gradient-to-br ${themeGradient} p-4 chat-surface`}
                >
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTogglePin}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                          isPinned
                            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/25'
                            : 'border-white/10 text-neutral-400 hover:border-white/20 hover:bg-white/10 hover:text-neutral-200'
                        }`}
                        aria-label={isPinned ? 'Unpin window' : 'Pin window'}
                        aria-pressed={isPinned}
                      >
                        <PinIcon active={isPinned} />
                      </button>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Conversation</p>
                        <p className="text-sm font-medium text-neutral-200">
                          {activeConversation?.title ?? DEFAULT_CONVERSATION_TITLE}
                        </p>
                      </div>
                    </div>
                    <button
                      ref={historyButtonRef}
                      type="button"
                      onClick={() => setIsHistoryOpen((open) => !open)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-neutral-300 transition-colors hover:border-white/20 hover:bg-white/10"
                      aria-label="Open conversation history"
                    >
                      <MenuIcon />
                    </button>

                    <AnimatePresence>
                      {isHistoryOpen && (
                        <motion.div
                          key="history-menu"
                          ref={historyMenuRef}
                          initial={{ opacity: 0, y: -8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 top-10 z-20 w-56 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/95 shadow-xl"
                        >
                          <div className="max-h-40 overflow-y-auto scrollbar-hidden py-1">
                            {conversations.length === 0 ? (
                              <p className="px-2.5 py-2 text-[11px] text-neutral-500">No conversations yet.</p>
                            ) : (
                              conversations.map((conversation) => (
                                <button
                                  key={conversation.id}
                                  type="button"
                                  onClick={() => {
                                    setActiveConversation(conversation)
                                    setIsChatOpen(true)
                                    setIsHistoryOpen(false)
                                  }}
                                  className={`flex w-full flex-col gap-0.5 px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-neutral-800/70 ${
                                    conversation.id === activeConversation?.id
                                      ? 'bg-neutral-800/70 text-neutral-100'
                                      : 'text-neutral-300'
                                  }`}
                                >
                                  <span className="truncate font-medium">{conversation.title}</span>
                                  <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                                    {conversation.messages.length} messages
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div
                    ref={chatScrollRef}
                    onScroll={handleChatScroll}
                    className="mt-3 h-56 overflow-y-auto chat-scrollbar space-y-3 pr-2"
                    style={{ height: CHAT_SCROLL_HEIGHT }}
                  >
                    {chatMessages.length === 0 ? (
                      <p className="text-xs text-neutral-500">No messages yet.</p>
                    ) : (
                      chatMessages.map((message) => {
                        const isAssistant = message.role === 'assistant'
                        const isUser = message.role === 'user'
                        const isStreaming =
                          isAssistant && isLoading && activeStreamMessageId === message.id
                        const reasoningText = message.reasoning?.trim() ?? ''
                        const showThinking = isAssistant && (isStreaming || reasoningText.length > 0)
                        const isThinkingOpen = Boolean(thinkingOpenById[message.id])
                        const modelLabel = message.model?.trim()
                        const usageLabel = formatUsageSummary(message)
                        const metaLabel = [modelLabel, usageLabel].filter(Boolean).join(` \u00b7 `)

                        return (
                          <div
                            key={message.id}
                            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`chat-message max-w-[78%] rounded-2xl border px-3 py-2 text-[13px] leading-relaxed select-text ${
                                isUser
                                  ? 'chat-message--user whitespace-pre-wrap'
                                  : 'chat-message--assistant'
                              }`}
                            >
                              {showThinking && (
                                <div className="chat-thinking">
                                  <button
                                    type="button"
                                    className="chat-thinking-toggle"
                                    onClick={() =>
                                      setThinkingOpenById((previous) => ({
                                        ...previous,
                                        [message.id]: !isThinkingOpen
                                      }))
                                    }
                                  >
                                    <span className="chat-thinking-indicator">
                                      {isStreaming ? <SpinnerIcon /> : null}
                                    </span>
                                    <span>Thinking...</span>
                                    <span className="chat-thinking-caret">
                                      {isThinkingOpen ? 'v' : '>'}
                                    </span>
                                  </button>

                                  {isThinkingOpen && (
                                    <div className="chat-thinking-body">
                                      {reasoningText ? (
                                        <p className="whitespace-pre-wrap">{reasoningText}</p>
                                      ) : (
                                        <p className="chat-thinking-empty">
                                          {isStreaming
                                            ? 'Reasoning is streaming...'
                                            : 'Reasoning not available.'}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {isAssistant ? (
                                <AssistantMarkdown content={message.content} />
                              ) : (
                                message.content
                              )}

                              {isAssistant && metaLabel ? (
                                <div className="chat-message-meta">
                                  {metaLabel}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              className={`relative flex items-center w-full rounded-2xl p-2 bg-gradient-to-br ${themeGradient} border border-white/10 transition-opacity duration-100 ${
                mode === 'terminal' ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              style={{
                WebkitBackdropFilter: 'blur(40px)',
                backdropFilter: 'blur(40px)'
              }}
            >
            <AnimatePresence mode="wait">
              {mode === 'ai' && activePopup && isAppVisible && (
                <ModulePopup
                  key={activePopup}
                  activePopup={activePopup}
                  popupRef={popupRef}
                  themeGradient={themeGradient}
                  isAppVisible={isAppVisible}
                  selectedSettingsItemId={selectedSystemPrompt?.id}
                  onClearSelectedSettingsItem={clearCurrentSystemPrompt}
                  appLauncherItems={apps.map((item) => {
                    const targets = normalizeLauncherAppTargets(item)
                    return {
                      id: item.id,
                      title: item.title,
                      subtitle: formatTargetsSummary(targets),
                      icon: 'grid',
                      appLaunchTargets: targets
                    }
                  })}
                  workflowItems={workflows.map((item) => ({
                    id: item.id,
                    title: item.title,
                    subtitle: item.language,
                    icon: 'bolt',
                    workflowData: item
                  }))}
                  workflowExecutionById={workflowExecutionById}
                  workflowLogsOpenById={workflowLogsOpenById}
                  onToggleWorkflowLogs={handleToggleWorkflowLogs}
                  settingsItems={preprompts.map((item) => ({
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
                  anchorSide={activePopup === 'settings' ? 'left' : 'right'}
                  chatModel={chatModel}
                  onSelectChatModel={(model) => {
                    setChatModel(model)
                    window.api?.config.updateChatModel?.(model)
                  }}
                  onOpenFullSettings={() => {
                    setActivePopup(null)
                    if (window.api?.window.openSettings) {
                      window.api.window.openSettings()
                    }
                  }}
                  reasoningEffort={reasoningEffort}
                  onSelectReasoningEffort={(effort) => {
                    setReasoningEffort(effort)
                    window.api?.config.updateReasoningEffort?.(effort)
                  }}
                />
              )}
            </AnimatePresence>

            <button
              ref={settingsButtonRef}
              onClick={(e) => {
                e.stopPropagation()
                togglePopup('settings')
              }}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-150"
              aria-label="Settings"
              aria-pressed={activePopup === 'settings'}
            >
              <SettingsIcon />
            </button>

            {voiceState === 'recording' && micStreamRef.current ? (
                <VoiceWaveform stream={micStreamRef.current} />
              ) : (
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="What can I help you with today?"
                  className="flex-1 bg-transparent text-lg text-neutral-100 placeholder:text-neutral-500 border-none focus:outline-none focus:ring-0 px-4 py-3"
                  style={{ caretColor: 'var(--chat-accent)' }}
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                />
              )}

              <button
                onClick={(e) => { e.stopPropagation(); void toggleRecording() }}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150 border ${
                  voiceState === 'error'
                    ? 'bg-red-500/60 border-red-400/50 text-red-200'
                    : voiceState === 'recording'
                      ? 'bg-red-500/80 border-red-400/50 text-white animate-pulse'
                      : voiceState === 'transcribing'
                        ? 'bg-neutral-700/60 border-white/8 text-neutral-300 animate-pulse'
                        : 'bg-neutral-700/60 hover:bg-neutral-600/80 border-white/8 text-neutral-300 hover:text-white'
                }`}
                aria-label={voiceState === 'recording' ? 'Stop recording' : 'Start voice recording'}
                disabled={voiceState === 'transcribing'}
              >
                {voiceState === 'recording' ? <StopIcon /> : voiceState === 'transcribing' ? <SpinnerIcon /> : <MicIcon />}
              </button>

              <div className="w-1" />

              <button
                onClick={() => void handleSubmit()}
                disabled={!query.trim() || isLoading}
                className="flex items-center justify-center w-8 h-8 mr-1 rounded-lg bg-neutral-700/60 hover:bg-neutral-600/80 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-300 transition-all duration-150 border border-white/8"
                aria-label="Submit prompt"
              >
                {isLoading ? <SpinnerIcon /> : <SendIcon />}
              </button>

              <div ref={moduleButtonsRef} className="flex items-center gap-1">
                {buttonVisibility.appLauncher && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePopup('appLauncher')
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-150"
                    aria-label="App Launcher"
                    aria-pressed={activePopup === 'appLauncher'}
                  >
                    <GridIcon />
                  </button>
                )}

                {buttonVisibility.workflow && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePopup('workflow')
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-150"
                    aria-label="Workflows"
                    aria-pressed={activePopup === 'workflow'}
                  >
                    <CodeIcon />
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {(hasInitializedTerminal || mode === 'terminal') && (
        <motion.div
          key="terminal-container"
          className="absolute inset-x-0 bottom-5 z-20 h-[360px] pointer-events-auto flex justify-center"
          initial={false}
          animate={
            mode === 'terminal'
              ? { scaleY: 1, y: 0, opacity: 1 }
              : { scaleY: 0.12, y: 0, opacity: 0 }
          }
          transition={{
            type: 'spring',
            damping: 22,
            stiffness: 280,
            mass: 1,
            duration: 0.2
          }}
          style={{
            pointerEvents: mode === 'terminal' && visible ? 'auto' : 'none',
            transformOrigin: 'bottom center'
          }}
          aria-hidden={mode !== 'terminal' || !visible}
        >
          <div
            className={`flex h-full w-[750px] max-w-full flex-col overflow-hidden rounded-2xl p-2 bg-gradient-to-br ${themeGradient} border border-white/10`}
            style={{
              WebkitBackdropFilter: 'blur(40px)',
              backdropFilter: 'blur(40px)'
            }}
          >
            <div className="min-h-0 flex-1">
              <TerminalView active={mode === 'terminal' && visible && isAppVisible} fontFamily={terminalFont} />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
