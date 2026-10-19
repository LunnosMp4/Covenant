import { memo, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import ExpandButton from '../ui/ExpandButton'

interface TerminalTab {
  sessionId: string
  shell: string
  shellPath: string
  isAlive: boolean
  isStarted: boolean
}

interface SessionHandle {
  terminal: Terminal
  fitAddon: FitAddon
  host: HTMLDivElement
  disposers: Array<() => void>
}

interface TerminalViewProps {
  active: boolean
  fontFamily: string
  isExpanded: boolean
  isWide: boolean
  isAltHeld: boolean
  isPinned: boolean
  isLight: boolean
  onTogglePin: () => void
  onToggleExpand: (event: MouseEvent<HTMLButtonElement>) => void
  onActiveSessionChange: (sessionId: string | null) => void
}

function extractShellName(shellPath: string): string {
  const parts = shellPath.replace(/\\/g, '/').split('/')
  const last = parts[parts.length - 1] || shellPath
  return last.replace('.exe', '').replace('.Exe', '')
}

function TerminalIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="m7 9 3 2-3 2" />
      <path d="M12.5 13h4.5" />
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

function CloseTabIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function PlusIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function CopyIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

// The terminal canvas is always transparent; the surface color is painted by
// the panel behind it. In light themes we draw a soft dark scrim that fades
// from top to bottom, so shell/prompt ANSI colors (zsh, oh-my-posh) stay
// readable without looking like a hard black box.
const LIGHT_TERMINAL_SURFACE =
  'linear-gradient(165deg, rgba(30,30,35,0.80) 0%, rgba(12,12,15,0.94) 100%)'

const TERMINAL_OPTIONS = {
  allowProposedApi: false,
  allowTransparency: true,
  convertEol: true,
  cursorBlink: true,
  scrollback: 10000,
  fontSize: 13,
  lineHeight: 1.2,
  theme: {
    background: '#00000000',
    foreground: '#e6e6e6',
    cursor: '#fb923c',
    selectionBackground: '#f8fafc33'
  }
} as const

function TerminalView({
  active,
  fontFamily,
  isExpanded,
  isWide,
  isAltHeld,
  isPinned,
  isLight,
  onTogglePin,
  onToggleExpand,
  onActiveSessionChange
}: TerminalViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const sessionsRef = useRef<Map<string, SessionHandle>>(new Map())
  const activeSessionIdRef = useRef<string | null>(null)
  const tabsRef = useRef<TerminalTab[]>([])
  const hasUnavailableMessageRef = useRef(false)
  const fontFamilyRef = useRef(fontFamily)
  const onActiveSessionChangeRef = useRef(onActiveSessionChange)

  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [hasSelection, setHasSelection] = useState(false)

  useEffect(() => {
    onActiveSessionChangeRef.current = onActiveSessionChange
  }, [onActiveSessionChange])

  const tabsRefSetter = useCallback((next: TerminalTab[]) => {
    tabsRef.current = next
    setTabs(next)
  }, [])

  useEffect(() => {
    fontFamilyRef.current = fontFamily
  }, [fontFamily])

  const fitSession = useCallback((sessionId: string) => {
    const handle = sessionsRef.current.get(sessionId)
    if (!handle) return
    try {
      handle.fitAddon.fit()
      void window.api?.terminal.resize(sessionId, handle.terminal.cols, handle.terminal.rows)
    } catch {
      // fit() throws when the host is not measurable yet.
    }
  }, [])

  const fitActive = useCallback(() => {
    const sessionId = activeSessionIdRef.current
    if (sessionId) fitSession(sessionId)
  }, [fitSession])

  const disposeSession = useCallback((sessionId: string) => {
    const handle = sessionsRef.current.get(sessionId)
    if (!handle) return
    for (const dispose of handle.disposers) dispose()
    handle.terminal.dispose()
    handle.host.remove()
    sessionsRef.current.delete(sessionId)
  }, [])

  const setActiveSession = useCallback((sessionId: string | null) => {
    activeSessionIdRef.current = sessionId
    setActiveTabId(sessionId)

    for (const [id, handle] of sessionsRef.current.entries()) {
      handle.host.style.display = id === sessionId ? 'block' : 'none'
    }

    if (sessionId) {
      const handle = sessionsRef.current.get(sessionId)
      handle?.terminal.focus()
      setHasSelection(handle?.terminal.hasSelection() ?? false)
      window.api?.terminal.reportActiveSession(sessionId)
    }

    onActiveSessionChangeRef.current?.(sessionId)
  }, [])

  // Create a dedicated xterm instance for a session (one per tab, so scrollback,
  // alternate-screen apps and cursor state are never replayed or lost).
  const createSessionTerminal = useCallback((sessionId: string): SessionHandle | null => {
    const container = containerRef.current
    if (!container) return null

    const host = document.createElement('div')
    host.style.position = 'absolute'
    host.style.inset = '0'
    host.style.display = 'none'
    container.appendChild(host)

    const terminal = new Terminal({
      ...TERMINAL_OPTIONS,
      fontFamily: fontFamilyRef.current
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(host)

    const disposers: Array<() => void> = []

    const dataSub = terminal.onData((input) => {
      void window.api?.terminal.sendInput(sessionId, input)
    })
    disposers.push(() => dataSub.dispose())

    const selectionSub = terminal.onSelectionChange(() => {
      if (activeSessionIdRef.current === sessionId) {
        setHasSelection(terminal.hasSelection())
      }
    })
    disposers.push(() => selectionSub.dispose())

    terminal.attachCustomKeyEventHandler((event) => {
      const key = event.key.toLowerCase()
      const isCopyShortcut =
        ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'c') ||
        (event.metaKey && !event.shiftKey && !event.ctrlKey && !event.altKey && key === 'c')

      if (isCopyShortcut && terminal.hasSelection()) {
        const selection = terminal.getSelection()
        if (selection) {
          window.api?.clipboard.writeText(selection)
        }
        return false
      }

      return true
    })

    const handle: SessionHandle = { terminal, fitAddon, host, disposers }
    sessionsRef.current.set(sessionId, handle)
    return handle
  }, [])

  const switchToTab = useCallback(
    (sessionId: string) => {
      const next = tabsRef.current.find((t) => t.sessionId === sessionId)
      if (!next) return

      setActiveSession(sessionId)
      requestAnimationFrame(() => {
        fitSession(sessionId)
      })
    },
    [fitSession, setActiveSession]
  )

  const addTab = useCallback(async () => {
    const terminalApi = window.api?.terminal
    if (!terminalApi) return

    const reference = activeSessionIdRef.current
      ? sessionsRef.current.get(activeSessionIdRef.current)?.terminal
      : undefined

    try {
      const result = await terminalApi.startTerminal({
        cols: reference?.cols,
        rows: reference?.rows
      })

      if (result.error) return

      const shellName = extractShellName(result.shell)
      const newTab: TerminalTab = {
        sessionId: result.sessionId,
        shell: shellName,
        shellPath: result.shell,
        isAlive: true,
        isStarted: true
      }

      createSessionTerminal(result.sessionId)
      tabsRefSetter([...tabsRef.current, newTab])
      switchToTab(result.sessionId)
    } catch {
      // Ignore: the header will simply not gain a new tab.
    }
  }, [createSessionTerminal, switchToTab, tabsRefSetter])

  const closeTab = useCallback(
    async (sessionId: string) => {
      const currentTabs = tabsRef.current
      if (currentTabs.length <= 1) return

      await window.api?.terminal.killTerminal(sessionId)
      disposeSession(sessionId)

      const updated = currentTabs.filter((t) => t.sessionId !== sessionId)
      tabsRefSetter(updated)

      if (activeSessionIdRef.current === sessionId) {
        const idx = currentTabs.findIndex((t) => t.sessionId === sessionId)
        const nextTab = updated[Math.min(idx, updated.length - 1)]
        if (nextTab) {
          switchToTab(nextTab.sessionId)
        }
      }
    },
    [disposeSession, switchToTab, tabsRefSetter]
  )

  const copySelection = useCallback(() => {
    const sessionId = activeSessionIdRef.current
    if (!sessionId) return
    const terminal = sessionsRef.current.get(sessionId)?.terminal
    if (!terminal || !terminal.hasSelection()) return
    const selection = terminal.getSelection()
    if (selection) {
      window.api?.clipboard.writeText(selection)
    }
  }, [])

  // Subscribe to PTY data/exit once. Data is routed to the matching session's
  // own xterm, so background tabs keep receiving output.
  useEffect(() => {
    const unsubscribeData = window.api?.terminal.onData((sessionId, chunk) => {
      sessionsRef.current.get(sessionId)?.terminal.write(chunk)
    })

    const unsubscribeExit = window.api?.terminal.onExit((payload) => {
      tabsRef.current = tabsRef.current.map((t) =>
        t.sessionId === payload.sessionId ? { ...t, isAlive: false } : t
      )
      setTabs([...tabsRef.current])

      if (payload.sessionId === activeSessionIdRef.current) {
        sessionsRef.current
          .get(payload.sessionId)
          ?.terminal.write(`\r\n[terminal exited with code ${payload.exitCode}]\r\n`)
      }
    })

    return () => {
      if (typeof unsubscribeData === 'function') unsubscribeData()
      if (typeof unsubscribeExit === 'function') unsubscribeExit()
    }
  }, [])

  // Refit the active terminal when the container resizes (debounced so the
  // expand/collapse animation doesn't reflow the scrollback every frame).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let fitTimer: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (fitTimer) clearTimeout(fitTimer)
      fitTimer = setTimeout(() => {
        fitTimer = null
        fitActive()
      }, 90)
    })

    resizeObserver.observe(container)
    const initialFitFrame = requestAnimationFrame(() => fitActive())

    return () => {
      if (fitTimer) clearTimeout(fitTimer)
      cancelAnimationFrame(initialFitFrame)
      resizeObserver.disconnect()
    }
  }, [fitActive])

  // Tear down every session terminal on unmount.
  useEffect(() => {
    return () => {
      for (const sessionId of [...sessionsRef.current.keys()]) {
        disposeSession(sessionId)
      }
    }
  }, [disposeSession])

  // Update font on change.
  useEffect(() => {
    for (const handle of sessionsRef.current.values()) {
      handle.terminal.options.fontFamily = fontFamily
    }
    fitActive()
  }, [fitActive, fontFamily])

  // Start the initial tab when the terminal becomes active.
  useEffect(() => {
    if (!active) return

    const terminalApi = window.api?.terminal
    if (!terminalApi) {
      if (!hasUnavailableMessageRef.current && containerRef.current) {
        hasUnavailableMessageRef.current = true
      }
      return
    }

    if (tabsRef.current.length > 0) {
      fitActive()
      const activeSessionId = activeSessionIdRef.current
      if (activeSessionId) {
        sessionsRef.current.get(activeSessionId)?.terminal.focus()
      }
      return
    }

    void terminalApi.listSessions().then((existing) => {
      if (existing.length > 0) {
        const liveTabs: TerminalTab[] = []
        for (const session of existing) {
          const handle = createSessionTerminal(session.sessionId)
          if (handle) {
            // Rehydrated session: seed the fresh xterm with the scrollback the
            // main process retained so the tab doesn't open blank.
            void terminalApi.read(session.sessionId, 400).then((res) => {
              if (res.success && res.output) {
                handle.terminal.write(`${res.output}\r\n`)
              }
            })
          }
          liveTabs.push({
            sessionId: session.sessionId,
            shell: session.shell,
            shellPath: session.shell,
            isAlive: true,
            isStarted: true
          })
        }
        tabsRefSetter(liveTabs)
        switchToTab(existing[0].sessionId)
        return
      }

      const startInitialTab = async (): Promise<void> => {
        try {
          const result = await terminalApi.startTerminal()
          if (result.error) return

          const shellName = extractShellName(result.shell)
          const tab: TerminalTab = {
            sessionId: result.sessionId,
            shell: shellName,
            shellPath: result.shell,
            isAlive: true,
            isStarted: true
          }

          createSessionTerminal(result.sessionId)
          tabsRefSetter([tab])
          switchToTab(result.sessionId)
        } catch {
          // Ignore: the surface stays empty if the shell cannot start.
        }
      }

      void startInitialTab()
    })
  }, [active, createSessionTerminal, fitActive, switchToTab, tabsRefSetter])

  const activeTab = tabs.find((t) => t.sessionId === activeTabId)

  return (
    <div
      className={`terminal-surface h-full w-full flex flex-col overflow-hidden rounded-xl border transition-[background] duration-200 ${
        isLight ? 'border-white/15' : 'border-white/10 bg-neutral-950/30'
      }`}
      style={isLight ? { background: LIGHT_TERMINAL_SURFACE } : undefined}
    >
      {/* Header bar */}
      <div className="relative flex items-center justify-between px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onTogglePin}
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
          <span className="text-neutral-400 shrink-0">
            <TerminalIcon />
          </span>
          <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500 truncate">
            {activeTab?.shell || 'Terminal'}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={copySelection}
            disabled={!hasSelection}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
              hasSelection
                ? 'border-white/10 text-neutral-400 hover:border-white/20 hover:bg-white/10 hover:text-neutral-200'
                : 'border-white/10 text-neutral-600 cursor-not-allowed'
            }`}
            aria-label="Copy selection"
            title="Copy selection"
          >
            <CopyIcon />
          </button>
          <ExpandButton
            expanded={isExpanded}
            wide={isWide}
            altHeld={isAltHeld}
            onClick={onToggleExpand}
          />
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex items-center shrink-0 overflow-x-auto border-t border-white/5 px-2">
        <div className="flex items-center gap-0.5 min-w-0 py-1">
          {tabs.map((tab) => {
            const isActive = tab.sessionId === activeTabId
            return (
              <div
                key={tab.sessionId}
                className={`flex items-center gap-1 shrink-0 rounded-t-md px-2.5 py-1 text-xs cursor-pointer select-none transition-colors ${
                  isActive
                    ? 'bg-white/10 text-neutral-200 border border-white/10 border-b-transparent'
                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
                }`}
                onClick={() => {
                  if (!isActive) {
                    switchToTab(tab.sessionId)
                  }
                }}
              >
                <span className={`truncate max-w-[100px] ${!tab.isAlive ? 'line-through opacity-50' : ''}`}>
                  {tab.isAlive ? tab.shell : `${tab.shell} (dead)`}
                </span>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void closeTab(tab.sessionId)
                    }}
                    className="flex items-center justify-center w-4 h-4 rounded hover:bg-white/15 transition-colors shrink-0 text-neutral-500 hover:text-neutral-200"
                    aria-label={`Close ${tab.shell} tab`}
                  >
                    <CloseTabIcon />
                  </button>
                )}
              </div>
            )
          })}
          <button
            type="button"
            onClick={() => void addTab()}
            className="flex items-center justify-center w-6 h-6 shrink-0 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-white/10 transition-colors"
            aria-label="Add terminal tab"
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      {/* Xterm hosts (one per session) */}
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden px-2 py-2" />
    </div>
  )
}

export default memo(TerminalView)
