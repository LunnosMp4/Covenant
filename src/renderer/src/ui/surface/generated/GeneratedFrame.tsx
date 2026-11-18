import { useEffect, useRef, useState } from 'react'
import {
  GENERATED_BRIDGE_VERSION,
  GENERATED_LIMITS,
  clampGeneratedHeight,
  type GeneratedSource,
  type GeneratedThemeContext
} from '../../../../../shared/ui/generated'
import { FRAME_FILE } from '../../../../../shared/ui/frame'
import { GENERATED_TOKENS } from '../../../../../shared/ui/tokens'

interface GeneratedFrameProps {
  identity: string
  source: GeneratedSource
  interactive: boolean
  onAction: (prompt: string) => void
}

type FrameStatus = 'starting' | 'ready' | 'failed'

interface SandboxSource {
  charts: string
  error?: string
}

let sandboxSourcePromise: Promise<SandboxSource> | null = null

/**
 * The frame document itself is static (`sandbox/frame.html`, written next to the
 * runtime by the vite plugin); this only fetches the chart engine when authored
 * code asks for one.
 */
function loadSandboxCharts(): Promise<SandboxSource> {
  if (!sandboxSourcePromise) {
    const api = window.api?.ui
    const attempt = api
      ? api.getSandboxSource()
      : Promise.resolve({ charts: '', error: 'Sandbox is unavailable.' })
    sandboxSourcePromise = attempt
      .then((result) => {
        // Do not cache a miss: the bundler may still be writing the sandbox
        // assets when the first generated surface opens.
        if (result.error || !result.charts) sandboxSourcePromise = null
        return result
      })
      .catch((error: unknown) => {
        sandboxSourcePromise = null
        return {
          charts: '',
          error: error instanceof Error ? error.message : 'Sandbox is unavailable.'
        }
      })
  }
  return sandboxSourcePromise
}

/** Same-origin static frame, relative to the app document in dev and packaged builds. */
const FRAME_URL = `sandbox/${FRAME_FILE}`

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
  const frameHostRef = useRef<HTMLDivElement | null>(null)
  const submittedRef = useRef(false)
  const [status, setStatus] = useState<FrameStatus>('starting')
  const [loaded, setLoaded] = useState(false)
  // A generated surface owns an iframe, its JS heap and possibly an ECharts
  // instance per chart. A frame that is far offscreen is torn down and replayed
  // from its saved state when it scrolls back, so memory follows the viewport.
  const [nearViewport, setNearViewport] = useState(true)
  const [height, setHeight] = useState(() => clampGeneratedHeight(source.height))
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(null)
  const [failure, setFailure] = useState('')

  // Fail fast when the sandbox assets were never built, instead of waiting for
  // the frame's startup timeout.
  useEffect(() => {
    let cancelled = false
    void loadSandboxCharts().then((result) => {
      if (cancelled || !result.error) return
      setFailure(result.error)
      setStatus('failed')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const host = frameHostRef.current
    if (!host || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        const next = entry?.isIntersecting ?? true
        setNearViewport(next)
        if (!next) {
          // The bridge effect stops with the frame; a remount starts clean and
          // replays the source with the state saved in sessionStorage.
          setLoaded(false)
          setStatus((current) => (current === 'failed' ? current : 'starting'))
        }
      },
      // Keep a large margin: leaving the viewport is not a reason to discard a
      // visual the user is about to scroll back to.
      { rootMargin: '1600px 0px' }
    )
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!nearViewport) return
    const frame = frameRef.current
    if (!frame) return

    let initialized = false

    const send = (message: Record<string, unknown>): void => {
      frame.contentWindow?.postMessage({ version: GENERATED_BRIDGE_VERSION, ...message }, '*')
    }

    const handleMessage = (message: unknown): void => {
      const data = message as Record<string, unknown> | null
      if (!data || data.version !== GENERATED_BRIDGE_VERSION) return

      if (data.type === 'charts') {
        void loadSandboxCharts().then((result) => {
          send({ type: 'charts', source: result.charts })
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
        // Keep a proposal that arrives mid-stream instead of dropping the
        // click: the confirmation is shown now, its send button unlocks when
        // the answer finishes and the surface becomes actionable.
        if (submittedRef.current) return
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
        if (initialized) return
        initialized = true
        send({
          type: 'initialize',
          source: {
            html: source.html,
            css: source.css,
            javascript: source.javascript
          },
          state: readState(identity),
          context: readThemeContext(),
          height
        })
        return
      }

      handleMessage(data)
    }

    window.addEventListener('message', onMessage)
    // The frame may have announced itself before this listener existed, and a
    // remount (StrictMode, HMR) must re-initialize it: ask for a handshake.
    send({ type: 'handshake' })

    return () => {
      window.removeEventListener('message', onMessage)
    }
    // The bridge is rebuilt when the surface identity or its mount window
    // changes; the source/theme are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, nearViewport])

  // Frames load lazily (`loading="lazy"`), so an offscreen visual may not have a
  // document yet. The startup timeout only applies once it has actually loaded.
  useEffect(() => {
    if (!loaded || status !== 'starting') return
    const timer = window.setTimeout(() => {
      setFailure('The visual did not start in time.')
      setStatus((current) => (current === 'starting' ? 'failed' : current))
    }, GENERATED_LIMITS.startupTimeoutMs)
    return () => window.clearTimeout(timer)
  }, [loaded, status])

  // Theme changes repaint the frame without remounting it. The context reads
  // ~40 computed custom properties, so the mutation burst of a theme swap is
  // coalesced into one frame and skipped when nothing charts/kit-related moved.
  useEffect(() => {
    let last = JSON.stringify(readThemeContext())
    let scheduled = 0

    const flush = (): void => {
      scheduled = 0
      const context = readThemeContext()
      const serialized = JSON.stringify(context)
      if (serialized === last) return
      last = serialized
      frameRef.current?.contentWindow?.postMessage(
        {
          version: GENERATED_BRIDGE_VERSION,
          type: 'context',
          context
        },
        '*'
      )
    }

    const observer = new MutationObserver(() => {
      if (scheduled) return
      scheduled = window.requestAnimationFrame(flush)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-theme']
    })

    return () => {
      observer.disconnect()
      if (scheduled) window.cancelAnimationFrame(scheduled)
    }
  }, [])

  const sendProposal = (): void => {
    if (!interactive || !proposal || submittedRef.current) return
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

      {status !== 'failed' ? (
        <div ref={frameHostRef} className="surface-generated-frame" style={{ height }}>
          {nearViewport ? (
            <iframe
              ref={frameRef}
              src={FRAME_URL}
              sandbox="allow-scripts"
              loading="lazy"
              referrerPolicy="no-referrer"
              title={source.title}
              style={{ height }}
              onLoad={() => setLoaded(true)}
            />
          ) : null}
          {!nearViewport || status !== 'ready' ? (
            <div className="surface-generated-loading" aria-hidden />
          ) : null}
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
              disabled={!interactive}
              title={interactive ? undefined : 'Available once the answer finishes.'}
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
