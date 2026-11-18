import type { TextProps } from '../../../../../shared/ui/spec'
import { useSurfaceContext, type NodeViewProps } from '../types'

export default function TextNode({ nodeId }: NodeViewProps): JSX.Element | null {
  const { spec } = useSurfaceContext()
  const node = spec.elements[nodeId]
  if (!node) return null

  const props = node.props as unknown as TextProps
  const tone = props.tone ?? 'body'

  if (tone === 'heading') {
    return <h3 className="surface-heading">{props.text}</h3>
  }
  if (tone === 'caption') {
    return <p className="surface-caption">{props.text}</p>
  }
  return <p className="surface-body">{props.text}</p>
}
