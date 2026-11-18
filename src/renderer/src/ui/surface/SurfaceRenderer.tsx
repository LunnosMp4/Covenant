import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { validateUiSpec } from '../../../../shared/ui/validate'
import type { UiNodeType, UiSurface } from '../../../../shared/ui/spec'
import ActionsNode from './nodes/ActionsNode'
import ChartNode from './nodes/ChartNode'
import CompareNode from './nodes/CompareNode'
import GeneratedNode from './nodes/GeneratedNode'
import MetricNode from './nodes/MetricNode'
import StackNode from './nodes/StackNode'
import TableNode from './nodes/TableNode'
import TextNode from './nodes/TextNode'
import TimelineNode from './nodes/TimelineNode'
import SurfaceFallback from './SurfaceFallback'
import { SurfaceContext, useSurfaceContext, type NodeViewProps } from './types'

const NODE_VIEWS: Record<UiNodeType, ComponentType<NodeViewProps>> = {
  Stack: StackNode,
  Text: TextNode,
  Metric: MetricNode,
  Chart: ChartNode,
  Table: TableNode,
  Compare: CompareNode,
  Actions: ActionsNode,
  Timeline: TimelineNode,
  Generated: GeneratedNode
}

class SurfaceErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(): void {
    // A visual must never take the conversation down with it.
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function SurfaceNodeView({ nodeId }: { nodeId: string }): JSX.Element | null {
  const { spec } = useSurfaceContext()
  const node = spec.elements[nodeId]
  if (!node) return null
  const View = NODE_VIEWS[node.type]
  if (!View) return null
  return <View nodeId={nodeId} />
}

function ExpandIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
      <path
        d="M6 2H2v4M10 14h4v-4M14 6V2h-4M2 10v4h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Larger reading surface for a dense visual. Renders the same registry tree a
 * second time inside a dialog, so charts re-measure at the panel's width.
 */
function SurfacePanel({
  label,
  onClose,
  children
}: {
  label: string
  onClose: () => void
  children: ReactNode
}): JSX.Element {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const restoreRef = useRef<Element | null>(null)

  useEffect(() => {
    restoreRef.current = document.activeElement
    panelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (restoreRef.current instanceof HTMLElement) restoreRef.current.focus()
    }
  }, [onClose])

  return createPortal(
    <div className="surface-panel-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        className="surface-panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="surface-panel-close pressable"
          onClick={onClose}
          aria-label="Close expanded visual"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
            <path
              d="M4 4l8 8M12 4l-8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="surface-panel-body">{children}</div>
      </div>
    </div>,
    document.body
  )
}

interface SurfaceRendererProps {
  surface: UiSurface
  interactive: boolean
  onAction: (prompt: string) => void
  /** The panel render is not expandable (it is already the expanded view). */
  allowExpand?: boolean
  inPanel?: boolean
}

/**
 * Registry-based renderer for a validated surface. Unknown node types are
 * never rendered, and a failed visual degrades to its readable description.
 */
export default function SurfaceRenderer({
  surface,
  interactive,
  onAction,
  allowExpand = true,
  inPanel = false
}: SurfaceRendererProps): JSX.Element {
  const validated = useMemo(() => validateUiSpec(surface.spec), [surface.spec])
  const [expanded, setExpanded] = useState(false)
  const close = useCallback(() => setExpanded(false), [])

  const renderNode = useCallback((id: string) => <SurfaceNodeView nodeId={id} />, [])

  const contextValue = useMemo(
    () => ({
      spec: validated.ok ? validated.spec : surface.spec,
      surfaceId: surface.id,
      revision: surface.revision,
      interactive,
      onAction,
      renderNode
    }),
    [validated, surface.spec, surface.id, surface.revision, interactive, onAction, renderNode]
  )

  const fallback = <SurfaceFallback spec={surface.spec} />
  const label = surface.spec.title?.trim() || 'Visual answer'

  if (!validated.ok) {
    return <div className="surface surface--invalid">{fallback}</div>
  }

  return (
    <SurfaceErrorBoundary fallback={<div className="surface surface--invalid">{fallback}</div>}>
      <div className={`surface-frame${inPanel ? ' surface-frame--panel' : ''}`}>
        {allowExpand && !inPanel ? (
          <button
            type="button"
            className="surface-expand pressable"
            onClick={() => setExpanded(true)}
            aria-label={`Expand ${label}`}
            title="Expand"
          >
            <ExpandIcon />
          </button>
        ) : null}

        <div
          className={`surface surface-enter${inPanel ? ' surface--panel' : ''}`}
          data-surface-id={surface.id}
          data-surface-status={surface.status}
        >
          <SurfaceContext.Provider value={contextValue}>
            <SurfaceNodeView nodeId={validated.spec.root} />
          </SurfaceContext.Provider>
        </div>
      </div>

      {expanded ? (
        <SurfacePanel label={label} onClose={close}>
          <SurfaceRenderer
            surface={surface}
            interactive={interactive}
            onAction={onAction}
            allowExpand={false}
            inPanel
          />
        </SurfacePanel>
      ) : null}
    </SurfaceErrorBoundary>
  )
}
