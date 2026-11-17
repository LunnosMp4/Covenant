import { Component, useCallback, useMemo, type ComponentType, type ReactNode } from 'react'
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

interface SurfaceRendererProps {
  surface: UiSurface
  interactive: boolean
  onAction: (prompt: string) => void
}

/**
 * Registry-based renderer for a validated surface. Unknown node types are
 * never rendered, and a failed visual degrades to its readable description.
 */
export default function SurfaceRenderer({
  surface,
  interactive,
  onAction
}: SurfaceRendererProps): JSX.Element {
  const validated = useMemo(
    () => validateUiSpec(surface.spec, { mode: 'replay' }),
    [surface.spec]
  )

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

  if (!validated.ok) {
    return <div className="surface surface--invalid">{fallback}</div>
  }

  return (
    <SurfaceErrorBoundary fallback={<div className="surface surface--invalid">{fallback}</div>}>
      <SurfaceContext.Provider value={contextValue}>
        <div
          className="surface surface-enter"
          data-surface-id={surface.id}
          data-surface-status={surface.status}
        >
          <SurfaceNodeView nodeId={validated.spec.root} />
        </div>
      </SurfaceContext.Provider>
    </SurfaceErrorBoundary>
  )
}
