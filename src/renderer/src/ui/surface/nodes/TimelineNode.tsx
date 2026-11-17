import type { TimelineProps } from '../../../../../shared/ui/spec'
import { useSurfaceContext, type NodeViewProps } from '../types'

/**
 * Ordered plan/runbook. `steps` numbers each row, `timeline` shows dots; both
 * carry an optional right-aligned meta note and a state marker.
 */
export default function TimelineNode({ nodeId }: NodeViewProps): JSX.Element | null {
  const { spec } = useSurfaceContext()
  const node = spec.elements[nodeId]
  if (!node) return null

  const props = node.props as unknown as TimelineProps
  const items = Array.isArray(props.items) ? props.items : []
  const numbered = props.variant === 'steps'

  return (
    <section className="surface-section">
      {props.title ? <h3 className="surface-title">{props.title}</h3> : null}
      {props.caption ? <p className="surface-caption">{props.caption}</p> : null}

      <ol className={`surface-timeline${numbered ? ' surface-timeline--steps' : ''}`}>
        {items.map((item, index) => (
          <li
            key={`${item.label}-${index}`}
            className={`surface-timeline-item surface-timeline-item--${item.state ?? 'todo'}`}
          >
            <span className="surface-timeline-marker" aria-hidden={numbered ? undefined : true}>
              {numbered ? index + 1 : null}
            </span>
            <div className="surface-timeline-body">
              <div className="surface-timeline-head">
                <span className="surface-timeline-label">{item.label}</span>
                {item.meta ? <span className="surface-timeline-meta">{item.meta}</span> : null}
              </div>
              {item.detail ? <p className="surface-timeline-detail">{item.detail}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
