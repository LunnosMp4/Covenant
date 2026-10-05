import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface ExcalidrawEmbedProps {
  checkpointId: string
  serverId?: string
}

type EmbedStatus = 'resolving' | 'loading' | 'ready' | 'error'

const PSEUDO_ELEMENT_TYPES = new Set(['cameraUpdate', 'delete', 'restoreCheckpoint'])

async function buildSceneJson(elements: unknown[]): Promise<string> {
  const { FONT_FAMILY, convertToExcalidrawElements, serializeAsJSON } = await import(
    '@excalidraw/excalidraw'
  )

  const sanitized = elements
    .filter((element): element is Record<string, unknown> => {
      if (!element || typeof element !== 'object') return false
      return !PSEUDO_ELEMENT_TYPES.has(String((element as Record<string, unknown>).type))
    })
    .map((element) => {
      const label = element.label as Record<string, unknown> | undefined
      if (!label || typeof label !== 'object') return element
      return { ...element, label: { textAlign: 'center', verticalAlign: 'middle', ...label } }
    })

  const converted = convertToExcalidrawElements(
    sanitized as Parameters<typeof convertToExcalidrawElements>[0],
    { regenerateIds: false }
  ).map((element) =>
    element.type === 'text'
      ? { ...element, fontFamily: (FONT_FAMILY as Record<string, number>).Excalifont ?? 1 }
      : element
  )

  return serializeAsJSON(
    converted as Parameters<typeof serializeAsJSON>[0],
    { viewBackgroundColor: '#ffffff' },
    {},
    'database'
  )
}

export function ExcalidrawEmbed({ checkpointId, serverId }: ExcalidrawEmbedProps): JSX.Element {
  const [status, setStatus] = useState<EmbedStatus>('resolving')
  const [iframeSrc, setIframeSrc] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState<'id' | 'link' | null>(null)

  const resolveDiagram = useCallback(async () => {
    setStatus('resolving')
    setErrorMessage('')
    setIframeSrc('')

    try {
      const api = window.api?.excalidraw
      if (!api) throw new Error('Excalidraw bridge is unavailable.')

      const checkpoint = await api.readCheckpoint(serverId, checkpointId)
      if (!checkpoint?.ok || !Array.isArray(checkpoint.elements)) {
        throw new Error(checkpoint?.error ?? 'Unable to read the diagram checkpoint.')
      }

      const sceneJson = await buildSceneJson(checkpoint.elements)
      const exported = await api.exportToExcalidraw(serverId ?? checkpoint.serverId, sceneJson)
      if (!exported?.ok || !exported.url) {
        throw new Error(exported?.error ?? 'Unable to export the diagram.')
      }

      // Clear any scene persisted by a previously embedded Excalidraw view so
      // loading this #json link doesn't trigger the "replace existing content" prompt.
      await api.clearStorage?.().catch(() => undefined)

      setIframeSrc(exported.url)
      setStatus('loading')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load the diagram.')
      setStatus('error')
    }
  }, [checkpointId, serverId])

  useEffect(() => {
    void resolveDiagram()
  }, [resolveDiagram])

  const handleOpenExternal = (): void => {
    if (!iframeSrc) return
    void window.api?.openExternal(iframeSrc)
  }

  const handleCopy = (value: string, kind: 'id' | 'link'): void => {
    window.api?.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1800)
  }

  const isBusy = status === 'resolving' || status === 'loading'
  const statusDot =
    status === 'ready'
      ? 'bg-emerald-500'
      : status === 'error'
        ? 'bg-red-500'
        : 'bg-amber-400 animate-pulse'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/80 shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-300">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${statusDot}`} />
          <span className="font-medium text-neutral-200">Excalidraw Diagram</span>
          <span className="truncate font-mono text-[10px] text-neutral-500">
            #{checkpointId.slice(0, 8)}
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleCopy(checkpointId, 'id')}
            className="rounded px-2 py-1 text-[11px] text-neutral-400 transition hover:bg-white/10 hover:text-white"
          >
            {copied === 'id' ? 'Copied!' : 'Copy ID'}
          </button>
          <button
            type="button"
            onClick={() => handleCopy(iframeSrc, 'link')}
            disabled={!iframeSrc}
            className="rounded px-2 py-1 text-[11px] text-neutral-400 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copied === 'link' ? 'Copied!' : 'Copy Link'}
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((expanded) => !expanded)}
            className="rounded px-2 py-1 text-[11px] text-neutral-400 transition hover:bg-white/10 hover:text-white"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
          <button
            type="button"
            onClick={handleOpenExternal}
            disabled={!iframeSrc}
            className="rounded px-2 py-1 text-[11px] text-sky-400 transition hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Open Browser ↗
          </button>
        </div>
      </div>

      <div
        className={`relative w-full transition-all duration-300 ${
          isExpanded ? 'h-[750px]' : 'h-[460px]'
        }`}
      >
        {isBusy ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-900/70 text-xs text-neutral-400">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-600 border-t-neutral-200" />
            <span>
              {status === 'resolving'
                ? 'Preparing interactive diagram…'
                : 'Loading interactive diagram…'}
            </span>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-950/80 px-6 text-center">
            <p className="max-w-md text-xs text-red-300">{errorMessage}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void resolveDiagram()}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-[11px] text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-800"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => handleCopy(checkpointId, 'id')}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-[11px] text-neutral-400 transition hover:border-neutral-600 hover:text-neutral-200"
              >
                {copied === 'id' ? 'Copied!' : 'Copy Checkpoint ID'}
              </button>
            </div>
          </div>
        ) : null}

        {iframeSrc ? (
          <iframe
            src={iframeSrc}
            className="h-full w-full border-0"
            allow="clipboard-read; clipboard-write"
            onLoad={() => setStatus('ready')}
            title={`Excalidraw View ${checkpointId}`}
          />
        ) : null}
      </div>
    </motion.div>
  )
}

export default ExcalidrawEmbed
