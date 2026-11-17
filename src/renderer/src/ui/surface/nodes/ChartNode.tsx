import type { ChartData } from '../../../../../shared/ui/chart'
import ChartWidget from '../charts/ChartWidget'
import { useSurfaceContext, type NodeViewProps } from '../types'

export default function ChartNode({ nodeId }: NodeViewProps): JSX.Element | null {
  const { spec } = useSurfaceContext()
  const node = spec.elements[nodeId]
  if (!node) return null

  const data = node.props as unknown as ChartData

  return (
    <section className="surface-section">
      <header className="surface-header">
        <h3 className="surface-title">{data.title}</h3>
        {data.description ? <p className="surface-description">{data.description}</p> : null}
      </header>
      <ChartWidget data={data} />
    </section>
  )
}
