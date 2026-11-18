import type { GeneratedSource } from '../../../../../shared/ui/generated'
import GeneratedFrame from '../generated/GeneratedFrame'
import { useSurfaceContext, type NodeViewProps } from '../types'

export default function GeneratedNode({ nodeId }: NodeViewProps): JSX.Element | null {
  const { spec, surfaceId, revision, interactive, onAction } = useSurfaceContext()
  const node = spec.elements[nodeId]
  if (!node) return null

  const source = node.props as unknown as GeneratedSource

  return (
    <section className="surface-section">
      <header className="surface-header">
        <h3 className="surface-title">{source.title}</h3>
      </header>
      <GeneratedFrame
        identity={`${surfaceId}:${revision}:${nodeId}`}
        source={source}
        interactive={interactive}
        onAction={onAction}
      />
    </section>
  )
}
