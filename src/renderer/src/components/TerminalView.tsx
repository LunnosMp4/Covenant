import { memo, useCallback, useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

interface TerminalViewProps {
  active: boolean
  fontFamily: string
}

function TerminalView({ active, fontFamily }: TerminalViewProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const isStartedRef = useRef(false)
  const hasUnavailableMessageRef = useRef(false)

  const fitAndResize = useCallback(() => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    const terminalApi = window.api?.terminal

    if (!terminal || !fitAddon || !terminalApi) {
      return
    }

    try {
      fitAddon.fit()
      void terminalApi.resize(terminal.cols, terminal.rows)
    } catch {
      // fit() can throw when the terminal container is not measurable yet.
    }
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      scrollback: 5000,
      fontSize: 13,
      lineHeight: 1.2,
      fontFamily,
      theme: {
        background: '#05050500',
        foreground: '#e6e6e6',
        cursor: '#fb923c',
        selectionBackground: '#f8fafc33'
      }
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(host)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const disposeInput = terminal.onData((input) => {
      void window.api?.terminal.sendInput(input)
    })

    const unsubscribeData = window.api?.terminal.onData((chunk) => {
      terminal.write(chunk)
    })

    const unsubscribeExit = window.api?.terminal.onExit((payload) => {
      isStartedRef.current = false
      terminal.write(`\r\n[terminal exited with code ${payload.exitCode}]\r\n`)
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAndResize()
    })

    resizeObserver.observe(host)
    requestAnimationFrame(() => {
      fitAndResize()
    })

    return () => {
      resizeObserver.disconnect()
      disposeInput.dispose()
      if (typeof unsubscribeData === 'function') {
        unsubscribeData()
      }
      if (typeof unsubscribeExit === 'function') {
        unsubscribeExit()
      }
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [fitAndResize])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }

    terminal.options.fontFamily = fontFamily
    fitAndResize()
  }, [fitAndResize, fontFamily])

  useEffect(() => {
    if (!active) {
      return
    }

    const terminal = terminalRef.current
    const terminalApi = window.api?.terminal

    if (!terminal) {
      return
    }

    if (!terminalApi) {
      if (!hasUnavailableMessageRef.current) {
        hasUnavailableMessageRef.current = true
        terminal.writeln('Terminal mode is available only in the Electron app runtime.')
      }
      return
    }

    const startAndFocus = async (): Promise<void> => {
      if (!isStartedRef.current) {
        await terminalApi.startTerminal({
          cols: terminal.cols,
          rows: terminal.rows
        })
        isStartedRef.current = true
      }

      fitAndResize()
      terminal.focus()
    }

    void startAndFocus().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to start terminal.'
      terminal.writeln(`\r\n[error] ${message}\r\n`)
    })
  }, [active, fitAndResize])

  return (
    <div className="h-full w-full overflow-hidden rounded-xl border border-white/10 bg-black/40">
      <div ref={hostRef} className="h-full w-full overflow-hidden px-2 py-2" />
    </div>
  )
}

export default memo(TerminalView)
