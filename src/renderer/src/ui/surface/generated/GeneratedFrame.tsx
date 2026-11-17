import { useEffect, useRef, useState } from 'react'
import {
  GENERATED_BRIDGE_VERSION,
  GENERATED_LIMITS,
  clampGeneratedHeight,
  type GeneratedSource,
  type GeneratedThemeContext
} from '../../../../../shared/ui/generated'
import { GENERATED_TOKENS } from '../../../../../shared/ui/tokens'
import { buildFrameDocument } from './frameDocument'

interface GeneratedFrameProps {
  identity: string
  source: GeneratedSource
  interactive: boolean
  onAction: (prompt: string) => void
}

type FrameStatus = 'starting' | 'ready' | 'failed'

interface SandboxSource {
  runtime: string
  charts: string
  error?: string
}

let sandboxSourcePromise: Promise<SandboxSource> | null = null

function loadSandboxSource(): Promise<SandboxSource> {
  if (!sandboxSourcePromise) {
    const api = window.api?.ui
    const attempt = api
      ? api.getSandboxSource()
      : Promise.resolve({ runtime: '', charts: '', error: 'Sandbox is unavailable.' })
    sandboxSourcePromise = attempt.catch((error: unknown) => {
      // Do not cache a miss: in development the bundler may still be writing
      // the sandbox assets when the first generated surface opens.
      sandboxSourcePromise = null
      return {
        runtime: '',
        charts: '',
        error: error instanceof Error ? error.message : 'Sandbox is unavailable.'
      }
    })
  }
  return sandboxSourcePromise
}

function readThemeContext(): GeneratedThemeContext {
  const styles = getComputedStyle(document.documentElement)
  const tokens: Record<string, string> = {}
  for (const name of GENERATED_TOKENS) {
    const value = styles.getPropertyValue(name).trim()
    if (value) tokens[name] = value
  }
  return {
    mode: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
    fontFamily: styles.getPropertyValue('--ui-font').trim() || 'system-ui, sans-serif',
    tokens
  }
}

function stateKey(identity: string): string {
  return `covenant.ui.state.${identity}`
}

function readState(identity: string): Record<string, unknown> {
  try {
    const raw = window.sessionStorage.getItem(stateKey(identity))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function writeState(identity: string, value: unknown): void {
  try {
    const serialized = JSON.stringify(value)
    if (typeof serialized !== 'string' || serialized.length > GENERATED_LIMITS.maxStateCharacters) {
      return
    }
    window.sessionStorage.setItem(stateKey(identity), serialized)
  } catch {
    // Session state is a convenience; losing it must never break the surface.
  }
}

function describeProposal(values: Record<string, unknown>, source: GeneratedSource): string {
  const parts = Object.entries(values).map(([key, value]) => {
    const field = source.fields?.find((entry) => entry.name === key)
    const label = field?.label ?? key
    const rendered = Array.isArray(value) ? value.join(', ') : String(value)
    return `${label}: ${rendered}`
  })
  const prompt = `Use these settings from the visual: ${parts.join('; ')}`
  return prompt.length > 600 ? `${prompt.slice(0, 597)}…` : prompt
}

/**
 * Sandboxed generated surface.
 *
 * Isolation is the boundary, not the source validator: the frame runs with
 * `sandbox="allow-scripts"` and no `allow-same-origin`, so it has an opaque
 * origin, no host DOM, no storage, and no preload API. Messages are accepted
 * only from this frame and only for the current bridge version.
 */
export default function GeneratedFrame({
  identity,
  source,
  interactive,
  onAction
}: GeneratedFrameProps): JSX.Element {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const portRef = useRef<MessagePort | null>(null)
  const submittedRef = useRef(false)
  const initializedRef = useRef(false)
  const [documentUrl, setDocumentUrl] = useState('')
  const [status, setStatus] = useState<FrameStatus>('starting')
  const [height, setHeight] = useState(() => clampGeneratedHeight(source.height))
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(null)
  const [failure, setFailure] = useState('')

  useEffect(() => {
    let cancelled = false
    let url = ''

    void loadSandboxSource()
      .then((result) => {
        if (cancelled) return
        if (result.error || !result.runtime) {
          setFailure(result.error ?? 'The visual runtime is unavailable.')
          setStatus('failed')
          return
        }
        const html = buildFrameDocument(result.runtime)
        url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
        setDocumentUrl(url)
      })
      .catch(() => {
        if (!cancelled) setStatus('failed')
      })

    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [])

  useEffect(() => {
    if (!documentUrl) return
    const frame = frameRef.current
    if (!frame) return

    let disposed = false
    const startupTimer = window.setTimeout(() => {
      if (!disposed) {
        setFailure('The visual did not start in time.')
        setStatus('failed')
      }
    }, GENERATED_LIMITS.startupTimeoutMs)

    const portMessage = (message: unknown): void => {
      const data = message as Record<string, unknown> | null
      if (!data || data.version !== GENERATED_BRIDGE_VERSION) return

      if (data.type === 'charts') {
        void loadSandboxSource().then((result) => {
          portRef.current?.postMessage({
            version: GENERATED_BRIDGE_VERSION,
            type: 'charts',
            source: result.charts
          })
        })
        return
      }

      if (data.type === 'rendered') {
        setStatus('ready')
        return
      }

      if (data.type === 'resize' && typeof data.height === 'number') {
        setHeight(clampGeneratedHeight(data.height))
        return
      }

      if (data.type === 'state') {
        writeState(identity, data.value)
        return
      }

      if (data.type === 'submit' && data.values && typeof data.values === 'object') {
        if (!interactive || submittedRef.current) return
        setProposal(data.values as Record<string, unknown>)
        return
      }

      if (data.type === 'error' && typeof data.message === 'string') {
        setFailure(data.message.slice(0, 300))
        setStatus('failed')
      }
    }

    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frame.contentWindow) return
      const data = event.data as Record<string, unknown> | null
      if (!data || data.version !== GENERATED_BRIDGE_VERSION) return

      if (data.type === 'ready') {
        // The frame re-announces readiness until it is initialized.
        if (initializedRef.current) return
        initializedRef.current = true
        window.clearTimeout(startupTimer)
        const channel = new MessageChannel()
        portRef.current = channel.port1
        channel.port1.onmessage = (messageEvent) => portMessage(messageEvent.data)
        channel.port1.start()

        const target = frame.contentWindow
        target?.postMessage(
          {
            version: GENERATED_BRIDGE_VERSION,
            type: 'initialize',
            source: {
              html: source.html,
              css: source.css,
              javascript: source.javascript
            },
            state: readState(identity),
            context: readThemeContext(),
            height
          },
          '*',
          [channel.port2]
        )
        return
      }

      portMessage(data)
    }

    window.addEventListener('message', onMessage)

    return () => {
      disposed = true
      window.clearTimeout(startupTimer)
      window.removeEventListener('message', onMessage)
      portRef.current?.close()
      portRef.current = null
    }
    // The bridge is rebuilt when the document or the surface identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentUrl, identity])

  // Theme changes repaint the frame without remounting it.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      portRef.current?.postMessage({
        version: GENERATED_BRIDGE_VERSION,
        type: 'context',
        context: readThemeContext()
      })
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-theme']
    })
    return () => observer.disconnect()
  }, [])

  const sendProposal = (): void => {
    if (!proposal || submittedRef.current) return
    submittedRef.current = true
    onAction(describeProposal(proposal, source))
    setProposal(null)
  }

  return (
    <div className="surface-generated">
      {status === 'failed' ? (
        <p role="status" className="surface-note">
          {failure || 'This visual could not be displayed.'} The text summary is below.
        </p>
      ) : null}

      {documentUrl ? (
        <div className="surface-generated-frame" style={{ height }}>
          <iframe
            ref={frameRef}
            src={documentUrl}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            title={source.title}
            style={{ height }}
          />
          {status !== 'ready' ? <div className="surface-generated-loading" aria-hidden /> : null}
        </div>
      ) : null}

      {proposal ? (
        <div className="surface-proposal">
          <span className="surface-proposal-text">
            {describeProposal(proposal, source)}
          </span>
          <div className="surface-actions-row">
            <button
              type="button"
              className="surface-action surface-action--primary pressable"
              onClick={sendProposal}
            >
              Send to Covenant
            </button>
            <button
              type="button"
              className="surface-action pressable"
              onClick={() => setProposal(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <details className="surface-disclosure">
        <summary>Text summary</summary>
        <p>{source.fallback}</p>
      </details>
    </div>
  )
}
