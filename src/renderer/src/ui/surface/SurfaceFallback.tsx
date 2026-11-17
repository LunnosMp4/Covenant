import { describeUiSpec } from '../../../../shared/ui/describe'
import { UI_SPEC_VERSION, type UiSpec } from '../../../../shared/ui/spec'

/**
 * The readable answer when a visual cannot be drawn. It is also what screen
 * readers and archives get, so it must stand on its own.
 */
export default function SurfaceFallback({ spec }: { spec: UiSpec }): JSX.Element {
  let text = ''
  try {
    text = describeUiSpec(spec)
  } catch {
    text = ''
  }
  if (!text.trim()) {
    return (
      <p className="surface-fallback" role="status">
        This visual could not be displayed.
      </p>
    )
  }

  return (
    <div className="surface-fallback" role="status">
      {text.split('\n').map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </div>
  )
}

export const EMPTY_SPEC: UiSpec = {
  version: UI_SPEC_VERSION,
  root: '',
  elements: {}
}
