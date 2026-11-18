import type { ActionsProps } from '../../../../../shared/ui/spec'
import { useSurfaceContext, type NodeViewProps } from '../types'

export default function ActionsNode({ nodeId }: NodeViewProps): JSX.Element | null {
  const { spec, interactive, onAction } = useSurfaceContext()
  const node = spec.elements[nodeId]
  if (!node) return null

  const props = node.props as unknown as ActionsProps

  return (
    <div className="surface-actions">
      {props.title ? <p className="surface-caption">{props.title}</p> : null}
      <div
        className="surface-actions-row"
        title={interactive ? undefined : 'Only the latest answer can act.'}
      >
        {props.prompts.map((prompt, index) => (
          <button
            key={`${prompt.label}-${index}`}
            type="button"
            className={`surface-action pressable ${
              prompt.variant === 'primary' ? 'surface-action--primary' : ''
            }`}
            disabled={!interactive}
            title={interactive ? prompt.prompt : undefined}
            onClick={() => onAction(prompt.prompt)}
          >
            {prompt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
