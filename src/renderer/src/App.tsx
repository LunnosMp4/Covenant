import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, type CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ModulePopup, { type ActivePopup, type PopupItem } from './launcher/ModulePopup'
import LauncherResults from './launcher/LauncherResults'
import InstructionPicker from './launcher/InstructionPicker'
import TerminalView from './terminal/TerminalView'
import TerminalApprovalModal from './terminal/TerminalApprovalModal'
import VoiceWaveform from './chat/VoiceWaveform'
import ConfirmDeleteModal from './ui/ConfirmDeleteModal'
import ChatTranscript from './chat/ChatTranscript'
import { buildTerminalContext } from './terminal/terminalContext'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CodeIcon,
  ImageIcon,
  MenuIcon,
  MicIcon,
  NotesIcon,
  PinIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  SpinnerIcon,
  StopIcon,
  TasksIcon,
  TrashIcon,
  XIcon
} from './ui/icons'
import ExpandButton from './ui/ExpandButton'
import { createId } from './utils/helpers'
import MeasuredPanel from './ui/MeasuredPanel'
import { TERMINAL_SPRING, WINDOW_SPRING } from './constants/motion'
import { rankLauncherItems } from './utils/launcher/fuzzy'
import {
  filterInstructionMentions,
  parseMentionTrigger
} from './app/utils/instructionMentions'
import {
  computeContextStats,
  formatConversationTimestamp
} from './utils/chat/chatUsage'
import { DEFAULT_TERMINAL_FONT, normalizeTerminalFont } from './constants/terminalFonts'
import {
  DEFAULT_THEME_GRADIENT,
  getThemeCssVars,
  getThemeMode,
  normalizeThemeGradient
} from './constants/theme'
import { applyThemeToDocument } from './utils/themeDom'
import type { ButtonVisibility, ReasoningEffort } from '../../shared/config'
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_TEXTURE_INTENSITY,
  TEXTURE_MAX_OPACITY
} from '../../shared/config'
import type { UpdateStatus } from '../../shared/system/update'
import type { TerminalApprovalRequest } from '../../shared/terminal/terminal'
import type {
  ChatConversation,
  ChatMessage,
  ChatRole,
  ChatStreamEvent,
  InputContent,
  ReasoningStep
} from '../../shared/chat/chat'
import type { InstalledApp, LauncherItem } from '../../shared/launcher/launcher'
import type { Preprompt } from './types/renderer'
import type { Task } from './types/renderer'
import type { GamificationState, XpToastState } from './types/renderer'
import type {
  Workflow,
  WorkflowExecutionState,
  WorkflowLogPayload,
  WorkflowStatusUpdatePayload
} from './types/renderer'
import {
  DEFAULT_CONVERSATION_TITLE,
  MAX_CONVERSATION_TITLE_LENGTH,
  createConversationTitle,
  createCustomSystemPromptSelection,
  createSelectedSystemPrompt,
  normalizeMessageOrder,
  sortConversations
} from './app/utils/chat'
import { splitWorkflowLogLines } from './app/utils/workflow'
import {
  CHAT_SCROLL_HEIGHT,
  DEFAULT_GAMIFICATION_STATE,
  MAX_ATTACHED_IMAGES,
  MAX_WORKFLOW_LOG_LINES,
  SUPPORTED_IMAGE_TYPES
} from './app/constants'
import type { AppMode, AttachedImage, SelectedSystemPrompt, Surface } from './app/types'
import type { WindowView } from '../../shared/view'
import OnboardingModal from './app/components/OnboardingModal'
import ContextStatsDonut from './app/components/ContextStatsDonut'
import { useAttachments } from './app/hooks/useAttachments'
import { useVoiceInput } from './app/hooks/useVoiceInput'
import { useChatSearch } from './app/hooks/useChatSearch'
import { useWindowsClickThrough } from './app/hooks/useWindowsClickThrough'
import CodePanel from './code/CodePanel'
import CodePermissionModal from './code/CodePermissionModal'
import { useCodeSession } from './code/useCodeSession'
import PasteSurface from './paste/PasteSurface'
import NotesSurface from './notes/NotesSurface'
import { useMeetingRecorder } from './notes/useMeetingRecorder'

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
  // The single panel shown above the command bar: the chat conversation or the
  // OpenCode surface. `null` means bar-only. Global shortcuts target a view and
  // the renderer reports the current one so a repeat press closes the window.
  const [activeSurface, setActiveSurface] = useState<Surface | null>(null)
  const isChatOpen = activeSurface === 'chat'
  const isCodeOpen = activeSurface === 'code'
  const isNotesOpen = activeSurface === 'notes'
  const isFullSurface = activeSurface === 'paste' || activeSurface === 'notes'
  const setIsChatOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((value) => {
    setActiveSurface((current) => {
      const next =
        typeof value === 'function' ? value(current === 'chat') : value
      if (next) {
        return 'chat'
      }
      return current === 'chat' ? null : current
    })
  }, [])
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isWide, setIsWide] = useState(false)
  const [isAltHeld, setIsAltHeld] = useState(false)
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [barHeight, setBarHeight] = useState(0)
  const [mode, setMode] = useState<AppMode>('ai')
  const [hasInitializedTerminal, setHasInitializedTerminal] = useState(false)
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null)
  const [terminalApproval, setTerminalApproval] = useState<TerminalApprovalRequest | null>(null)
  const [themeGradient, setThemeGradient] = useState<string>(DEFAULT_THEME_GRADIENT)
  const [terminalFont, setTerminalFont] = useState<string>(DEFAULT_TERMINAL_FONT)
  const [thinkingOpenById, setThinkingOpenById] = useState<Record<string, boolean>>({})
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null)
  const [activeStreamMessageId, setActiveStreamMessageId] = useState<string | null>(null)
  const [activeStreamConversationId, setActiveStreamConversationId] = useState<string | null>(null)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([])
  const [launcherSelectedIndex, setLauncherSelectedIndex] = useState(0)
  const [launcherIcons, setLauncherIcons] = useState<Record<string, string>>({})
  const [launcherDismissed, setLauncherDismissed] = useState(false)
  const [instructionMention, setInstructionMention] = useState<{ query: string; start: number } | null>(null)
  const [instructionMentionDismissed, setInstructionMentionDismissed] = useState(false)
  const [instructionMentionIndex, setInstructionMentionIndex] = useState(0)
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
  const [buttonVisibility, setButtonVisibility] = useState<ButtonVisibility>({ workflow: true, tasks: true, notes: true, code: true })
  const [chatModel, setChatModel] = useState<string>(DEFAULT_CHAT_MODEL)
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT)
  const [autoCollapseReasoning, setAutoCollapseReasoning] = useState(true)
  const [textureIntensity, setTextureIntensity] = useState(DEFAULT_TEXTURE_INTENSITY)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const updateBannerVisible =
    updateStatus !== null &&
    (updateStatus.state === 'available' ||
      updateStatus.state === 'downloading' ||
      updateStatus.state === 'downloaded')
  const [updateBannerHeight, setUpdateBannerHeight] = useState(0)
  const [isPinned, setIsPinned] = useState(false)
  const [sourcesPanelMessageId, setSourcesPanelMessageId] = useState<string | null>(null)
  const [deletingConversation, setDeletingConversation] = useState<ChatConversation | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingApiKey, setOnboardingApiKey] = useState('')
  // Prompt handed off from the Paste Manager; consumed once the window is shown.
  const [pendingExternalPrompt, setPendingExternalPrompt] = useState<string | null>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const updateBannerRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const pasteBlocksRef = useRef<Map<string, string>>(new Map())
  const isComposingRef = useRef(false)
  const popupRef = useRef<HTMLDivElement>(null)
  const moduleButtonsRef = useRef<HTMLDivElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const terminalRailRef = useRef<HTMLDivElement>(null)
  const historyMenuRef = useRef<HTMLDivElement>(null)
  const historyButtonRef = useRef<HTMLButtonElement>(null)
  const successResetTimersRef = useRef<Record<string, number>>({})
  const activeConversationRef = useRef<ChatConversation | null>(null)
  // Remembers the conversation shown before entering terminal mode so leaving
  // the terminal returns the user to their previous AI thread.
  const lastNonTerminalConversationRef = useRef<ChatConversation | null>(null)
  const conversationsRef = useRef<ChatConversation[]>([])
  const streamBufferRef = useRef<{ content: string; reasoning: string } | null>(null)
  const activeStreamIdRef = useRef<string | null>(null)
  const activeStreamMessageIdRef = useRef<string | null>(null)
  const activeStreamConversationIdRef = useRef<string | null>(null)
  // Forces the next submit to start a brand-new conversation (paste manager AI actions).
  const forceNewConversationRef = useRef(false)
  const reasoningAutoCloseTimersRef = useRef<Record<string, number>>({})
  // Remembers the last auto-scroll target so streamed token growth can scroll
  // without restarting the smooth-scroll animation on every delta.
  const lastAutoScrollRef = useRef<{ conversationId: string; messageCount: number } | null>(null)
  const autoCollapseReasoningRef = useRef(autoCollapseReasoning)
  // When false, the visible surfaces stay at their entry (hidden) state until the
  // native window has actually been shown by the main process.
  const [enterReady, setEnterReady] = useState(false)

  // Apply a requested view coming from the main process (global shortcut or a
  // window show). `terminal` and `tasks` map onto the existing mode/popup state;
  // `chat`/`code` onto the surface; `bar` is the bare, new-conversation bar.
  const applyView = useCallback((view: WindowView): void => {
    if (view === 'terminal') {
      const current = activeConversationRef.current
      if (current && !current.terminalSessionId) {
        lastNonTerminalConversationRef.current = current
      }
      setHasInitializedTerminal(true)
      setMode('terminal')
      setActivePopup(null)
      return
    }

    setMode('ai')
    setActivePopup(null)

    if (view === 'chat') {
      // Resume the last conversation: the one already active, or the most
      // recent from history (the list is sorted newest-first).
      const last = activeConversationRef.current ?? conversationsRef.current[0] ?? null
      if (last) setActiveConversation(last)
      setActiveSurface('chat')
    } else if (view === 'code') {
      setActiveSurface('code')
    } else if (view === 'paste') {
      setActiveSurface('paste')
    } else if (view === 'notes') {
      setActiveSurface('notes')
      setIsExpanded(true)
      setIsWide(true)
    } else if (view === 'tasks') {
      setActiveSurface(null)
      setActivePopup('tasks')
    } else {
      // 'bar' (and the transient 'popup' sentinel) collapse to the bare bar.
      setActiveSurface(null)
    }
  }, [])

  // The single surface currently shown, reported to main so global shortcuts can
  // distinguish "same view → close" from "different view → switch".
  const currentView = useMemo<WindowView>(() => {
    if (mode === 'terminal') return 'terminal'
    if (activePopup === 'tasks') return 'tasks'
    if (activePopup) return 'popup'
    if (activeSurface === 'chat') return 'chat'
    if (activeSurface === 'code') return 'code'
    if (activeSurface === 'paste') return 'paste'
    if (activeSurface === 'notes') return 'notes'
    return 'bar'
  }, [mode, activePopup, activeSurface])

  useEffect(() => {
    window.api?.window.reportView?.(currentView)
  }, [currentView])

  const {
    attachedImages,
    setAttachedImages,
    showImagePanel,
    setShowImagePanel,
    imagePanelRef,
    imageButtonRef
  } = useAttachments()
  const { voiceState, micStreamRef, toggleRecording } = useVoiceInput(inputRef, setQuery)
  const {
    searchOpen,
    searchQuery,
    setSearchQuery,
    activeSearchMatchIndex,
    setActiveSearchMatchIndex,
    searchMatches,
    searchGroups,
    searchInputRef,
    closeSearch,
    openSearch,
    toggleSearch,
    goToNextSearchMatch,
    goToPreviousSearchMatch,
    selectSearchMatch,
    selectSearchGroup
  } = useChatSearch({
    conversations,
    activeConversation,
    setActiveConversation,
    isChatOpen,
    chatScrollRef,
    setIsChatOpen,
    setIsHistoryOpen,
    setActivePopup
  })
  const code = useCodeSession()
  const meeting = useMeetingRecorder()

  function getFullPrompt(): string {
    const div = inputRef.current
    if (!div) return ''
    let result = ''
    for (const node of div.childNodes) {
      if (node instanceof HTMLElement && node.hasAttribute('data-instruction-id')) {
        continue
      }
      if (node instanceof HTMLElement && node.hasAttribute('data-paste-id')) {
        const id = node.getAttribute('data-paste-id')!
        result += pasteBlocksRef.current.get(id) ?? node.textContent ?? ''
      } else {
        result += node.textContent ?? ''
      }
    }
    return result
  }

  function getEditableText(): string {
    const div = inputRef.current
    if (!div) return ''
    let result = ''
    for (const node of div.childNodes) {
      if (node instanceof HTMLElement && node.hasAttribute('data-instruction-id')) {
        continue
      }
      result += node.textContent ?? ''
    }
    return result
  }

  function getCaretTextContext(): { node: Text; textBefore: string; offset: number } | null {
    const div = inputRef.current
    const selection = window.getSelection()
    if (!div || !selection || selection.rangeCount === 0) return null

    const range = selection.getRangeAt(0)
    if (!range.collapsed || !div.contains(range.startContainer)) return null

    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) return null

    const textNode = node as Text
    return {
      node: textNode,
      textBefore: textNode.data.slice(0, range.startOffset),
      offset: range.startOffset
    }
  }

  function clearInput(): void {
    const div = inputRef.current
    if (div) {
      div.textContent = ''
    }
    pasteBlocksRef.current.clear()
    setAttachedImages([])
    setShowImagePanel(false)
    setInstructionMention(null)
    setInstructionMentionDismissed(false)
    setQuery('')
  }

  function setInputText(text: string): void {
    const div = inputRef.current
    if (div) {
      div.textContent = text
    }
    pasteBlocksRef.current.clear()
    setAttachedImages([])
    setShowImagePanel(false)
    setInstructionMention(null)
    setInstructionMentionDismissed(false)
    setQuery(text)
  }

  const syncInstructionMention = useCallback((): void => {
    if (mode !== 'ai' || isCodeOpen || isComposingRef.current) {
      setInstructionMention((previous) => (previous === null ? previous : null))
      return
    }

    const context = getCaretTextContext()
    const trigger = context ? parseMentionTrigger(context.textBefore) : null

    setInstructionMention((previous) => {
      if (!trigger) return previous === null ? previous : null
      if (previous && previous.start === trigger.start && previous.query === trigger.query) {
        return previous
      }
      return trigger
    })
  }, [isCodeOpen, mode])

  useEffect(() => {
    setInstructionMentionIndex(0)
    setInstructionMentionDismissed(false)
  }, [instructionMention?.query, instructionMention?.start])

  // When a Code message is restored, OpenCode hands the prompt back: prefill the
  // command bar so the user can review, edit, and resubmit it.
  useEffect(() => {
    if (code.restoreDraft == null) return
    setInputText(code.restoreDraft)
    code.clearRestoreDraft()
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [code.restoreDraft, code.clearRestoreDraft])

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
      const unsubscribe = window.api.window.onToggleVisibility((v, view, phase) => {
        if (v) {
          setIsAppVisible(true)
          setVisible(true)

          // Mount directly on the requested view (bar by default). Never
          // resurrect a previously shown surface.
          applyView(view ?? 'bar')

          if (phase === 'prepare') {
            // Hold every surface at its entry (hidden) state while the window is
            // still off-screen. The layout effect below confirms the prepared DOM
            // has committed so main can safely show the window.
            setEnterReady(false)
          } else {
            setEnterReady(true)
          }
        } else {
          setVisible(false)
          setIsPinned(false)
          window.api?.window.setPinned?.(false)
          // Heavy state is reset in the command bar's onExitComplete callback,
          // once the exit animation has actually finished.
        }
      })

      return () => {
        unsubscribe()
      }
    } else {
      // Dev/browser fallback — always visible.
      setVisible(true)
      setIsAppVisible(true)
      setEnterReady(true)
      return undefined
    }
  }, [applyView])

  // Global shortcut asked to switch to another view while the window is already
  // open (repeat press on the same view is handled in main as a close).
  useEffect(() => {
    if (!window.api?.window.onSetView) return undefined
    const unsubscribe = window.api.window.onSetView((view) => {
      applyView(view)
    })
    return () => {
      unsubscribe()
    }
  }, [applyView])

  // The native window keeps its full expanded size; the renderer measures the
  // viewport once so it can size the expanded content without resizing the
  // window (which would flash and jitter).
  useEffect(() => {
    const onResize = (): void => {
      setViewportHeight(window.innerHeight)
      setViewportWidth(window.innerWidth)
    }
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // The terminal surface stacks above the command bar, so track the bar's
  // height to offset it precisely. Re-run when `visible` changes because the
  // bar (and its ref) only exists while the window is shown. A layout effect
  // measures before paint so the terminal never flashes over the bar.
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const measure = (): void => {
      // offsetHeight includes the bar's padding; contentRect does not, which
      // would place the terminal 16px too low and overlap the bar.
      const height = bar.offsetHeight
      if (height > 0) {
        setBarHeight((previous) => (Math.abs(previous - height) < 1 ? previous : height))
      }
    }
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    measure()
    return () => observer.disconnect()
  }, [visible])

  // Measure the update notice so the terminal surface (which floats above the
  // bar) and the expanded surfaces can make room for it instead of overlapping.
  useLayoutEffect(() => {
    const banner = updateBannerRef.current
    if (!banner) {
      setUpdateBannerHeight(0)
      return
    }
    const measure = (): void => {
      const height = banner.offsetHeight
      setUpdateBannerHeight((previous) => (Math.abs(previous - height) < 1 ? previous : height))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(banner)
    measure()
    return () => observer.disconnect()
  }, [visible, updateBannerVisible])

  // Track whether Alt is held so the expand control can switch to the
  // horizontal expand/collapse variant.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Alt') setIsAltHeld(true)
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === 'Alt') setIsAltHeld(false)
    }
    const onBlur = (): void => setIsAltHeld(false)

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // The horizontal expand only makes sense for the surface currently shown, so
  // drop it when the mode or chat visibility changes. Notes opens fully
  // maximized (both axes, the same as Alt+1) because it needs the room.
  useEffect(() => {
    if (activeSurface === 'notes') {
      setIsExpanded(true)
      setIsWide(true)
      return
    }
    if (isChatOpen || activeSurface === null) setIsWide(false)
  }, [mode, isChatOpen, activeSurface])

  // Windows keeps the window interactive via a main-process cursor poll fed by
  // interactive surface rectangles; macOS still uses mouse forwarding.
  useWindowsClickThrough(visible)

  // macOS: make the reserved (empty) area of the oversized window click-through
  // so the desktop/apps behind stay usable, and re-enable mouse events over
  // content. Windows has its own path above (Electron's forwarding installs a
  // global low-level mouse hook on Windows).
  useEffect(() => {
    const platform = window.api?.platform
    if (platform !== 'darwin') return undefined

    let ignoring = false
    let pendingFrame: number | null = null
    let lastPointer: { x: number; y: number } | null = null
    const setIgnore = (next: boolean): void => {
      if (next === ignoring) return
      ignoring = next
      window.api?.window.setIgnoreMouseEvents?.(next)
    }

    const updateFromPointer = (): void => {
      pendingFrame = null
      const pointer = lastPointer
      if (!pointer) return
      // `elementFromPoint` forces a hit test and layout resolution, so it is
      // sampled at most once per frame instead of on every pointer event.
      const target = document.elementFromPoint(pointer.x, pointer.y)
      const overBackground =
        !target ||
        target === rootRef.current ||
        target === document.body ||
        target === document.documentElement
      setIgnore(overBackground)
    }

    const onMouseMove = (event: MouseEvent): void => {
      // Don't toggle mid-drag (text selection, etc.).
      if (event.buttons !== 0) return
      lastPointer = { x: event.clientX, y: event.clientY }
      if (pendingFrame !== null) return
      pendingFrame = window.requestAnimationFrame(updateFromPointer)
    }

    window.addEventListener('mousemove', onMouseMove)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      if (pendingFrame !== null) {
        window.cancelAnimationFrame(pendingFrame)
        pendingFrame = null
      }
      lastPointer = null
      window.api?.window.setIgnoreMouseEvents?.(false)
    }
  }, [visible])

  // Once the 'prepare' state has committed (surfaces mounted at their hidden
  // entry state), tell main it is safe to show the window. Using a layout
  // effect — not requestAnimationFrame — guarantees this runs even while the
  // window is still hidden and frame callbacks are throttled.
  useLayoutEffect(() => {
    if (visible && !enterReady) {
      window.api?.window.notifyReadyToShow?.()
    }
  }, [visible, enterReady])

  // Global shortcut: toggle the Code build/plan mode while the surface is open.
  useEffect(() => {
    if (!window.api?.window.onToggleCodeMode) return
    const unsubscribe = window.api.window.onToggleCodeMode(() => {
      if (activeSurface !== 'code') return
      code.toggleMode()
    })
    return () => {
      unsubscribe()
    }
  }, [activeSurface, code.toggleMode])

  // Lazy-load the OpenCode runtime / sessions the first time the surface opens.
  useEffect(() => {
    if (activeSurface === 'code') {
      void code.enable()
    }
  }, [activeSurface, code.enable])

  // Tell the main process that Code completions are "seen" while the Code
  // surface is actually visible, so the tray badge clears only after viewing.
  useEffect(() => {
    if (isCodeOpen && isAppVisible) {
      void window.api?.code?.ackActivity?.()
    }
  }, [isCodeOpen, isAppVisible])

  useEffect(() => {
    const api = window.api?.code
    if (!api?.onActivityStatus) return undefined
    const unsubscribe = api.onActivityStatus(() => {
      if (isCodeOpen && isAppVisible) {
        void api.ackActivity?.()
      }
    })
    return () => unsubscribe()
  }, [isCodeOpen, isAppVisible])

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
  }, [visible, mode, activeSurface])

  const toggleMode = useCallback(() => {
    const nextMode: AppMode = mode === 'ai' ? 'terminal' : 'ai'
    if (nextMode === 'terminal') {
      const current = activeConversationRef.current
      if (current && !current.terminalSessionId) {
        lastNonTerminalConversationRef.current = current
      }
      setHasInitializedTerminal(true)
    } else {
      const restore = lastNonTerminalConversationRef.current
      if (restore) setActiveConversation(restore)
    }

    setMode(nextMode)
    setActivePopup(null)
  }, [mode])

  const switchToAiMode = useCallback(() => {
    const restore = lastNonTerminalConversationRef.current
    if (restore) setActiveConversation(restore)
    setMode('ai')
    setActivePopup(null)
  }, [])

  const focusTerminalComposer = useCallback(() => {
    setIsExpanded(true)
    setIsWide(true)
    window.setTimeout(() => inputRef.current?.focus(), 40)
  }, [])

  const handleTogglePin = useCallback(() => {
    setIsPinned((prev) => {
      const next = !prev
      window.api?.window.setPinned?.(next)
      return next
    })
  }, [])

  const handleToggleExpand = useCallback(
    (event?: React.MouseEvent<HTMLButtonElement>) => {
      if (event?.altKey) {
        // Alt expands both axes directly from the small view, then toggles the
        // horizontal expansion once already expanded.
        if (!isExpanded) {
          setIsExpanded(true)
          setIsWide(true)
          return
        }
        setIsWide((prev) => !prev)
        return
      }
      setIsExpanded((prev) => {
        if (prev) setIsWide(false)
        return !prev
      })
    },
    [isExpanded]
  )

  // Keyboard equivalent of Alt+clicking the expand control: the first press
  // grows the surface to the full window (both axes), the next returns to the
  // small size.
  const toggleFullSize = useCallback(() => {
    const next = !(isExpanded && isWide)
    setIsExpanded(next)
    setIsWide(next)
  }, [isExpanded, isWide])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      // Compare the physical key so Option+1 (¡ on macOS) still works, and
      // accept the numpad variant too.
      if (event.code !== 'Digit1' && event.code !== 'Numpad1') return
      // Only meaningful while a surface (chat/code/paste) or the terminal is
      // actually open.
      if (mode !== 'terminal' && activeSurface === null) return
      event.preventDefault()
      event.stopPropagation()
      toggleFullSize()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [toggleFullSize, mode, activeSurface])

  const handleClose = useCallback(() => {
    setActivePopup(null)
    setMode('ai')
    setVisible(false)
    setIsPinned(false)
    window.api?.window.setPinned?.(false)
    // Ask main to hide; it waits for our exit animation to finish before
    // actually hiding the native window.
    window.api?.window.hideWindow()
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

  useEffect(() => {
    if (!visible) return
    void loadPreprompts()
  }, [visible, loadPreprompts])

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
    conversationsRef.current = conversations
  }, [conversations])

  // Swap the active conversation to the one linked with the focused terminal
  // session. New tabs therefore get a fresh thread; returning to a tab reloads
  // its previous thread.
  useEffect(() => {
    if (mode !== 'terminal' || !terminalSessionId) return
    const linked =
      conversationsRef.current.find(
        (conversation) => conversation.terminalSessionId === terminalSessionId
      ) ?? null
    setActiveConversation(linked)
    setActiveStreamId(null)
    setActiveStreamMessageId(null)
    setActiveStreamConversationId(null)
    setSourcesPanelMessageId(null)
  }, [mode, terminalSessionId])

  // Approval requests come from the main process when the assistant wants to
  // run a command in the linked terminal.
  useEffect(() => {
    const terminalApi = window.api?.terminal
    if (!terminalApi?.onApprovalRequest) return
    const unsubscribe = terminalApi.onApprovalRequest((request) => {
      setTerminalApproval(request)
    })
    return () => unsubscribe()
  }, [])

  const handleTerminalApprovalReply = useCallback(
    (reply: 'once' | 'always' | 'reject') => {
      const request = terminalApproval
      if (!request) return
      setTerminalApproval(null)
      void window.api?.terminal.replyApproval(request.requestId, reply)
    },
    [terminalApproval]
  )

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
    if (!isChatOpen || !autoScrollEnabled) {
      lastAutoScrollRef.current = null
      return
    }

    const conversationId = activeConversation?.id ?? ''
    const messageCount = activeConversation?.messages.length ?? 0
    const previous = lastAutoScrollRef.current
    // A new conversation, a new message or the panel opening animates; plain
    // token growth inside the last message jumps instantly so the smooth-scroll
    // animation is not restarted on every streaming delta.
    const isDiscrete =
      previous === null || previous.conversationId !== conversationId || previous.messageCount !== messageCount
    lastAutoScrollRef.current = { conversationId, messageCount }

    const frame = window.requestAnimationFrame(() => {
      const scrollElement = chatScrollRef.current
      if (!scrollElement) return
      scrollElement.scrollTo({
        top: scrollElement.scrollHeight,
        behavior: isDiscrete ? 'smooth' : 'auto'
      })
    })

    return () => {
      window.cancelAnimationFrame(frame)
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

    if (activePopup === 'workflow') {
      void loadWorkflows()
      return
    }

    if (activePopup === 'tasks') {
      void loadTasks()
      void loadGamification()
    }
  }, [activePopup, loadPreprompts, loadTasks, loadWorkflows, loadGamification])

  useEffect(() => {
    // Scanning the Start Menu / Store app list is expensive on Windows. Only
    // do it once the command bar is actually shown, instead of during login.
    if (!visible) return
    void loadInstalledApps()
  }, [visible, loadInstalledApps])

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

        // Streaming deltas only replace one message; the array order is already
        // established, so avoid copying + re-sorting every message per token.
        const index = current.messages.findIndex((message) => message.id === messageId)
        if (index === -1) return current

        const nextMessages = current.messages.slice()
        nextMessages[index] = updater(current.messages[index])

        return {
          ...current,
          messages: nextMessages
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
        } else if ((event.toolType === 'mcp' || event.toolType === 'terminal') && event.itemId) {
          const toolItemId = event.itemId
          const terminalLabels: Record<string, string> = {
            terminal_run: 'Terminal › run',
            terminal_read: 'Terminal › read',
            terminal_get_state: 'Terminal › state'
          }
          const toolName =
            event.toolType === 'terminal'
              ? terminalLabels[event.toolName ?? ''] ?? 'Terminal'
              : event.toolName ?? event.query ?? 'MCP tool'
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
            delete reasoningAutoCloseTimersRef.current[messageId]
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

  const handleToggleThinking = useCallback((messageId: string) => {
    const timerId = reasoningAutoCloseTimersRef.current[messageId]
    if (timerId !== undefined) {
      window.clearTimeout(timerId)
      delete reasoningAutoCloseTimersRef.current[messageId]
    }
    setThinkingOpenById((previous) => ({
      ...previous,
      [messageId]: !previous[messageId]
    }))
  }, [])

  const handleToggleSources = useCallback((messageId: string) => {
    setSourcesPanelMessageId((previous) => (previous === messageId ? null : messageId))
  }, [])

  const handleSubmit = useCallback(async () => {
    const rawPrompt = getFullPrompt().trim()
    if (!rawPrompt || isLoading) return

    const now = Date.now()
    const activeSystemPrompt = selectedSystemPrompt?.content.trim() || activeConversation?.systemPrompt?.trim() || ''

    const terminalLinkedSessionId = mode === 'terminal' ? terminalSessionId : null
    const isTerminalLinked = Boolean(terminalLinkedSessionId)
    const activeMatchesLink =
      !isTerminalLinked || activeConversation?.terminalSessionId === terminalLinkedSessionId

    const shouldStartNewConversation =
      forceNewConversationRef.current || (isTerminalLinked ? !activeMatchesLink : !isChatOpen)
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
        systemPrompt: activeSystemPrompt || undefined,
        terminalSessionId: isTerminalLinked ? terminalLinkedSessionId ?? undefined : undefined
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
    if (mode !== 'terminal') {
      setIsChatOpen(true)
    }
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

      let terminalContextPreamble = ''
      if (isTerminalLinked && terminalLinkedSessionId && window.api?.terminal) {
        try {
          const [stateResult, outputResult] = await Promise.all([
            window.api.terminal.getState(terminalLinkedSessionId),
            window.api.terminal.read(terminalLinkedSessionId, 120)
          ])
          terminalContextPreamble = buildTerminalContext(
            stateResult.success ? stateResult.state : null,
            outputResult.success ? outputResult.output : ''
          )
        } catch {
          // Continue without terminal context if the session vanished.
        }
      }

      const requestMessages: Array<{ role: ChatRole; content: string | InputContent[] }> = [
        ...(userConversation.systemPrompt
          ? [{ role: 'system' as const, content: userConversation.systemPrompt }]
          : []),
        ...(terminalContextPreamble
          ? [{ role: 'system' as const, content: terminalContextPreamble }]
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
        const streamResponse = await window.api.chat.askCovenantStream(requestMessages, {
          terminalSessionId:
            isTerminalLinked && terminalLinkedSessionId ? terminalLinkedSessionId : undefined
        })
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
    isChatOpen,
    terminalSessionId,
    selectedSystemPrompt,
    upsertConversation,
    persistConversation,
    generateConversationTitleAsync,
    attachedImages
  ])

  const handleCodeSubmit = useCallback(() => {
    const text = getFullPrompt().trim()
    if (!text) return
    clearInput()
    // Sending a prompt pins the window so the run isn't dismissed on blur.
    window.api?.window.setPinned?.(true)
    setIsPinned(true)
    void code.submit(text)
  }, [code])

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
    const input = inputRef.current
    if (input) {
      input.querySelectorAll('[data-instruction-id]').forEach((chip) => chip.remove())
      setQuery(getEditableText())
    }
    setCurrentSystemPrompt(null)
  }, [setCurrentSystemPrompt])

  const applyInstructionMention = useCallback(
    (item: Preprompt): void => {
      const input = inputRef.current
      const selection = window.getSelection()
      const context = getCaretTextContext()

      if (input && selection && context) {
        const trigger = parseMentionTrigger(context.textBefore)
        if (trigger) {
          const range = document.createRange()
          range.setStart(context.node, trigger.start)
          range.setEnd(context.node, context.offset)
          range.deleteContents()

          input.querySelectorAll('[data-instruction-id]').forEach((chip) => chip.remove())

          const chip = document.createElement('span')
          chip.setAttribute('contenteditable', 'false')
          chip.setAttribute('data-instruction-id', item.id)
          chip.className =
            'inline-flex select-none items-center rounded-md border border-[color:var(--chat-accent-strong)] bg-[color:var(--chat-accent-soft)] px-2 py-0.5 align-middle text-sm font-medium text-[color:var(--chat-accent)]'
          chip.textContent = `@${item.title}`

          range.insertNode(chip)
          const space = document.createTextNode('\u00A0')
          chip.after(space)

          const caret = document.createRange()
          caret.setStartAfter(space)
          caret.collapse(true)
          selection.removeAllRanges()
          selection.addRange(caret)
        }
      }

      setCurrentSystemPrompt({
        id: item.id,
        title: item.title,
        content: item.content
      })
      setQuery(getEditableText())
      setInstructionMention(null)
      setInstructionMentionDismissed(false)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    },
    [setCurrentSystemPrompt]
  )

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
      if (activePopup === 'workflow' && item.workflowData) {
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
      if (activePopup !== 'workflow') {
        setActivePopup(null)
      } else {
        if (mode === 'ai') {
          window.setTimeout(() => inputRef.current?.focus(), 40)
        }
      }
    },
    [activePopup, appendAssistantMessage, mode]
  )

  const instructionMentionItems = useMemo(
    () =>
      instructionMention
        ? filterInstructionMentions(preprompts, instructionMention.query)
        : [],
    [instructionMention, preprompts]
  )

  const instructionMentionVisible =
    mode === 'ai' &&
    !isCodeOpen &&
    !activePopup &&
    !instructionMentionDismissed &&
    instructionMention !== null &&
    (instructionMentionItems.length > 0 || preprompts.length === 0)

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
    !isCodeOpen &&
    !activePopup &&
    instructionMention === null &&
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
    setInstructionMentionIndex((current) =>
      Math.min(current, Math.max(instructionMentionItems.length - 1, 0))
    )
  }, [instructionMentionItems.length])

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
      if (instructionMentionVisible) {
        const mentionCount = instructionMentionItems.length

        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (mentionCount > 0) {
            setInstructionMentionIndex((current) => (current + 1) % mentionCount)
          }
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (mentionCount > 0) {
            setInstructionMentionIndex(
              (current) => (current - 1 + mentionCount) % mentionCount
            )
          }
          return
        }
        if (e.key === 'Tab') {
          e.preventDefault()
          e.stopPropagation()
          if (e.shiftKey) {
            if (mentionCount > 0) {
              setInstructionMentionIndex(
                (current) => (current - 1 + mentionCount) % mentionCount
              )
            }
            return
          }
          const selectedItem = instructionMentionItems[instructionMentionIndex]
          if (selectedItem) {
            applyInstructionMention(selectedItem)
          } else {
            setInstructionMentionDismissed(true)
          }
          return
        }
        if (e.key === 'Enter') {
          if (isComposingRef.current) return
          e.preventDefault()
          const selectedItem = instructionMentionItems[instructionMentionIndex]
          if (selectedItem) {
            applyInstructionMention(selectedItem)
          } else {
            setInstructionMentionDismissed(true)
          }
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          setInstructionMentionDismissed(true)
          return
        }
      }

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
        if (isCodeOpen) {
          handleCodeSubmit()
        } else {
          void handleSubmit()
        }
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return
        const range = selection.getRangeAt(0)
        if (!range.collapsed) return

        const node = e.key === 'Backspace'
          ? (range.startOffset === 0 ? range.startContainer.previousSibling : null)
          : range.startContainer.nextSibling

        if (!(node instanceof HTMLElement)) return

        if (node.hasAttribute('data-paste-id')) {
          e.preventDefault()
          const id = node.getAttribute('data-paste-id')!
          pasteBlocksRef.current.delete(id)
          node.remove()
          setQuery(getEditableText())
        } else if (node.hasAttribute('data-instruction-id')) {
          e.preventDefault()
          node.remove()
          clearCurrentSystemPrompt()
          setQuery(getEditableText())
        }
      }
    },
    [
      activePopup,
      applyInstructionMention,
      clearCurrentSystemPrompt,
      showImagePanel,
      handleClose,
      handleSubmit,
      handleCodeSubmit,
      instructionMentionIndex,
      instructionMentionItems,
      instructionMentionVisible,
      isCodeOpen,
      launcherVisible,
      launcherResults,
      launcherSelectedIndex,
      runLauncherItem
    ]
  )


  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return

      if (activePopup) {
        setActivePopup(null)
        return
      }

      if (activeSurface !== null) {
        return
      }

      handleClose()
    },
    [activePopup, handleClose, activeSurface]
  )


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
      // Keys typed inside the embedded terminal assistant must not trigger the
      // terminal's global mode/pane shortcuts.
      const origin = event.target as HTMLElement | null
      if (origin?.closest?.('.terminal-rail')) {
        return
      }
      // Notes has its own inputs, toolbar and keyboard handling. Don't let the
      // command bar's Tab/search shortcuts hijack typing inside a note.
      if (activeSurface === 'notes') {
        return
      }
      // Let the instruction picker consume Tab (it applies the highlighted
      // instruction) instead of toggling AI/terminal mode.
      if (instructionMention !== null && !instructionMentionDismissed && event.key === 'Tab') {
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

      if (
        mode === 'terminal' &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === 'i' || event.key === 'I')
      ) {
        event.preventDefault()
        event.stopPropagation()
        focusTerminalComposer()
        return
      }

      if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        const target = event.target as HTMLElement | null
        if (mode === 'terminal' && target?.closest?.('.terminal-surface')) {
          return
        }
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
    [
      activeConversation,
      activePopup,
      activeSurface,
      conversations,
      focusTerminalComposer,
      instructionMention,
      instructionMentionDismissed,
      isChatOpen,
      mode,
      switchToAiMode,
      toggleMode,
      openSearch
    ]
  )

  const chatMessages = useMemo(
    () => (activeConversation ? normalizeMessageOrder(activeConversation.messages) : []),
    [activeConversation]
  )

  useEffect(() => {
    if (mode !== 'terminal') return
    const el = terminalRailRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [mode, chatMessages, isLoading])


  const themeStyles = useMemo<CSSProperties>(
    () => getThemeCssVars(themeGradient) as CSSProperties,
    [themeGradient]
  )

  // Apply to the document root so portaled modals (which render into
  // document.body) inherit the same accent, chat and neutral tokens.
  useLayoutEffect(() => {
    applyThemeToDocument(themeGradient)
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

  const wideWidth = Math.max(750, viewportWidth - 80)
  const barBusy = isCodeOpen ? code.stream.busy : isLoading
  // Space taken by the update notice, including its gap below. Surfaces make
  // room for it so the bottom-anchored stack never overflows the window.
  const updateBannerOffset = updateBannerVisible ? updateBannerHeight + 8 : 0
  // Keep the terminal surface on exactly the same height rhythm as chat/code:
  // same body height (CHAT_SCROLL_HEIGHT / viewport-based when expanded) plus
  // the same header+padding allowance. This prevents the terminal from growing
  // taller than the other surfaces and cropping at the top when maximized.
  const surfaceBodyHeight = isExpanded
    ? Math.max(CHAT_SCROLL_HEIGHT, viewportHeight - 210 - updateBannerOffset)
    : CHAT_SCROLL_HEIGHT
  const terminalSurfaceHeight = surfaceBodyHeight + 80
  // Full-bleed surfaces (paste/notes) get the same header allowance as the
  // terminal so their search/filter/list stack has room while matching the
  // other surfaces.
  const fullSurfaceHeight = surfaceBodyHeight + 80
  // Notes gets extra vertical room compared to chat/code when maximized: the
  // command bar is hidden for full surfaces, so use nearly the whole viewport.
  const notesSurfaceHeight = isExpanded
    ? Math.max(fullSurfaceHeight, viewportHeight - 80 - updateBannerOffset)
    : fullSurfaceHeight

  return (
    <div
      ref={rootRef}
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
      <AnimatePresence
        onExitComplete={() => {
          setIsAppVisible(false)
          clearInput()
          setIsExpanded(false)
          setIsWide(false)
          setIsAltHeld(false)
          setIsLoading(false)
          setActiveSurface(null)
          setIsHistoryOpen(false)
          setMode('ai')
          setActivePopup(null)
          window.api?.window.notifyExitComplete?.()
        }}
      >
        {visible && (
          <motion.div
            key="command-bar"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={enterReady ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 24, scale: 0.97 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={WINDOW_SPRING}
            className="relative flex flex-col w-full max-w-full items-center pointer-events-none"
            style={themeStyles}
          >
            <AnimatePresence>
              {updateBannerVisible && updateStatus && (
                <motion.div
                  key="update-notice"
                  ref={updateBannerRef}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="surface-shadow pointer-events-auto mb-2 flex max-w-full items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/95 px-4 py-3"
                  data-interactive-surface
                  style={{ width: isWide && mode === 'ai' && activeSurface !== null ? wideWidth : 750 }}
                  aria-live="polite"
                >
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
                      className="flex-shrink-0 rounded-lg bg-[color:var(--chat-accent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--chat-on-accent)] transition-opacity hover:opacity-90"
                    >
                      {updateStatus.state === 'downloaded' ? 'Restart & install' : 'Download'}
                    </button>
                  ) : (
                    <span className="flex-shrink-0 text-xs tabular-nums text-neutral-400">
                      {typeof updateStatus.percent === 'number' ? `${Math.round(updateStatus.percent)}%` : '…'}
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {mode === 'ai' && activeSurface !== null && (
                <MeasuredPanel
                  key="surface-panel"
                  contentClassName={isFullSurface ? 'p-2' : 'p-4'}
                  className={`relative ${isFullSurface ? '' : 'mb-2'} rounded-2xl border border-white/10 bg-gradient-to-br ${themeGradient} command-surface texture-surface ${isFullSurface ? '' : 'surface-shadow'} pointer-events-auto`}
                  width={isWide ? wideWidth : 750}
                >
                  {isChatOpen ? (
                  <>
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTogglePin}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                          isPinned
                            ? 'border-[color:var(--chat-accent-strong)] bg-[color:var(--chat-accent-soft)] text-[color:var(--chat-accent)]'
                            : 'border-white/10 text-neutral-400 hover:border-white/20 hover:bg-white/10 hover:text-neutral-200'
                        }`}
                        aria-label={isPinned ? 'Unpin window' : 'Pin window'}
                        aria-pressed={isPinned}
                      >
                        <PinIcon active={isPinned} />
                      </button>
                      <div>
                        <p className="text-[11px] font-medium text-neutral-500">Conversation</p>
                        <p className="text-sm font-medium text-neutral-200">
                          {activeConversation?.title ?? DEFAULT_CONVERSATION_TITLE}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {selectedSystemPrompt ? (
                        <button
                          type="button"
                          onClick={clearCurrentSystemPrompt}
                          className="group flex min-w-0 max-w-[220px] items-center gap-1.5 rounded-lg border border-[color:var(--chat-accent-strong)] bg-[color:var(--chat-accent-soft)] px-2 py-1 text-[11px] font-medium text-[color:var(--chat-accent)] transition-colors hover:bg-[color:var(--chat-accent-strong)]"
                          title={selectedSystemPrompt.content}
                          aria-label={`Remove instruction ${selectedSystemPrompt.title}`}
                        >
                          <span className="shrink-0 opacity-70">@</span>
                          <span className="truncate">{selectedSystemPrompt.title}</span>
                          <XIcon />
                        </button>
                      ) : null}
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
                          <div className="absolute left-0 top-full z-20 mt-1 w-72 max-h-52 overflow-y-auto chat-scrollbar rounded-lg border border-neutral-800 bg-neutral-950/95 py-1 shadow-xl" data-interactive-surface>
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
                        <ContextStatsDonut stats={contextStats} chatModel={chatModel} />
                      <button
                        ref={historyButtonRef}
                        type="button"
                        onClick={() => setIsHistoryOpen((open) => !open)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-neutral-300 transition-colors hover:border-white/20 hover:bg-white/10"
                        aria-label="Open conversation history"
                      >
                        <MenuIcon />
                      </button>
                      <ExpandButton
                        expanded={isExpanded}
                        wide={isWide}
                        altHeld={isAltHeld}
                        onClick={handleToggleExpand}
                      />
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
                          data-interactive-surface
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
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <span className="truncate font-medium">{conversation.title}</span>
                                      {conversation.terminalSessionId ? (
                                        <span className="shrink-0 rounded border border-white/10 px-1 py-0.5 text-[9px] uppercase tracking-[0.1em] text-neutral-400">
                                          term
                                        </span>
                                      ) : null}
                                      {conversation.systemPrompt ? (
                                        <span className="shrink-0 rounded border border-[color:var(--chat-accent-strong)] bg-[color:var(--chat-accent-soft)] px-1 py-0.5 text-[9px] uppercase tracking-[0.1em] text-[color:var(--chat-accent)]">
                                          @
                                        </span>
                                      ) : null}
                                    </span>
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

                  <motion.div
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
                    initial={false}
                    animate={{
                      height: isExpanded
                        ? Math.max(CHAT_SCROLL_HEIGHT, viewportHeight - 210)
                        : CHAT_SCROLL_HEIGHT
                    }}
                    transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <ChatTranscript
                      messages={chatMessages}
                      isLoading={isLoading}
                      activeStreamMessageId={activeStreamMessageId}
                      thinkingOpenById={thinkingOpenById}
                      onToggleThinking={handleToggleThinking}
                      sourcesPanelMessageId={sourcesPanelMessageId}
                      onToggleSources={handleToggleSources}
                      emptyLabel="No messages yet."
                    />
                  </motion.div>
                  </>
                  ) : isCodeOpen ? (
                    <CodePanel
                      session={code}
                      isExpanded={isExpanded}
                      isWide={isWide}
                      isAltHeld={isAltHeld}
                      isPinned={isPinned}
                      viewportHeight={viewportHeight}
                      onToggleExpand={handleToggleExpand}
                      onTogglePin={handleTogglePin}
                    />
                  ) : isNotesOpen ? (
                    <NotesSurface
                      active
                      height={notesSurfaceHeight}
                      isExpanded={isExpanded}
                      isWide={isWide}
                      isAltHeld={isAltHeld}
                      isPinned={isPinned}
                      onToggleExpand={handleToggleExpand}
                      onTogglePin={handleTogglePin}
                      meeting={meeting}
                    />
                  ) : (
                    <PasteSurface
                      active
                      height={fullSurfaceHeight}
                      isExpanded={isExpanded}
                      isWide={isWide}
                      isAltHeld={isAltHeld}
                      isPinned={isPinned}
                      onToggleExpand={handleToggleExpand}
                      onTogglePin={handleTogglePin}
                    />
                  )}
                </MeasuredPanel>
              )}
            </AnimatePresence>

            {!isFullSurface && (
            <motion.div
              ref={barRef}
              className={`surface-shadow relative flex items-center w-[750px] max-w-full rounded-2xl p-2 bg-gradient-to-br ${themeGradient} border border-white/10 transition-opacity duration-100 texture-surface opacity-100 pointer-events-auto`}
              data-interactive-surface
            >
            <AnimatePresence>
              {instructionMentionVisible && (
                <InstructionPicker
                  items={instructionMentionItems}
                  selectedIndex={instructionMentionIndex}
                  query={instructionMention?.query ?? ''}
                  hasInstructions={preprompts.length > 0}
                  themeGradient={themeGradient}
                  onHover={setInstructionMentionIndex}
                  onSelect={applyInstructionMention}
                />
              )}
            </AnimatePresence>

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
                  onAddNew={() => {
                    setActivePopup(null)
                    const tab =
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
                  className={`texture-surface surface-shadow absolute bottom-full right-0 z-30 mb-3 w-[280px] rounded-2xl border border-white/10 bg-gradient-to-br ${themeGradient} p-3`}
                  data-interactive-surface
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
                    setQuery(getEditableText())
                    syncInstructionMention()
                  }}
                  onKeyUp={syncInstructionMention}
                  onClick={syncInstructionMention}
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
                  onFocus={() => {
                    if (mode === 'terminal') {
                      setIsExpanded(true)
                      setIsWide(true)
                    }
                  }}
                  onCompositionStart={() => { isComposingRef.current = true }}
                  onCompositionEnd={() => {
                    isComposingRef.current = false
                    syncInstructionMention()
                  }}
                  data-placeholder={
                    mode === 'terminal'
                      ? 'Ask about this terminal…'
                      : isCodeOpen
                        ? 'Ask Covenant Code to change something…'
                        : 'What can I help you with today?'
                  }
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
                      ? 'bg-red-500/80 border-red-400/50 text-[color:var(--on-danger)] animate-pulse'
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

              {(barBusy || query.trim()) && (
                <button
                  onClick={() => {
                    if (barBusy) {
                      if (isCodeOpen) void code.stop()
                      else handleCancel()
                    } else if (isCodeOpen) {
                      handleCodeSubmit()
                    } else {
                      void handleSubmit()
                    }
                  }}
                  disabled={!barBusy && !query.trim()}
                  className="flex items-center justify-center w-8 h-8 mr-1 rounded-lg bg-neutral-700/60 hover:bg-neutral-600/80 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-300 transition-all duration-150 border border-white/[0.08]"
                  aria-label={barBusy ? 'Stop generating' : 'Submit prompt'}
                >
                  {barBusy ? <StopIcon /> : <SendIcon />}
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
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[color:var(--chat-accent)] text-[8px] font-bold leading-none text-[color:var(--chat-on-accent)]">
                      {attachedImages.length}
                    </span>
                  </div>
                </button>
              )}

              <div ref={moduleButtonsRef} className="flex items-center gap-1">
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

                {buttonVisibility.notes && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setMode('ai')
                      setActivePopup(null)
                      setActiveSurface('notes')
                      setIsExpanded(true)
                      setIsWide(true)
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-150"
                    aria-label="Notes"
                    aria-pressed={isNotesOpen}
                  >
                    <NotesIcon />
                  </button>
                )}

              </div>
            </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {(hasInitializedTerminal || mode === 'terminal') && (
        <motion.div
          key="terminal-container"
          className="absolute inset-x-0 z-20 pointer-events-none flex justify-center"
          initial={{ scaleY: 0.12, opacity: 0, height: terminalSurfaceHeight }}
          animate={
            enterReady && mode === 'terminal' && visible
              ? {
                  scaleY: 1,
                  y: 0,
                  opacity: 1,
                  height: terminalSurfaceHeight
                }
              : { scaleY: 0.12, y: 0, opacity: 0, height: terminalSurfaceHeight }
          }
          transition={{
            ...TERMINAL_SPRING,
            height: { duration: 0.26, ease: [0.22, 1, 0.36, 1] }
          }}
          style={{
            pointerEvents: 'none',
            transformOrigin: 'bottom center',
            bottom: (barHeight > 0 ? barHeight + 28 : 112) + updateBannerOffset
          }}
          aria-hidden={mode !== 'terminal' || !visible}
        >
          <motion.div
            className={`relative flex h-full max-w-full flex-col overflow-hidden rounded-2xl p-2 bg-gradient-to-br ${themeGradient} border border-white/10 texture-surface`}
            data-interactive-surface
            initial={false}
            animate={{ width: isWide ? wideWidth : 750 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            style={{ pointerEvents: mode === 'terminal' && visible ? 'auto' : 'none' }}
          >
            <div className="flex h-full min-h-0 w-full">
              <div className="min-h-0 flex-1">
                <TerminalView
                  active={mode === 'terminal' && visible && isAppVisible}
                  fontFamily={terminalFont}
                  isExpanded={isExpanded}
                  isWide={isWide}
                  isAltHeld={isAltHeld}
                  isPinned={isPinned}
                  isLight={getThemeMode(themeGradient) === 'light'}
                  onTogglePin={handleTogglePin}
                  onToggleExpand={handleToggleExpand}
                  onActiveSessionChange={setTerminalSessionId}
                />
              </div>

              {isExpanded && isWide && (
                <div className="terminal-rail ml-2 flex h-full w-[30%] min-w-[300px] max-w-[420px] shrink-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-950/30">
                  <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
                    <span className="text-[11px] font-medium text-neutral-500">
                      Assistant
                    </span>
                    <span className="truncate text-[11px] text-neutral-500">this terminal</span>
                  </div>
                  <div
                    ref={terminalRailRef}
                    className="chat-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
                  >
                    <ChatTranscript
                      messages={chatMessages}
                      isLoading={isLoading}
                      activeStreamMessageId={activeStreamMessageId}
                      thinkingOpenById={thinkingOpenById}
                      onToggleThinking={handleToggleThinking}
                      sourcesPanelMessageId={sourcesPanelMessageId}
                      onToggleSources={handleToggleSources}
                      emptyLabel="Ask about this terminal — errors, commands, or what to do next."
                      fullWidthBubbles
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      <AnimatePresence>
        {deletingConversation && (
          <ConfirmDeleteModal
            title="Delete conversation"
            message={`Are you sure you want to delete "${deletingConversation.title}"? This cannot be undone.`}
            contained
            confirmLabel="Delete"
            onConfirm={() => {
              void handleDeleteConversation()
            }}
            onCancel={() => setDeletingConversation(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOnboarding && (
          <OnboardingModal
            apiKey={onboardingApiKey}
            onApiKeyChange={setOnboardingApiKey}
            onSkip={() => {
              window.api?.config.markOnboarded?.()
              setShowOnboarding(false)
            }}
            onComplete={handleCompleteOnboarding}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {code.permissions.map((request) => (
          <CodePermissionModal
            key={request.id}
            request={request}
            onReply={(reply) => void code.replyPermission(request, reply)}
          />
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {terminalApproval ? (
          <TerminalApprovalModal
            key={terminalApproval.requestId}
            request={terminalApproval}
            onReply={handleTerminalApprovalReply}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
