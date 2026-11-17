import type { StackProps } from '../../../../../shared/ui/spec'
import { useSurfaceContext, type NodeViewProps } from '../types'

export default function StackNode({ nodeId }: NodeViewProps): JSX.Element | null {
  const { spec, renderNode } = useSurfaceContext()
  const node = spec.elements[nodeId]
  if (!node) return null

  const props = node.props as unknown as StackProps
  const children = Array.isArray(props.children) ? props.children : []

  return (
    <div className={`surface-stack surface-stack--${props.gap ?? 'md'}`}>
      {children.map((child) => (
        <div className="surface-stack-item" key={child}>
          {renderNode(child)}
        </div>
      ))}
    </div>
  )
}
