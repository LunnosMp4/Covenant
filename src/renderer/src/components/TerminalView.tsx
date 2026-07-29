import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

interface TerminalTab {
  sessionId: string
  shell: string
  shellPath: string
  buffer: string
  isAlive: boolean
  isStarted: boolean
}

interface TerminalViewProps {
  active: boolean
  fontFamily: string
  isExpanded: boolean
  isPinned: boolean
  onTogglePin: () => void
  onToggleExpand: () => void
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

function ExpandIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
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

const TERMINAL_OPTIONS = {
  allowProposedApi: false,
  convertEol: true,
  cursorBlink: true,
  scrollback: 10000,
  fontSize: 13,
  lineHeight: 1.2,
  theme: {
    background: '#05050500',
    foreground: '#e6e6e6',
    cursor: '#fb923c',
    selectionBackground: '#f8fafc33'
  }
} as const

function TerminalView({
  active,
  fontFamily,
  isExpanded,
  isPinned,
  onTogglePin,
  onToggleExpand
}: TerminalViewProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)
  const tabsRef = useRef<TerminalTab[]>([])
  const hasUnavailableMessageRef = useRef(false)
  const unsubscribeRef = useRef<Array<() => void>>([])
  const isRestoringRef = useRef(false)

  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const tabsRefSetter = useCallback((next: TerminalTab[]) => {
    tabsRef.current = next
    setTabs(next)
  }, [])

  const createTerminal = useCallback((host: HTMLElement) => {
    const terminal = new Terminal({
      ...TERMINAL_OPTIONS,
      fontFamily
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(host)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const disposeInput = terminal.onData((input) => {
      const sessionId = activeSessionIdRef.current
      if (sessionId) {
        void window.api?.terminal.sendInput(sessionId, input)
      }
    })

    return { terminal, fitAddon, disposeInput }
  }, [fontFamily])

  const fitAndResize = useCallback((sessionId?: string) => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    const terminalApi = window.api?.terminal

    if (!terminal || !fitAddon || !terminalApi) return

    const sid = sessionId ?? activeSessionIdRef.current
    if (!sid) return

    try {
      fitAddon.fit()
      void terminalApi.resize(sid, terminal.cols, terminal.rows)
    } catch {
      // fit() can throw when the terminal container is not measurable yet.
    }
  }, [])

  const switchToTab = useCallback((sessionId: string) => {
    const terminal = terminalRef.current
    if (!terminal) return

    const next = tabsRef.current.find((t) => t.sessionId === sessionId)
    if (!next) return

    isRestoringRef.current = true
    terminal.reset()

    terminal.options.fontFamily = fontFamily
    terminal.options.cursorBlink = TERMINAL_OPTIONS.cursorBlink
    terminal.options.convertEol = TERMINAL_OPTIONS.convertEol
    terminal.options.scrollback = TERMINAL_OPTIONS.scrollback
    terminal.options.fontSize = TERMINAL_OPTIONS.fontSize
    terminal.options.lineHeight = TERMINAL_OPTIONS.lineHeight
    terminal.options.theme = TERMINAL_OPTIONS.theme

    if (next.buffer) {
      terminal.write(next.buffer)
    }

    isRestoringRef.current = false
    activeSessionIdRef.current = sessionId
    setActiveTabId(sessionId)
    window.api?.terminal.reportActiveSession(sessionId)

    requestAnimationFrame(() => {
      fitAndResize(sessionId)
    })
  }, [fitAndResize, fontFamily])

  const addTab = useCallback(async () => {
    const terminalApi = window.api?.terminal
    const terminal = terminalRef.current
    if (!terminalApi || !terminal) return

    try {
      const result = await terminalApi.startTerminal({
        cols: terminal.cols,
        rows: terminal.rows
      })

      if (result.error) {
        terminal.writeln(`\r\n[error] ${result.error}\r\n`)
        return
      }

      const shellName = extractShellName(result.shell)
      const newTab: TerminalTab = {
        sessionId: result.sessionId,
        shell: shellName,
        shellPath: result.shell,
        buffer: '',
        isAlive: true,
        isStarted: true
      }

      const updated = [...tabsRef.current, newTab]
      tabsRefSetter(updated)
      switchToTab(result.sessionId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start terminal.'
      terminal.writeln(`\r\n[error] ${message}\r\n`)
    }
  }, [switchToTab, tabsRefSetter])

  const closeTab = useCallback(async (sessionId: string) => {
    const currentTabs = tabsRef.current
    if (currentTabs.length <= 1) return

    const terminalApi = window.api?.terminal
    if (terminalApi) {
      await terminalApi.killTerminal(sessionId)
    }

    const updated = currentTabs.filter((t) => t.sessionId !== sessionId)
    tabsRefSetter(updated)

    if (activeSessionIdRef.current === sessionId) {
      const idx = currentTabs.findIndex((t) => t.sessionId === sessionId)
      const nextTab = updated[Math.min(idx, updated.length - 1)]
      if (nextTab) {
        switchToTab(nextTab.sessionId)
      }
    }
  }, [switchToTab, tabsRefSetter])

  // Create xterm on mount
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const { terminal, fitAddon, disposeInput } = createTerminal(host)

    const unsubscribeData = window.api?.terminal.onData((sessionId, chunk) => {
      if (tabsRef.current.some((t) => t.sessionId === sessionId)) {
        // Accumulate buffer for this session
        tabsRef.current = tabsRef.current.map((t) =>
          t.sessionId === sessionId ? { ...t, buffer: t.buffer + chunk } : t
        )
        setTabs([...tabsRef.current])
      }

      if (sessionId === activeSessionIdRef.current && !isRestoringRef.current) {
        terminal.write(chunk)
      }
    })

    const unsubscribeExit = window.api?.terminal.onExit((payload) => {
      tabsRef.current = tabsRef.current.map((t) =>
        t.sessionId === payload.sessionId ? { ...t, isAlive: false } : t
      )
      setTabs([...tabsRef.current])

      if (payload.sessionId === activeSessionIdRef.current) {
        terminal.write(`\r\n[terminal exited with code ${payload.exitCode}]\r\n`)
      }
    })

    unsubscribeRef.current = [disposeInput, unsubscribeData, unsubscribeExit].filter(
      (f): f is (() => void) => typeof f === 'function'
    )

    const resizeObserver = new ResizeObserver(() => {
      fitAndResize()
    })

    resizeObserver.observe(host)
    requestAnimationFrame(() => {
      fitAndResize()
    })

    return () => {
      resizeObserver.disconnect()
      for (const unsub of unsubscribeRef.current) {
        unsub()
      }
      unsubscribeRef.current = []
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [createTerminal, fitAndResize])

  // Update font on change
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return

    terminal.options.fontFamily = fontFamily
    fitAndResize()
  }, [fitAndResize, fontFamily])

  // Start initial tab when active becomes true
  useEffect(() => {
    if (!active) return

    const terminal = terminalRef.current
    const terminalApi = window.api?.terminal

    if (!terminal) return

    if (!terminalApi) {
      if (!hasUnavailableMessageRef.current) {
        hasUnavailableMessageRef.current = true
        terminal.writeln('Terminal mode is available only in the Electron app runtime.')
      }
      return
    }

    if (tabsRef.current.length > 0) {
      // Sessions already exist — focus the terminal
      fitAndResize()
      terminal.focus()
      return
    }

    void terminalApi.listSessions().then((existing) => {
      if (existing.length > 0) {
        const liveTabs: TerminalTab[] = existing.map((s) => ({
          sessionId: s.sessionId,
          shell: s.shell,
          shellPath: s.shell,
          buffer: '',
          isAlive: true,
          isStarted: true
        }))
        tabsRefSetter(liveTabs)
        switchToTab(existing[0].sessionId)
        return
      }

      const startInitialTab = async (): Promise<void> => {
        try {
          const result = await terminalApi.startTerminal({
            cols: terminal.cols,
            rows: terminal.rows
          })

          if (result.error) {
            terminal.writeln(`\r\n[error] ${result.error}\r\n`)
            return
          }

          const shellName = extractShellName(result.shell)
          const tab: TerminalTab = {
            sessionId: result.sessionId,
            shell: shellName,
            shellPath: result.shell,
            buffer: '',
            isAlive: true,
            isStarted: true
          }

          tabsRefSetter([tab])
          activeSessionIdRef.current = result.sessionId
          setActiveTabId(result.sessionId)
          window.api?.terminal.reportActiveSession(result.sessionId)

          fitAndResize()
          terminal.focus()
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to start terminal.'
          terminal.writeln(`\r\n[error] ${message}\r\n`)
        }
      }

      void startInitialTab()
    })
  }, [active, fitAndResize, switchToTab, tabsRefSetter])

  const activeTab = tabs.find((t) => t.sessionId === activeTabId)

  return (
    <div className="h-full w-full flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40">
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
            onClick={onToggleExpand}
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

      {/* Xterm host */}
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden px-2 py-2" />
    </div>
  )
}

export default memo(TerminalView)
