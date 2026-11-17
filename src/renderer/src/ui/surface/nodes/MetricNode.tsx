import { formatChartValue } from '../../../../../shared/ui/chart'
import type { MetricProps } from '../../../../../shared/ui/spec'
import { useSurfaceContext, type NodeViewProps } from '../types'

function deltaClass(sentiment: 'positive' | 'negative' | 'neutral' | undefined): string {
  if (sentiment === 'positive') return 'surface-metric-delta surface-metric-delta--positive'
  if (sentiment === 'negative') return 'surface-metric-delta surface-metric-delta--negative'
  return 'surface-metric-delta'
}

export default function MetricNode({ nodeId }: NodeViewProps): JSX.Element | null {
  const { spec } = useSurfaceContext()
  const node = spec.elements[nodeId]
  if (!node) return null

  const props = node.props as unknown as MetricProps
  const columns = Math.min(4, Math.max(1, props.items.length))

  return (
    <div
      className="surface-metric-row"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {props.items.map((item, index) => (
        <div className="surface-metric" key={`${item.label}-${index}`}>
          <span className="surface-metric-label">{item.label}</span>
          <span className="surface-metric-value">
            {formatChartValue(item.value, item.format ?? 'number')}
            {item.unit ? <span className="surface-metric-unit"> {item.unit}</span> : null}
          </span>
          {item.delta ? (
            <span className={deltaClass(item.delta.sentiment)}>
              {item.delta.value > 0 ? '↑' : item.delta.value < 0 ? '↓' : '→'}{' '}
              {formatChartValue(Math.abs(item.delta.value), 'number')}
              {item.delta.suffix ?? '%'}
            </span>
          ) : null}
          {item.hint ? <span className="surface-metric-hint">{item.hint}</span> : null}
        </div>
      ))}
    </div>
  )
}
