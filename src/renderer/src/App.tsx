import { useState, useEffect, useMemo, useRef, useCallback, type CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ModulePopup, { type ActivePopup, type PopupItem } from './components/ModulePopup'
import LauncherResults from './components/LauncherResults'
import TerminalView from './components/TerminalView'
import VoiceWaveform from './components/VoiceWaveform'
import ConfirmDeleteModal from './components/ConfirmDeleteModal'
import { Favicon } from './components/Favicon'
import { AssistantMarkdown, CopyButton, ToolStepRow, WebSearchStepRow } from './components/chat/AssistantMarkdown'
import ExcalidrawEmbed from './components/ExcalidrawEmbed'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CodeIcon,
  ExpandIcon,
  GridIcon,
  ImageIcon,
  MenuIcon,
  MicIcon,
  PinIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  SpinnerIcon,
  StopIcon,
  TasksIcon,
  TrashIcon,
  XIcon
} from './components/icons'
import { createId } from './utils/helpers'
import { rankLauncherItems } from './utils/fuzzy'
import { formatTargetsSummary, normalizeLaunchTargets } from './utils/launcherTargets'
import {
  computeContextStats,
  formatConversationTimestamp,
  formatCurrency,
  formatSourceUrl,
  formatTokenCount,
  formatUsageSummary
} from './utils/chatUsage'
import { DEFAULT_TERMINAL_FONT, normalizeTerminalFont } from './constants/terminalFonts'
import {
  DEFAULT_THEME_GRADIENT,
  getThemeMode,
  getThemePalette,
  normalizeThemeGradient
} from './constants/theme'
import type { ButtonVisibility, ReasoningEffort } from '../../shared/config'
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_TEXTURE_INTENSITY,
  TEXTURE_MAX_OPACITY
} from '../../shared/config'
import type { UpdateStatus } from '../../shared/update'
import type {
  ChatConversation,
  ChatMessage,
  ChatRole,
  ChatStreamEvent,
  ChatUsage,
  InputContent,
  InputImageContent,
  InputTextContent,
  ReasoningStep,
  Source
} from '../../shared/chat'
import { collectExcalidrawCheckpoints } from '../../shared/excalidraw'
import type { LauncherApp, LauncherAppTarget } from './types/launcher-app'
import type { InstalledApp, LauncherItem } from '../../shared/launcher'
import type { Preprompt } from './types/preprompt'
import type { Task } from './types/task'
import type { GamificationState, XpToastState } from './types/gamification'
import type {
  Workflow,
  WorkflowExecutionState,
  WorkflowLogPayload,
  WorkflowStatusUpdatePayload
} from './types/workflow'

interface SelectedSystemPrompt {
  id: string
  title: string
  content: string
}

type AppMode = 'ai' | 'terminal'

const DEFAULT_GAMIFICATION_STATE: GamificationState = {
  currentLevel: 1,
  currentXP: 0,
  totalLifetimeXP: 0,
  streakDays: 0,
  lastActiveDate: null
}

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
  return normalizeLaunchTargets(app.targets, app.path, app.arguments)
}

function normalizePopupLaunchTargets(item: PopupItem): LauncherAppTarget[] {
  return normalizeLaunchTargets(item.appLaunchTargets, item.appPath, item.launchArguments)
}

interface AttachedImage {
  id: string
  base64: string
  fileName: string
  mimeType: string
}

const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_ATTACHED_IMAGES = 10

function createConversationTitle(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return DEFAULT_CONVERSATION_TITLE
  const firstLine = trimmed.split('\n')[0] || trimmed
  if (firstLine.length <= MAX_CONVERSATION_TITLE_LENGTH) return firstLine
  return `${firstLine.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 3)}...`
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

interface SearchMatch {
  conversationId: string
  conversationTitle: string
  messageId: string
  role: ChatRole
  snippet: string
  count: number
}

interface SearchGroup {
  conversationId: string
  conversationTitle: string
  matches: SearchMatch[]
}

function getMessageSearchText(message: ChatMessage): string {
  const parts = [message.content]
  if (message.reasoning?.trim()) {
    parts.push(message.reasoning.trim())
  }
  return parts.join('\n')
}

function countOccurrences(text: string, query: string): number {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  let count = 0
  let index = lowerText.indexOf(lowerQuery)
  while (index !== -1) {
    count += 1
    index = lowerText.indexOf(lowerQuery, index + lowerQuery.length)
  }
  return count
}

function buildSearchSnippet(text: string, query: string, maxLength = 96): string {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)
  if (index === -1) {
    return text.replace(/\s+/g, ' ').trim().slice(0, maxLength)
  }

  const start = Math.max(0, index - 28)
  const end = Math.min(text.length, index + query.length + 28)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${prefix}${snippet}${suffix}`
}

function buildSearchMatches(
  conversations: ChatConversation[],
  activeConversation: ChatConversation | null,
  query: string
): SearchMatch[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const allConversations = [...conversations]
  if (activeConversation && !allConversations.some((item) => item.id === activeConversation.id)) {
    allConversations.unshift(activeConversation)
  }

  const matches: SearchMatch[] = []
  for (const conversation of allConversations) {
    for (const message of normalizeMessageOrder(conversation.messages)) {
      const text = getMessageSearchText(message)
      const count = countOccurrences(text, trimmed)
      if (count <= 0) continue

      matches.push({
        conversationId: conversation.id,
        conversationTitle: conversation.title || DEFAULT_CONVERSATION_TITLE,
        messageId: message.id,
        role: message.role,
        snippet: buildSearchSnippet(text, trimmed),
        count
      })
    }
  }

  return matches
}

function getSearchHighlightRegistry(): { set(name: string, highlight: unknown): void; delete(name: string): void } | undefined {
  return (CSS as unknown as { highlights?: { set(name: string, highlight: unknown): void; delete(name: string): void } })
    .highlights
}

function clearSearchHighlight(): void {
  getSearchHighlightRegistry()?.delete('chat-search')
}

function applySearchHighlight(container: HTMLElement, query: string): void {
  const registry = getSearchHighlightRegistry()
  const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight

  if (!registry || !HighlightCtor) {
    clearSearchHighlight()
    return
  }

  const lowerQuery = query.toLowerCase()
  const ranges: Range[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()

  while (node) {
    const value = node.nodeValue ?? ''
    if (value) {
      const lowerValue = value.toLowerCase()
      let index = lowerValue.indexOf(lowerQuery)
      while (index !== -1) {
        try {
          const range = document.createRange()
          range.setStart(node, index)
          range.setEnd(node, index + lowerQuery.length)
          ranges.push(range)
        } catch {
          break
        }
        index = lowerValue.indexOf(lowerQuery, index + lowerQuery.length)
      }
    }
    node = walker.nextNode()
  }

  if (ranges.length === 0) {
    registry.delete('chat-search')
    return
  }

  registry.set('chat-search', new HighlightCtor(...ranges))
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
  const [isExpanded, setIsExpanded] = useState(false)
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
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([])
  const [launcherSelectedIndex, setLauncherSelectedIndex] = useState(0)
  const [launcherIcons, setLauncherIcons] = useState<Record<string, string>>({})
  const [launcherDismissed, setLauncherDismissed] = useState(false)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [preprompts, setPreprompts] = useState<Preprompt[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [gamification, setGamification] = useState<GamificationState>(DEFAULT_GAMIFICATION_STATE)
  const [xpToast, setXpToast] = useState<XpToastState | null>(null)
  const [workflowExecutionById, setWorkflowExecutionById] = useState<
    Record<string, WorkflowExecutionState>
  >({})
  const [workflowLogsOpenById, setWorkflowLogsOpenById] = useState<Record<string, boolean>>({})
  const [activePopup, setActivePopup] = useState<ActivePopup | null>(null)
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [showImagePanel, setShowImagePanel] = useState(false)
  const [buttonVisibility, setButtonVisibility] = useState<ButtonVisibility>({ appLauncher: true, workflow: true, tasks: true })
  const [chatModel, setChatModel] = useState<string>(DEFAULT_CHAT_MODEL)
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT)
  const [enableWebSearch, setEnableWebSearch] = useState(true)
  const [autoCollapseReasoning, setAutoCollapseReasoning] = useState(true)
  const [textureIntensity, setTextureIntensity] = useState(DEFAULT_TEXTURE_INTENSITY)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [isPinned, setIsPinned] = useState(false)
  const [sourcesPanelMessageId, setSourcesPanelMessageId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0)
  const [deletingConversation, setDeletingConversation] = useState<ChatConversation | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingApiKey, setOnboardingApiKey] = useState('')
  // Prompt handed off from the Paste Manager; consumed once the window is shown.
  const [pendingExternalPrompt, setPendingExternalPrompt] = useState<string | null>(null)
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing' | 'error'>('idle')
  const micStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const inputRef = useRef<HTMLDivElement>(null)
  const pasteBlocksRef = useRef<Map<string, string>>(new Map())
  const isComposingRef = useRef(false)
  const popupRef = useRef<HTMLDivElement>(null)
  const moduleButtonsRef = useRef<HTMLDivElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const imagePanelRef = useRef<HTMLDivElement>(null)
  const imageButtonRef = useRef<HTMLButtonElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const historyMenuRef = useRef<HTMLDivElement>(null)
  const historyButtonRef = useRef<HTMLButtonElement>(null)
  const successResetTimersRef = useRef<Record<string, number>>({})
  const activeConversationRef = useRef<ChatConversation | null>(null)
  const streamBufferRef = useRef<{ content: string; reasoning: string } | null>(null)
  const activeStreamIdRef = useRef<string | null>(null)
  const activeStreamMessageIdRef = useRef<string | null>(null)
  const activeStreamConversationIdRef = useRef<string | null>(null)
  // Forces the next submit to start a brand-new conversation (paste manager AI actions).
  const forceNewConversationRef = useRef(false)
  const reasoningAutoCloseTimersRef = useRef<Record<string, number>>({})
  const autoCollapseReasoningRef = useRef(autoCollapseReasoning)
  // Ref for the hide-delay timer so it can be cancelled on rapid show/hide.
  const hideDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function getFullPrompt(): string {
    const div = inputRef.current
    if (!div) return ''
    let result = ''
    for (const node of div.childNodes) {
      if (node instanceof HTMLElement && node.hasAttribute('data-paste-id')) {
        const id = node.getAttribute('data-paste-id')!
        result += pasteBlocksRef.current.get(id) ?? node.textContent ?? ''
      } else {
        result += node.textContent ?? ''
      }
    }
    return result
  }

  function clearInput(): void {
    const div = inputRef.current
    if (div) {
      div.textContent = ''
    }
    pasteBlocksRef.current.clear()
    setAttachedImages([])
    setShowImagePanel(false)
    setQuery('')
  }

  useEffect(() => {
    let isMounted = true

    const loadInitialTheme = async (): Promise<void> => {
      if (!window.api?.config.getConfig) return

      try {
        const config = await window.api.config.getConfig()
        if (isMounted) {
          setThemeGradient(normalizeThemeGradient(config.themeGradient))
          setTerminalFont(normalizeTerminalFont(config.terminalFont))
          if (config.hasOnboarded === false) {
            setShowOnboarding(true)
          }
          if (config.buttonVisibility) {
            setButtonVisibility(config.buttonVisibility)
          }
          if (config.chatModel) {
            setChatModel(config.chatModel)
          }
          if (config.reasoningEffort) {
            setReasoningEffort(config.reasoningEffort)
          }
          if (typeof config.enableWebSearch === 'boolean') {
            setEnableWebSearch(config.enableWebSearch)
          }
          if (typeof config.autoCollapseReasoning === 'boolean') {
            setAutoCollapseReasoning(config.autoCollapseReasoning)
          }
          if (typeof config.textureIntensity === 'number') {
            setTextureIntensity(config.textureIntensity)
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

    const unsubscribeWebSearchListener = window.api?.config.onWebSearchUpdated?.((newWebSearch) => {
      setEnableWebSearch(newWebSearch)
    })

    const unsubscribeAutoCollapseReasoningListener = window.api?.config.onAutoCollapseReasoningUpdated?.((newAutoCollapse) => {
      setAutoCollapseReasoning(newAutoCollapse)
    })

    const unsubscribeTextureIntensityListener = window.api?.config.onTextureIntensityUpdated?.((newIntensity) => {
      setTextureIntensity(newIntensity)
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
      if (typeof unsubscribeWebSearchListener === 'function') {
        unsubscribeWebSearchListener()
      }
      if (typeof unsubscribeAutoCollapseReasoningListener === 'function') {
        unsubscribeAutoCollapseReasoningListener()
      }
      if (typeof unsubscribeTextureIntensityListener === 'function') {
        unsubscribeTextureIntensityListener()
      }
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadUpdateStatus = async (): Promise<void> => {
      if (!window.api?.config.getUpdateStatus) return
      try {
        const status = await window.api.config.getUpdateStatus()
        if (isMounted) setUpdateStatus(status)
      } catch {
        // Ignore — updates will arrive via the subscription below.
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
    if (window.api?.window.onToggleVisibility) {
      // IMPORTANT: capture the returned cleanup function to prevent an IPC
      // listener leak — each call to onToggleVisibility registers a new
      // ipcRenderer listener that must be removed when this effect tears down.
      const unsubscribe = window.api.window.onToggleVisibility((v, terminalMode) => {
        if (v) {
          // Cancel any pending hide timer so rapid show/hide doesn't race.
          if (hideDelayTimerRef.current !== null) {
            clearTimeout(hideDelayTimerRef.current)
            hideDelayTimerRef.current = null
          }
          setIsAppVisible(true)
          setVisible(true)

          if (terminalMode) {
            setHasInitializedTerminal(true)
            setMode('terminal')
            setActivePopup(null)
          }
        } else {
          setVisible(false)
          setIsPinned(false)
          window.api?.window.setPinned?.(false)
          // Wait for the exit animation (~250 ms) before resetting state and
          // unmounting heavy components to free memory.
          hideDelayTimerRef.current = setTimeout(() => {
            hideDelayTimerRef.current = null
            clearInput()
            setIsExpanded(false)
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
    if (!window.api?.window.onOpenTasks) return

    const unsubscribe = window.api.window.onOpenTasks(() => {
      setMode('ai')
      setActivePopup('tasks')
    })

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!window.api?.window.onChatPrompt) return

    const unsubscribe = window.api.window.onChatPrompt((text) => {
      if (!text.trim()) return
      setMode('ai')
      setActivePopup(null)
      setPendingExternalPrompt(text)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.api?.store.onTasksUpdated?.((nextTasks) => {
      setTasks(nextTasks)
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
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

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev
      window.api?.window.setExpanded?.(next)
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
      clearInput()
      setIsExpanded(false)
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

  const loadInstalledApps = useCallback(async (): Promise<void> => {
    if (!window.api?.installedApps?.list) {
      setInstalledApps([])
      return
    }

    try {
      setInstalledApps(await window.api.installedApps.list())
    } catch {
      setInstalledApps([])
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

  const loadTasks = useCallback(async (): Promise<void> => {
    if (!window.api?.store.getTasks) {
      setTasks([])
      return
    }

    try {
      const savedTasks = await window.api.store.getTasks()
      setTasks(savedTasks)
    } catch {
      setTasks([])
    }
  }, [])

  const loadGamification = useCallback(async (): Promise<void> => {
    if (!window.api?.store.getGamification) {
      setGamification(DEFAULT_GAMIFICATION_STATE)
      return
    }

    try {
      setGamification(await window.api.store.getGamification())
    } catch {
      setGamification(DEFAULT_GAMIFICATION_STATE)
    }
  }, [])

  const handleAddTask = useCallback(async (title: string): Promise<void> => {
    if (!window.api?.store.addTask) return
    try {
      setTasks(await window.api.store.addTask(title))
    } catch {
      // ignore
    }
  }, [])

  const handleToggleTask = useCallback(async (id: string): Promise<void> => {
    if (!window.api?.store.toggleTask) return
    try {
      setTasks(await window.api.store.toggleTask(id))
    } catch {
      // ignore
    }
  }, [])

  const handleDeleteTask = useCallback(async (id: string): Promise<void> => {
    if (!window.api?.store.deleteTask) return
    try {
      setTasks(await window.api.store.deleteTask(id))
    } catch {
      // ignore
    }
  }, [])

  const handleReorderTasks = useCallback(async (orderedIds: string[]): Promise<void> => {
    if (!window.api?.store.reorderTasks) return
    try {
      setTasks(await window.api.store.reorderTasks(orderedIds))
    } catch {
      // ignore
    }
  }, [])

  const handleClearCompletedTasks = useCallback(async (): Promise<void> => {
    if (!window.api?.store.clearCompletedTasks) return
    try {
      const result = await window.api.store.clearCompletedTasks()
      setTasks(result.tasks)
      setGamification(result.gamification)

      if (result.clearedCount > 0) {
        setXpToast({
          id: Date.now(),
          xpGained: result.xpGained,
          levelUp: result.levelUp,
          newLevel: result.gamification.currentLevel,
          streakDays: result.gamification.streakDays,
          streakBonusApplied: result.streakBonusApplied
        })
        window.setTimeout(() => setXpToast(null), 2800)
      }
    } catch {
      // ignore
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

  const generateConversationTitleAsync = useCallback(
    (conversationId: string, prompt: string): void => {
      if (!window.api?.chat.generateConversationTitle) return

      void window.api.chat
        .generateConversationTitle(prompt)
        .then((rawTitle) => {
          const safeTitle =
            typeof rawTitle === 'string' ? rawTitle.trim().slice(0, MAX_CONVERSATION_TITLE_LENGTH) : ''
          if (!safeTitle) return

          setConversations((previous) =>
            previous.map((conversation) =>
              conversation.id === conversationId ? { ...conversation, title: safeTitle } : conversation
            )
          )

          const currentConversation = activeConversationRef.current
          if (currentConversation && currentConversation.id === conversationId) {
            const updatedConversation = { ...currentConversation, title: safeTitle }
            setActiveConversation(updatedConversation)
            persistConversation(updatedConversation)
          }
        })
        .catch(() => {
          // Keep the fallback title when generation fails.
        })
    },
    [persistConversation]
  )

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    activeConversationRef.current = activeConversation
  }, [activeConversation])

  useEffect(() => {
    activeStreamIdRef.current = activeStreamId
    activeStreamMessageIdRef.current = activeStreamMessageId
    activeStreamConversationIdRef.current = activeStreamConversationId
  }, [activeStreamId, activeStreamMessageId, activeStreamConversationId])

  useEffect(() => {
    autoCollapseReasoningRef.current = autoCollapseReasoning
  }, [autoCollapseReasoning])

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
      return
    }

    if (activePopup === 'tasks') {
      void loadTasks()
      void loadGamification()
    }
  }, [activePopup, loadApps, loadPreprompts, loadTasks, loadWorkflows, loadGamification])

  useEffect(() => {
    void loadInstalledApps()
  }, [loadInstalledApps])

  useEffect(() => {
    const unsubscribe = window.api?.config?.onLauncherShowSystemAppsUpdated?.(() => {
      setLauncherIcons({})
      void loadInstalledApps()
    })

    return () => unsubscribe?.()
  }, [loadInstalledApps])

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
    if (!showImagePanel) return

    const handleClickOutsideImagePanel = (event: MouseEvent) => {
      const target = event.target as Node
      if (imagePanelRef.current?.contains(target)) return
      if (imageButtonRef.current?.contains(target)) return
      setShowImagePanel(false)
    }

    document.addEventListener('mousedown', handleClickOutsideImagePanel)
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideImagePanel)
    }
  }, [showImagePanel])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showImagePanel) {
          event.preventDefault()
          setShowImagePanel(false)
          return
        }
        if (activePopup) {
          event.preventDefault()
          setActivePopup(null)
        }
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [activePopup, showImagePanel])

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
      const streamId = activeStreamIdRef.current
      if (!streamId || event.id !== streamId) return

      const conversationId = activeStreamConversationIdRef.current
      const messageId = activeStreamMessageIdRef.current
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

      if (event.type === 'reasoning-start') {
        setThinkingOpenById((previous) => ({
          ...previous,
          [messageId]: true
        }))
        return
      }

      if (event.type === 'reasoning-title' && event.title) {
        updateConversationMessage(conversationId, messageId, (message) => ({
          ...message,
          reasoningTitle: event.title
        }))
        return
      }

      if (event.type === 'reasoning-delta' && event.delta) {
        const delta = event.delta
        streamBufferRef.current = {
          content: streamBufferRef.current?.content ?? '',
          reasoning: `${streamBufferRef.current?.reasoning ?? ''}${delta}`
        }

        updateConversationMessage(conversationId, messageId, (message) => {
          const steps = message.steps ?? []
          const last = steps[steps.length - 1]
          const nextSteps: ReasoningStep[] =
            last && last.type === 'reasoning'
              ? [...steps.slice(0, -1), { type: 'reasoning', text: last.text + delta }]
              : [...steps, { type: 'reasoning', text: delta }]
          return {
            ...message,
            reasoning: `${message.reasoning ?? ''}${delta}`,
            steps: nextSteps
          }
        })
        return
      }

      if (event.type === 'reasoning-end') {
        return
      }

      if (event.type === 'sources' && event.sources && event.sources.length > 0) {
        const sources = event.sources
        updateConversationMessage(conversationId, messageId, (message) => {
          const steps = message.steps ?? []
          let targetIndex = -1
          if (event.itemId) {
            targetIndex = steps.findIndex(
              (step) => step.type === 'web_search' && step.id === event.itemId
            )
          }
          if (targetIndex === -1) {
            for (let i = steps.length - 1; i >= 0; i -= 1) {
              const step = steps[i]
              if (step.type === 'web_search' && step.status === 'searching') {
                targetIndex = i
                break
              }
            }
          }
          const nextSteps =
            targetIndex === -1
              ? steps
              : steps.map((step, index) => {
                  if (index !== targetIndex || step.type !== 'web_search') return step
                  return { ...step, status: 'done' as const, sources }
                })
          return { ...message, sources, steps: nextSteps }
        })
        return
      }

      if (event.type === 'tool-start') {
        if (event.toolType === 'web_search') {
          updateConversationMessage(conversationId, messageId, (message) => ({
            ...message,
            steps: [
              ...(message.steps ?? []),
              {
                type: 'web_search',
                id: event.itemId ?? createId('search_'),
                query: event.query ?? '',
                status: 'searching',
                sources: []
              }
            ]
          }))
        } else if (event.toolType === 'mcp' && event.itemId) {
          const toolItemId = event.itemId
          const toolName = event.toolName ?? event.query ?? 'MCP tool'
          const serverName = event.serverName
          const serverId = event.serverId
          const query = event.query
          updateConversationMessage(conversationId, messageId, (message) => ({
            ...message,
            steps: [
              ...(message.steps ?? []),
              {
                type: 'tool',
                id: toolItemId,
                name: toolName,
                serverName,
                serverId,
                query,
                status: 'running'
              }
            ]
          }))
        }
        return
      }

      if (event.type === 'tool-query') {
        const query = event.query
        if (!event.itemId || !query) return
        updateConversationMessage(conversationId, messageId, (message) => {
          const steps = message.steps ?? []
          const nextSteps = steps.map((step) => {
            if (step.type === 'web_search' && step.id === event.itemId) {
              if (step.query) return step
              return { ...step, query }
            }
            if (step.type === 'tool' && step.id === event.itemId) {
              if (step.query) return step
              return { ...step, query }
            }
            return step
          })
          return { ...message, steps: nextSteps }
        })
        return
      }

      if (event.type === 'tool-result' && event.itemId) {
        updateConversationMessage(conversationId, messageId, (message) => {
          const steps = message.steps ?? []
          const nextSteps = steps.map((step) => {
            if (step.type !== 'tool' || step.id !== event.itemId) return step
            if (event.status === 'running') {
              return { ...step, status: 'running' as const }
            }
            return {
              ...step,
              status: event.status === 'error' ? ('error' as const) : ('done' as const),
              content: event.content
            }
          })
          return { ...message, steps: nextSteps }
        })
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
                  model: event.model ?? message.model,
                  stopped: event.stopped ?? message.stopped,
                  steps: (message.steps ?? []).map((step) =>
                    step.type === 'web_search' && step.status === 'searching'
                      ? { ...step, status: 'done' as const }
                      : step.type === 'tool' && step.status === 'running'
                        ? { ...step, status: 'done' as const }
                        : step
                  )
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

        if (autoCollapseReasoningRef.current) {
          const timerId = window.setTimeout(() => {
            setThinkingOpenById((previous) => ({
              ...previous,
              [messageId]: false
            }))
          }, 900)
          reasoningAutoCloseTimersRef.current[messageId] = timerId
        }

        streamBufferRef.current = null
      }
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [])

  const handleCancel = useCallback(() => {
    const streamId = activeStreamIdRef.current
    if (!streamId) return
    window.api?.chat.cancelStream?.(streamId)
  }, [])

  const handleSubmit = useCallback(async () => {
    const rawPrompt = getFullPrompt().trim()
    if (!rawPrompt || isLoading) return

    const now = Date.now()
    const activeSystemPrompt = selectedSystemPrompt?.content.trim() || activeConversation?.systemPrompt?.trim() || ''

    const shouldStartNewConversation = !isChatOpen || forceNewConversationRef.current
    forceNewConversationRef.current = false
    let nextConversation = shouldStartNewConversation ? null : activeConversation
    if (!nextConversation) {
      const createdAt = now
      nextConversation = {
        id: createId('msg_'),
        title: createConversationTitle(rawPrompt),
        createdAt,
        updatedAt: createdAt,
        messages: [],
        systemPrompt: activeSystemPrompt || undefined
      }
      setActiveConversation(nextConversation)
      generateConversationTitleAsync(nextConversation.id, rawPrompt)
    }

    const userMessage: ChatMessage = {
      id: createId('msg_'),
      role: 'user',
      content: rawPrompt,
      createdAt: now,
      images: attachedImages.length > 0
        ? attachedImages.map(i => ({ base64: i.base64, fileName: i.fileName, mimeType: i.mimeType }))
        : undefined
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
    clearInput()
    setActiveConversation(userConversation)
    upsertConversation(userConversation)
    persistConversation(userConversation)

    let keepLoading = false

    try {
      if (!window.api?.chat.askCovenant) {
        throw new Error('OpenAI chat is only available in the Electron app.')
      }

      const requestMessages: Array<{ role: ChatRole; content: string | InputContent[] }> = [
        ...(userConversation.systemPrompt
          ? [{ role: 'system' as const, content: userConversation.systemPrompt }]
          : []),
        ...userConversation.messages.map((message) => ({
          role: message.role,
          content: message.images && message.images.length > 0
            ? [
                ...(message.content ? [{ type: 'input_text' as const, text: message.content }] : []),
                ...message.images.map(img => ({ type: 'input_image' as const, image_url: img.base64 }))
              ]
            : message.content
        }))
      ]

      const assistantMessageId = createId('msg_')
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
        id: createId('msg_'),
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
    persistConversation,
    generateConversationTitleAsync,
    attachedImages
  ])

  // Consume a prompt handed off from the Paste Manager once the window is
  // visible and the input is mounted, then submit it as a new conversation.
  useEffect(() => {
    if (!pendingExternalPrompt || !isAppVisible) return
    const prompt = pendingExternalPrompt
    let attempts = 0

    const inject = (): void => {
      const div = inputRef.current
      if (!div) {
        if (attempts++ < 30) window.requestAnimationFrame(inject)
        return
      }

      pasteBlocksRef.current.clear()
      setAttachedImages([])
      setShowImagePanel(false)
      div.textContent = prompt
      setQuery(prompt)
      forceNewConversationRef.current = true
      setPendingExternalPrompt(null)
      void handleSubmit()
    }

    inject()
  }, [pendingExternalPrompt, isAppVisible, handleSubmit])

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
          id: createId('msg_'),
          title: DEFAULT_CONVERSATION_TITLE,
          createdAt: now,
          updatedAt: now,
          messages: [],
          systemPrompt: undefined
        } as ChatConversation)

      const assistantMessage: ChatMessage = {
        id: createId('msg_'),
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

  const launcherPool = useMemo<LauncherItem[]>(
    () =>
      installedApps.map((app) => ({
        id: app.id,
        kind: 'app',
        title: app.title,
        score: 0,
        app: { path: app.path }
      })),
    [installedApps]
  )

  const launcherResults = useMemo<LauncherItem[]>(() => {
    if (mode !== 'ai') return []

    const trimmedQuery = query.trim()
    if (!trimmedQuery) return []

    return rankLauncherItems(trimmedQuery, launcherPool, 6)
  }, [mode, query, launcherPool])

  const launcherVisible =
    mode === 'ai' &&
    !isChatOpen &&
    !activePopup &&
    !launcherDismissed &&
    query.trim().length > 0 &&
    launcherResults.length > 0

  const launcherDisplayItems = useMemo<LauncherItem[]>(
    () =>
      launcherResults.map((item) =>
        item.app && launcherIcons[item.app.path]
          ? { ...item, iconBase64: launcherIcons[item.app.path] }
          : item
      ),
    [launcherResults, launcherIcons]
  )

  useEffect(() => {
    setLauncherSelectedIndex(0)
    setLauncherDismissed(false)
  }, [query])

  useEffect(() => {
    setLauncherSelectedIndex((current) =>
      Math.min(current, Math.max(launcherResults.length - 1, 0))
    )
  }, [launcherResults.length])

  useEffect(() => {
    if (!launcherVisible) return

    const missing = launcherResults.filter(
      (item) => item.app && launcherIcons[item.app.path] === undefined
    )
    if (missing.length === 0) return

    let cancelled = false
    void Promise.all(
      missing.map(async (item) => {
        const appPath = item.app?.path
        if (!appPath) return
        const icon = await window.api?.installedApps?.icon?.(appPath)
        if (cancelled) return
        setLauncherIcons((previous) => ({
          ...previous,
          [appPath]: icon ?? ''
        }))
      })
    )

    return () => {
      cancelled = true
    }
  }, [launcherVisible, launcherResults, launcherIcons])

  const runLauncherItem = useCallback(
    (item: LauncherItem | undefined) => {
      if (!item) return

      if (item.kind === 'app' && item.app) {
        setLauncherDismissed(true)
        const launchApp = window.api?.launchApp
        if (!launchApp) {
          appendAssistantMessage('App launching is only available in the Electron app.')
          return
        }

        void (async () => {
          const result = await launchApp(item.app!.path, item.app!.arguments ?? '')
          if (!result.success) {
            appendAssistantMessage(`Error: ${result.error ?? 'Unable to launch application.'}`)
            return
          }
          handleClose()
        })().catch((error) => {
          const message = error instanceof Error ? error.message : 'Unable to launch application.'
          appendAssistantMessage(`Error: ${message}`)
        })
        return
      }

      if (item.kind === 'ai') {
        setLauncherDismissed(true)
        void handleSubmit()
      }
    },
    [appendAssistantMessage, handleClose, handleSubmit]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (launcherVisible) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setLauncherSelectedIndex((current) => (current + 1) % launcherResults.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setLauncherSelectedIndex(
            (current) => (current - 1 + launcherResults.length) % launcherResults.length
          )
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setLauncherDismissed(true)
          return
        }
        if (e.key === 'Enter') {
          if (isComposingRef.current) return
          e.preventDefault()
          runLauncherItem(launcherResults[launcherSelectedIndex])
          return
        }
      }

      if (e.key === 'Escape') {
        if (showImagePanel) {
          setShowImagePanel(false)
          return
        }

        if (activePopup) {
          setActivePopup(null)
          return
        }

        handleClose()
      } else if (e.key === 'Enter') {
        if (isComposingRef.current) return
        e.preventDefault()
        void handleSubmit()
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return
        const range = selection.getRangeAt(0)
        if (!range.collapsed) return

        const node = e.key === 'Backspace'
          ? (range.startOffset === 0 ? range.startContainer.previousSibling : null)
          : range.startContainer.nextSibling

        if (node instanceof HTMLElement && node.hasAttribute('data-paste-id')) {
          e.preventDefault()
          const id = node.getAttribute('data-paste-id')!
          pasteBlocksRef.current.delete(id)
          node.remove()
          if (inputRef.current) {
            setQuery(inputRef.current.textContent ?? '')
          }
        }
      }
    },
    [
      activePopup,
      showImagePanel,
      handleClose,
      handleSubmit,
      launcherVisible,
      launcherResults,
      launcherSelectedIndex,
      runLauncherItem
    ]
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
              const div = inputRef.current
              if (div) {
                const separator = div.textContent ? ' ' : ''
                div.appendChild(document.createTextNode(separator + text.trim()))
                setQuery(div.textContent ?? '')
              }
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

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setActiveSearchMatchIndex(0)
  }, [])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    window.setTimeout(() => searchInputRef.current?.focus(), 40)
  }, [])

  const toggleSearch = useCallback(() => {
    if (searchOpen) {
      closeSearch()
    } else {
      openSearch()
    }
  }, [searchOpen, openSearch, closeSearch])

  const handleDeleteConversation = useCallback(async () => {
    const target = deletingConversation
    if (!target) return

    if (!window.api?.chat.deleteConversation) {
      setDeletingConversation(null)
      return
    }

    try {
      const updated = await window.api.chat.deleteConversation(target.id)
      setConversations(sortConversations(updated))
      if (activeConversation?.id === target.id) {
        setActiveConversation(null)
        setIsChatOpen(false)
        closeSearch()
      }
    } catch {
      // Ignore deletion failures — keep the current UI state.
    } finally {
      setDeletingConversation(null)
    }
  }, [deletingConversation, activeConversation, closeSearch])

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

      if (
        mode === 'ai' &&
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === 'f' || event.key === 'F')
      ) {
        event.preventDefault()
        event.stopPropagation()
        if (!isChatOpen) {
          setIsChatOpen(true)
        }
        openSearch()
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
    [activeConversation, activePopup, conversations, isChatOpen, mode, switchToAiMode, toggleMode, toggleRecording, openSearch]
  )

  const chatMessages = useMemo(
    () => (activeConversation ? normalizeMessageOrder(activeConversation.messages) : []),
    [activeConversation]
  )

  const searchMatches = useMemo(
    () => buildSearchMatches(conversations, activeConversation, searchQuery),
    [conversations, activeConversation, searchQuery]
  )

  const searchGroups = useMemo<SearchGroup[]>(() => {
    const groups: SearchGroup[] = []
    for (const match of searchMatches) {
      const last = groups[groups.length - 1]
      if (last && last.conversationId === match.conversationId) {
        last.matches.push(match)
      } else {
        groups.push({
          conversationId: match.conversationId,
          conversationTitle: match.conversationTitle,
          matches: [match]
        })
      }
    }
    return groups
  }, [searchMatches])

  const navigateToSearchMatch = useCallback(
    (match: SearchMatch) => {
      if (match.conversationId !== activeConversation?.id) {
        const conversation = conversations.find((item) => item.id === match.conversationId)
        if (conversation) {
          setActiveConversation(conversation)
        }
      }
      setIsChatOpen(true)
      setIsHistoryOpen(false)
      setActivePopup(null)
      window.setTimeout(() => {
        const scrollElement = chatScrollRef.current
        const messageElement = scrollElement?.querySelector(`[data-message-id="${match.messageId}"]`)
        if (messageElement) {
          messageElement.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      }, 80)
    },
    [activeConversation, conversations]
  )

  const goToSearchMatch = useCallback(
    (index: number) => {
      if (searchMatches.length === 0) return
      const clamped = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length
      setActiveSearchMatchIndex(clamped)
      navigateToSearchMatch(searchMatches[clamped])
    },
    [searchMatches, navigateToSearchMatch]
  )

  const goToNextSearchMatch = useCallback(() => {
    goToSearchMatch(activeSearchMatchIndex + 1)
  }, [goToSearchMatch, activeSearchMatchIndex])

  const goToPreviousSearchMatch = useCallback(() => {
    goToSearchMatch(activeSearchMatchIndex - 1)
  }, [goToSearchMatch, activeSearchMatchIndex])

  const selectSearchMatch = useCallback(
    (match: SearchMatch) => {
      const index = searchMatches.indexOf(match)
      if (index === -1) return
      goToSearchMatch(index)
    },
    [searchMatches, goToSearchMatch]
  )

  const selectSearchGroup = useCallback(
    (conversationId: string) => {
      const index = searchMatches.findIndex((match) => match.conversationId === conversationId)
      if (index === -1) return
      goToSearchMatch(index)
    },
    [searchMatches, goToSearchMatch]
  )

  useEffect(() => {
    const trimmedQuery = searchQuery.trim()
    const scrollElement = chatScrollRef.current

    if (!trimmedQuery || !scrollElement || !isChatOpen) {
      clearSearchHighlight()
      return
    }

    const timer = window.setTimeout(() => {
      applySearchHighlight(scrollElement, trimmedQuery)
    }, 0)

    return () => {
      window.clearTimeout(timer)
      clearSearchHighlight()
    }
  }, [searchQuery, chatMessages, activeConversation?.id, isChatOpen])

  const themePalette = useMemo(() => getThemePalette(themeGradient), [themeGradient])
  const themeStyles = useMemo<CSSProperties>(
    () => ({
      '--chat-accent': themePalette.accent,
      '--chat-accent-soft': themePalette.accentSoft,
      '--chat-accent-strong': themePalette.accentStrong,
      '--chat-on-accent': themePalette.onAccent,
      '--chat-user-text': themePalette.userText,
      '--chat-assistant-text': themePalette.assistantText,
      '--chat-assistant-bg': themePalette.assistantBg,
      '--chat-assistant-border': themePalette.assistantBorder,
      '--chat-scroll-thumb': themePalette.scrollbarThumb,
      '--chat-scroll-thumb-hover': themePalette.scrollbarThumbHover,
      '--chat-meta-text': themePalette.metaText
    } as CSSProperties),
    [themePalette]
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', getThemeMode(themeGradient))
  }, [themeGradient])

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--texture-opacity',
      String((textureIntensity / 100) * TEXTURE_MAX_OPACITY)
    )
  }, [textureIntensity])

  const contextStats = useMemo(
    () => (activeConversation ? computeContextStats(activeConversation.messages, chatModel) : null),
    [activeConversation, chatModel]
  )

  const handleCompleteOnboarding = (): void => {
    const key = onboardingApiKey.trim()
    if (key) {
      window.api?.config.saveApiKey?.(key)
    }
    window.api?.config.markOnboarded?.()
    setShowOnboarding(false)
  }

  return (
    <div
      className="relative w-screen h-screen flex items-end justify-center pb-5 select-none"
      style={{ background: 'transparent' }}
      onClick={handleOverlayClick}
      onKeyDownCapture={handleRootKeyDownCapture}
    >
      {updateStatus &&
      (updateStatus.state === 'available' ||
        updateStatus.state === 'downloading' ||
        updateStatus.state === 'downloaded') ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center px-4 pt-3">
          <div className="pointer-events-auto flex w-[750px] max-w-full items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/95 px-4 py-3 shadow-xl shadow-black/40">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-neutral-100">
                {updateStatus.state === 'downloaded'
                  ? `Covenant v${updateStatus.version} is ready to install`
                  : updateStatus.state === 'downloading'
                    ? `Downloading Covenant v${updateStatus.version}…`
                    : updateStatus.downloadUrl
                      ? `Covenant v${updateStatus.version} is available`
                      : `Covenant v${updateStatus.version} update found`}
              </p>
              {typeof updateStatus.percent === 'number' && updateStatus.state !== 'available' ? (
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      updateStatus.state === 'downloaded' ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${Math.min(Math.max(updateStatus.percent, 0), 100)}%` }}
                  />
                </div>
              ) : null}
            </div>
            {updateStatus.state === 'downloaded' || (updateStatus.state === 'available' && updateStatus.downloadUrl) ? (
              <button
                type="button"
                onClick={() => window.api?.config.installUpdate?.()}
                className="flex-shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
              >
                {updateStatus.state === 'downloaded' ? 'Restart & install' : 'Download'}
              </button>
            ) : (
              <span className="flex-shrink-0 text-xs tabular-nums text-neutral-400">
                {typeof updateStatus.percent === 'number' ? `${Math.round(updateStatus.percent)}%` : '…'}
              </span>
            )}
          </div>
        </div>
      ) : null}

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
                  className={`relative mb-2 rounded-2xl border border-white/10 bg-gradient-to-br ${themeGradient} p-4 chat-surface texture-surface`}
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
                    <div className="flex items-center gap-1">
                      <div className="relative">
                        <motion.div
                          initial={false}
                          animate={{ width: searchOpen ? 280 : 32 }}
                          transition={{ type: 'spring', damping: 26, stiffness: 320, mass: 0.8 }}
                          className={`flex h-8 items-center overflow-hidden rounded-lg border transition-colors duration-150 ${
                            searchOpen
                              ? 'border-white/20 bg-white/10'
                              : 'border-white/10 hover:border-white/20 hover:bg-white/10'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={toggleSearch}
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-neutral-300 transition-colors hover:text-neutral-100"
                            aria-label={searchOpen ? 'Close search' : 'Search conversations'}
                            aria-pressed={searchOpen}
                          >
                            <SearchIcon />
                          </button>
                          {searchOpen && (
                            <>
                              <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => {
                                  setSearchQuery(e.target.value)
                                  setActiveSearchMatchIndex(0)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    closeSearch()
                                  } else if (e.key === 'Enter') {
                                    e.preventDefault()
                                    if (e.shiftKey) {
                                      goToPreviousSearchMatch()
                                    } else {
                                      goToNextSearchMatch()
                                    }
                                  }
                                }}
                                placeholder="Search all conversations…"
                                className="h-full min-w-0 flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
                                spellCheck={false}
                              />
                              {searchQuery.trim() && searchMatches.length > 0 ? (
                                <span className="flex-shrink-0 text-[11px] tabular-nums text-neutral-400">
                                  {activeSearchMatchIndex + 1} / {searchMatches.length}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={goToPreviousSearchMatch}
                                disabled={searchMatches.length === 0}
                                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label="Previous match"
                              >
                                <ChevronUpIcon />
                              </button>
                              <button
                                type="button"
                                onClick={goToNextSearchMatch}
                                disabled={searchMatches.length === 0}
                                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label="Next match"
                              >
                                <ChevronDownIcon />
                              </button>
                              <button
                                type="button"
                                onClick={closeSearch}
                                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
                                aria-label="Close search"
                              >
                                <XIcon />
                              </button>
                            </>
                          )}
                        </motion.div>
                        {searchQuery.trim() && searchGroups.length > 0 && (
                          <div className="absolute left-0 top-full z-20 mt-1 w-72 max-h-52 overflow-y-auto chat-scrollbar rounded-lg border border-neutral-800 bg-neutral-950/95 py-1 shadow-xl">
                            {searchGroups.map((group) => (
                              <div key={group.conversationId} className="py-0.5">
                                <button
                                  type="button"
                                  onClick={() => selectSearchGroup(group.conversationId)}
                                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1 text-left transition-colors hover:bg-neutral-800/70"
                                >
                                  <span className="truncate text-[12px] font-medium text-neutral-200">
                                    {group.conversationTitle}
                                  </span>
                                  <span className="flex-shrink-0 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                                    {group.matches.length} match{group.matches.length === 1 ? '' : 'es'}
                                  </span>
                                </button>
                                {group.matches.slice(0, 3).map((match) => (
                                  <button
                                    key={match.messageId}
                                    type="button"
                                    onClick={() => selectSearchMatch(match)}
                                    className={`flex w-full items-center gap-2 px-4 py-1 text-left transition-colors hover:bg-neutral-800/70 ${
                                      searchMatches.indexOf(match) === activeSearchMatchIndex
                                        ? 'bg-neutral-800/70'
                                        : ''
                                    }`}
                                  >
                                    <span
                                      className={`flex-shrink-0 text-[10px] uppercase tracking-[0.1em] ${
                                        match.role === 'user' ? 'text-neutral-500' : 'text-neutral-600'
                                      }`}
                                    >
                                      {match.role === 'user' ? 'You' : 'AI'}
                                    </span>
                                    <span className="truncate text-[12px] text-neutral-400">{match.snippet}</span>
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                        {(() => {
                        const stats = contextStats
                        if (!stats || stats.maxTokens <= 0) return null
                        const radius = 11
                        const circumference = 2 * Math.PI * radius
                        const fillPercent = Math.min(stats.totalTokens / stats.maxTokens, 1)
                        const dashOffset = circumference * (1 - fillPercent)
                        let progressClass = 'stroke-white/50'
                        if (fillPercent > 0.95) progressClass = 'stroke-red-500/80'
                        else if (fillPercent > 0.8) progressClass = 'stroke-amber-500/80'
                        return (
                          <div className="relative group">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 cursor-default">
                              <svg width="20" height="20" viewBox="0 0 28 28" className="-rotate-90">
                                <circle cx="14" cy="14" r={radius} fill="none" className="stroke-white/10" strokeWidth="2" />
                                <circle cx="14" cy="14" r={radius} fill="none" className={progressClass} strokeWidth="2"
                                  strokeDasharray={circumference} strokeDashoffset={dashOffset}
                                  strokeLinecap="round" />
                              </svg>
                            </div>
                            <div className="absolute right-0 top-full mt-1 z-50 min-w-[240px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150">
                              <div className="rounded-xl border border-white/10 bg-neutral-900 p-3 shadow-lg">
                                <div className="mb-2">
                                  <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
                                    <span>{formatTokenCount(stats.totalTokens)} / {formatTokenCount(stats.maxTokens)} tokens used</span>
                                    <span>{Math.round(fillPercent * 100)}%</span>
                                  </div>
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                    <div className="h-full rounded-full bg-white/40 transition-all" style={{ width: `${Math.round(fillPercent * 100)}%` }} />
                                  </div>
                                </div>
                                <div className="space-y-0.5 text-[11px] text-neutral-400">
                                  <p className="font-medium text-neutral-300">{CHAT_MODEL_OPTIONS.find(m => m.id === chatModel)?.label ?? chatModel}</p>
                                  <p>Cost: {formatCurrency(stats.totalCost)}</p>
                                  <p>{stats.messageCount} messages &middot; {'>'}{formatTokenCount(stats.totalInputTokens)}tk &middot; {formatTokenCount(stats.totalOutputTokens)}tk</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                      <button
                        ref={historyButtonRef}
                        type="button"
                        onClick={() => setIsHistoryOpen((open) => !open)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-neutral-300 transition-colors hover:border-white/20 hover:bg-white/10"
                        aria-label="Open conversation history"
                      >
                        <MenuIcon />
                      </button>
                      <button
                        type="button"
                        onClick={handleToggleExpand}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                          isExpanded
                            ? 'border-white/20 bg-white/10 text-neutral-200'
                            : 'border-white/10 text-neutral-400 hover:border-white/20 hover:bg-white/10 hover:text-neutral-200'
                        }`}
                        aria-label={isExpanded ? 'Collapse window' : 'Expand window'}
                        aria-pressed={isExpanded}
                      >
                        <ExpandIcon />
                      </button>
                    </div>

                    <AnimatePresence>
                      {isHistoryOpen && (
                        <motion.div
                          key="history-menu"
                          ref={historyMenuRef}
                          initial={{ opacity: 0, y: -8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 top-10 z-20 w-72 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/95 shadow-xl"
                        >
                          <div className="max-h-40 overflow-y-auto scrollbar-hidden py-1">
                            {conversations.length === 0 ? (
                              <p className="px-2.5 py-2 text-[11px] text-neutral-500">No conversations yet.</p>
                            ) : (
                              conversations.map((conversation) => (
                                <div
                                  key={conversation.id}
                                  className={`flex w-full items-center gap-1 px-2.5 py-1.5 text-[12px] transition-colors hover:bg-neutral-800/70 ${
                                    conversation.id === activeConversation?.id
                                      ? 'bg-neutral-800/70 text-neutral-100'
                                      : 'text-neutral-300'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveConversation(conversation)
                                      setIsChatOpen(true)
                                      setIsHistoryOpen(false)
                                    }}
                                    className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                                  >
                                    <span className="truncate font-medium">{conversation.title}</span>
                                    <span className="mt-0.5 flex items-center justify-between gap-2">
                                      <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                                        {conversation.messages.length} messages
                                      </span>
                                      <span className="flex-shrink-0 text-[10px] tabular-nums text-neutral-500">
                                        {formatConversationTimestamp(conversation.updatedAt)}
                                      </span>
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setDeletingConversation(conversation)
                                      setIsHistoryOpen(false)
                                    }}
                                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-red-500/20 hover:text-red-300"
                                    aria-label={`Delete ${conversation.title}`}
                                  >
                                    <TrashIcon />
                                  </button>
                                </div>
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
                    onCopy={(e) => {
                      const selection = window.getSelection()
                      if (!selection || selection.isCollapsed) return
                      const text = selection.toString()
                      if (!text) return
                      e.preventDefault()
                      e.clipboardData.setData('text/plain', text)
                    }}
                    className="mt-3 overflow-y-auto chat-scrollbar space-y-3 pr-2"
                    style={{ height: isExpanded ? 'calc(100vh - 210px)' : CHAT_SCROLL_HEIGHT, minHeight: CHAT_SCROLL_HEIGHT }}
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
                        const reasoningSteps = message.steps ?? []
                        const hasSteps = reasoningSteps.length > 0
                        const hasReasoningContent =
                          reasoningText.length > 0 ||
                          hasSteps ||
                          (message.reasoningTitle != null && message.reasoningTitle.trim().length > 0)
                        const showThinking =
                          isAssistant &&
                          (hasReasoningContent || (isStreaming && Boolean(thinkingOpenById[message.id])))
                        const isThinkingOpen = Boolean(thinkingOpenById[message.id])
                        const modelLabel = message.model?.trim()
                        const usageLabel = formatUsageSummary(message)
                        const metaLabel = [message.stopped ? 'Stopped' : null, modelLabel, usageLabel]
                          .filter(Boolean)
                          .join(` \u00b7 `)

                        return (
                          <div
                            key={message.id}
                            data-message-id={message.id}
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
                                    onClick={() => {
                                      setThinkingOpenById((previous) => {
                                        const timerId = reasoningAutoCloseTimersRef.current[message.id]
                                        if (timerId !== undefined) {
                                          window.clearTimeout(timerId)
                                          delete reasoningAutoCloseTimersRef.current[message.id]
                                        }
                                        return {
                                          ...previous,
                                          [message.id]: !isThinkingOpen
                                        }
                                      })
                                    }}
                                  >
                                    <span
                                      className={
                                        isStreaming
                                          ? 'chat-thinking-title chat-thinking-title--streaming'
                                          : 'chat-thinking-title'
                                      }
                                    >
                                      {message.reasoningTitle?.trim()
                                        ? message.reasoningTitle.trim()
                                        : 'Reasoning\u2026'}
                                    </span>
                                    <span
                                      className={
                                        `chat-thinking-chevron${isThinkingOpen ? ' chat-thinking-chevron--open' : ''}`
                                      }
                                    >
                                      <svg
                                        width="10"
                                        height="10"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="m9 18 6-6-6-6" />
                                      </svg>
                                    </span>
                                  </button>

                                  {isThinkingOpen && (
                                    <div className="chat-thinking-body">
                                      {hasSteps ? (
                                        reasoningSteps.map((step, stepIndex) => {
                                          if (step.type === 'reasoning') {
                                            const isLastStep = stepIndex === reasoningSteps.length - 1
                                            return (
                                              <p
                                                key={`reasoning-${stepIndex}`}
                                                className="chat-thinking-text whitespace-pre-wrap"
                                              >
                                                {step.text}
                                                {isStreaming && isLastStep ? (
                                                  <span className="chat-thinking-cursor">|</span>
                                                ) : null}
                                              </p>
                                            )
                                          }
                                          if (step.type === 'tool') {
                                            return <ToolStepRow key={step.id} step={step} />
                                          }
                                          return <WebSearchStepRow key={step.id} step={step} />
                                        })
                                      ) : reasoningText ? (
                                        <p className="chat-thinking-text whitespace-pre-wrap">
                                          {reasoningText}
                                          {isStreaming ? (
                                            <span className="chat-thinking-cursor">|</span>
                                          ) : null}
                                        </p>
                                      ) : (
                                        <p className="chat-thinking-empty">Reasoning not available.</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                               {isAssistant ? (
                                <>
                                  {message.sources && message.sources.length > 0 ? (
                                    <div className="chat-sources-wrapper">
                                      <button
                                        type="button"
                                        className="chat-sources-toggle"
                                        onClick={() =>
                                          setSourcesPanelMessageId(
                                            sourcesPanelMessageId === message.id ? null : message.id
                                          )
                                        }
                                      >
                                        <svg
                                          width="12"
                                          height="12"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          aria-hidden
                                        >
                                          <circle cx="11" cy="11" r="8" />
                                          <path d="m21 21-4.35-4.35" />
                                        </svg>
                                        <span>Sources</span>
                                        <span className="chat-sources-count">{message.sources.length}</span>
                                      </button>

                                      {sourcesPanelMessageId === message.id && (
                                        <div className="chat-sources-panel">
                                          <div className="chat-sources-panel-header">
                                            <span className="font-medium">Sources</span>
                                            <button
                                              type="button"
                                              className="chat-sources-panel-close"
                                              onClick={() => setSourcesPanelMessageId(null)}
                                              aria-label="Close sources"
                                            >
                                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M18 6 6 18M6 6l12 12" />
                                              </svg>
                                            </button>
                                          </div>
                                          <div className="chat-sources-panel-list">
                                            {message.sources.map((source, idx) => (
                                              <a
                                                key={`${source.url}-${idx}`}
                                                href={source.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="chat-source-item"
                                              >
                                                <Favicon url={source.url} className="chat-source-favicon" />
                                                <div className="chat-source-text">
                                                  <span className="chat-source-title">
                                                    {source.title || formatSourceUrl(source.url)}
                                                  </span>
                                                  <span className="chat-source-url">
                                                    {formatSourceUrl(source.url)}
                                                  </span>
                                                </div>
                                              </a>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                  <AssistantMarkdown content={message.content} />
                                  {collectExcalidrawCheckpoints(reasoningSteps).map((checkpoint) => (
                                    <ExcalidrawEmbed
                                      key={`${message.id}-${checkpoint.checkpointId}`}
                                      checkpointId={checkpoint.checkpointId}
                                      serverId={checkpoint.serverId}
                                    />
                                  ))}
                                </>
                              ) : (
                                <>
                                  {message.content}
                                  {message.images && message.images.length > 0 && (
                                    <div className="chat-message-meta flex items-center gap-1 mt-0.5">
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <circle cx="8.5" cy="8.5" r="1.5" />
                                        <polyline points="21 15 16 10 5 21" />
                                      </svg>
                                      <span>{message.images.length} image{message.images.length !== 1 ? 's' : ''}</span>
                                    </div>
                                  )}
                                </>
                              )}

                              {isAssistant ? (
                                <div className="chat-message-meta flex items-center gap-2">
                                  {metaLabel ? <span>{metaLabel}</span> : null}
                                  <CopyButton
                                    text={message.content}
                                    className="flex items-center justify-center h-6 w-6 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-white/10 transition-colors"
                                  />
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
              className={`relative flex items-center w-full rounded-2xl p-2 bg-gradient-to-br ${themeGradient} border border-white/10 transition-opacity duration-100 texture-surface ${
                mode === 'terminal' ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              style={{
                WebkitBackdropFilter: 'blur(40px)',
                backdropFilter: 'blur(40px)'
              }}
            >
            <AnimatePresence>
              {launcherVisible && (
                <LauncherResults
                  items={launcherDisplayItems}
                  selectedIndex={launcherSelectedIndex}
                  themeGradient={themeGradient}
                  onHover={setLauncherSelectedIndex}
                  onSelect={runLauncherItem}
                />
              )}
            </AnimatePresence>

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
                    const tab =
                      activePopup === 'appLauncher' ? 'appLauncher' :
                      activePopup === 'workflow' ? 'workflow' :
                      'preprompts'
                    if (window.api?.window.openSettings) {
                      window.api.window.openSettings(tab)
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
                  tasks={tasks}
                  onAddTask={handleAddTask}
                  onToggleTask={handleToggleTask}
                  onDeleteTask={handleDeleteTask}
                  onReorderTasks={handleReorderTasks}
                  onClearCompletedTasks={handleClearCompletedTasks}
                  gamification={gamification}
                  xpToast={xpToast}
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showImagePanel && attachedImages.length > 0 && (
                <motion.div
                  ref={imagePanelRef}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="texture-surface absolute bottom-full right-0 z-30 mb-3 w-[280px] rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900 to-neutral-950 p-3 shadow-xl shadow-black/40"
                  style={{ WebkitBackdropFilter: 'blur(30px)', backdropFilter: 'blur(30px)' }}
                >
                  <p className="px-2 pb-2 text-xs uppercase tracking-[0.12em] text-neutral-500">
                    Attachments ({attachedImages.length})
                  </p>
                  <div className="space-y-1.5 max-h-[240px] overflow-y-auto chat-scrollbar">
                    {attachedImages.map(img => (
                      <div key={img.id} className="flex items-center gap-3 rounded-xl p-2 border border-white/5 bg-white/[0.03]">
                        <img src={img.base64} className="h-10 w-10 rounded-lg object-cover border border-white/10 flex-shrink-0" alt={img.fileName} />
                        <span className="flex-1 text-sm text-neutral-300 truncate">{img.fileName}</span>
                        <button
                          onClick={() => setAttachedImages(prev => prev.filter(i => i.id !== img.id))}
                          className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-white/10 transition-colors"
                          aria-label={`Remove ${img.fileName}`}
                        >
                          <XIcon />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
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
                <div
                  ref={inputRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => {
                    const d = inputRef.current
                    if (!d) return
                    if ((d.textContent ?? '').length === 0 && d.childNodes.length > 0) {
                      d.innerHTML = ''
                    }
                    setQuery(d.textContent ?? '')
                  }}
                  onPaste={(e) => {
                    const items = e.clipboardData.items
                    let hasImage = false

                    for (let i = 0; i < items.length; i++) {
                      const item = items[i]
                      if (!SUPPORTED_IMAGE_TYPES.includes(item.type)) continue
                      e.preventDefault()
                      hasImage = true
                      if (attachedImages.length >= MAX_ATTACHED_IMAGES) continue
                      const blob = item.getAsFile()
                      if (!blob) continue
                      const reader = new FileReader()
                      const mimeType = item.type
                      const fileName = blob.name || 'Pasted image'
                      reader.onload = () => {
                        const base64 = reader.result as string
                        setAttachedImages(prev => {
                          if (prev.length >= MAX_ATTACHED_IMAGES) return prev
                          return [...prev, { id: crypto.randomUUID(), base64, fileName, mimeType }]
                        })
                      }
                      reader.readAsDataURL(blob)
                    }

                    if (hasImage) return

                    const text = e.clipboardData.getData('text/plain')
                    if (!text) return
                    e.preventDefault()
                    const lines = text.split('\n').length
                    if (lines <= 5 && text.length <= 300) {
                      document.execCommand('insertText', false, text)
                      const d = inputRef.current
                      if (d) setQuery(d.textContent ?? '')
                      return
                    }
                    const id = crypto.randomUUID()
                    pasteBlocksRef.current.set(id, text)
                    const chip = document.createElement('span')
                    chip.setAttribute('contenteditable', 'false')
                    chip.setAttribute('data-paste-id', id)
                    chip.className = 'inline-block bg-white/10 rounded-md px-2 py-0.5 text-sm border border-white/10 select-none cursor-default align-middle'
                    chip.textContent = `[Pasted ~${lines} lines]`
                    const selection = window.getSelection()
                    if (selection && selection.rangeCount > 0) {
                      const range = selection.getRangeAt(0)
                      range.deleteContents()
                      range.insertNode(chip)
                      const space = document.createTextNode('\u00A0')
                      chip.after(space)
                      range.setStartAfter(space)
                      range.collapse(true)
                      selection.removeAllRanges()
                      selection.addRange(range)
                    }
                    const d = inputRef.current
                    if (d) setQuery(d.textContent ?? '')
                  }}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={() => { isComposingRef.current = true }}
                  onCompositionEnd={() => { isComposingRef.current = false }}
                  data-placeholder="What can I help you with today?"
                  className="flex-1 bg-transparent text-lg text-neutral-100 placeholder:text-neutral-500 border-none focus:outline-none focus:ring-0 px-4 py-3 whitespace-pre overflow-hidden empty:before:content-[attr(data-placeholder)] empty:before:text-neutral-500"
                  style={{ caretColor: 'var(--chat-accent)' }}
                  spellCheck={false}
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
                        ? 'bg-neutral-700/60 border-white/[0.08] text-neutral-300 animate-pulse'
                        : 'bg-neutral-700/60 hover:bg-neutral-600/80 border-white/[0.08] text-neutral-300 hover:text-white'
                }`}
                aria-label={voiceState === 'recording' ? 'Stop recording' : 'Start voice recording'}
                disabled={voiceState === 'transcribing'}
              >
                {voiceState === 'recording' ? <StopIcon /> : voiceState === 'transcribing' ? <SpinnerIcon /> : <MicIcon />}
              </button>

              <div className="w-1" />

              {(isLoading || query.trim()) && (
                <button
                  onClick={() => void (isLoading ? handleCancel() : handleSubmit())}
                  disabled={!isLoading && !query.trim()}
                  className="flex items-center justify-center w-8 h-8 mr-1 rounded-lg bg-neutral-700/60 hover:bg-neutral-600/80 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-300 transition-all duration-150 border border-white/[0.08]"
                  aria-label={isLoading ? 'Stop generating' : 'Submit prompt'}
                >
                  {isLoading ? <StopIcon /> : <SendIcon />}
                </button>
              )}

              {attachedImages.length > 0 && (
                <button
                  ref={imageButtonRef}
                  onClick={(e) => { e.stopPropagation(); setShowImagePanel(v => !v) }}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150 border ${
                    showImagePanel
                      ? 'border-white/20 bg-white/10 text-neutral-200'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border-transparent hover:border-white/10'
                  }`}
                  aria-label={`${attachedImages.length} image(s) attached`}
                  aria-pressed={showImagePanel}
                >
                  <div className="relative">
                    <ImageIcon />
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white leading-none">
                      {attachedImages.length}
                    </span>
                  </div>
                </button>
              )}

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

                {buttonVisibility.tasks && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePopup('tasks')
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-150"
                    aria-label="Tasks"
                    aria-pressed={activePopup === 'tasks'}
                  >
                    <TasksIcon />
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
          className="absolute inset-x-0 bottom-5 z-20 pointer-events-auto flex justify-center"
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
            height: isExpanded ? 'calc(100vh - 160px)' : '400px',
            pointerEvents: mode === 'terminal' && visible ? 'auto' : 'none',
            transformOrigin: 'bottom center'
          }}
          aria-hidden={mode !== 'terminal' || !visible}
        >
          <div
            className={`relative flex h-full w-[750px] max-w-full flex-col overflow-hidden rounded-2xl p-2 bg-gradient-to-br ${themeGradient} border border-white/10 texture-surface`}
            style={{
              WebkitBackdropFilter: 'blur(40px)',
              backdropFilter: 'blur(40px)'
            }}
          >
            <div className="min-h-0 flex-1">
              <TerminalView
                active={mode === 'terminal' && visible && isAppVisible}
                fontFamily={terminalFont}
                isExpanded={isExpanded}
                isPinned={isPinned}
                isLight={getThemeMode(themeGradient) === 'light'}
                onTogglePin={handleTogglePin}
                onToggleExpand={handleToggleExpand}
              />
            </div>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {deletingConversation && (
          <ConfirmDeleteModal
            title="Delete conversation"
            message={`Are you sure you want to delete "${deletingConversation.title}"? This cannot be undone.`}
            withBackdrop={false}
            onConfirm={() => {
              void handleDeleteConversation()
            }}
            onCancel={() => setDeletingConversation(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOnboarding && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
            >
              <h2 className="text-lg font-semibold text-neutral-100">Welcome to Covenant</h2>
              <p className="mt-2 text-sm text-neutral-400">
                A floating command bar for AI chat, terminal, and workflows. Press{' '}
                <span className="text-neutral-200">Alt+Space</span> to open it.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-neutral-400">
                <li>
                  <span className="text-neutral-200">Tab</span> — switch between AI chat and terminal
                </li>
                <li>
                  <span className="text-neutral-200">Ctrl+Tab</span> — open conversation history
                </li>
                <li>
                  <span className="text-neutral-200">Escape</span> — close the bar
                </li>
              </ul>
              <div className="mt-5">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                  OpenAI API key <span className="normal-case text-neutral-500">(optional)</span>
                </label>
                <input
                  type="password"
                  value={onboardingApiKey}
                  onChange={(event) => setOnboardingApiKey(event.target.value)}
                  placeholder="sk-..."
                  autoComplete="off"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                />
                <p className="mt-2 text-xs text-neutral-500">
                  You can also add this later in Settings. The key never leaves this device.
                </p>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    window.api?.config.markOnboarded?.()
                    setShowOnboarding(false)
                  }}
                  className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={handleCompleteOnboarding}
                  className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
                >
                  Get started
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
