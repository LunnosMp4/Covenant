import type { CompareProps } from '../../../../../shared/ui/spec'
import { useSurfaceContext, type NodeViewProps } from '../types'

export default function CompareNode({ nodeId }: NodeViewProps): JSX.Element | null {
  const { spec } = useSurfaceContext()
  const node = spec.elements[nodeId]
  if (!node) return null

  const props = node.props as unknown as CompareProps

  return (
    <section className="surface-section">
      {props.title ? <h3 className="surface-title">{props.title}</h3> : null}
      {props.caption ? <p className="surface-caption">{props.caption}</p> : null}

      <div className="surface-table-scroll">
        <table className="surface-table surface-table--compare">
          <thead>
            <tr>
              <th scope="col" className="surface-table-corner" />
              {props.options.map((option) => (
                <th scope="col" key={option}>
                  {option}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.criteria.map((criterion) => (
              <tr key={criterion.label}>
                <th scope="row">{criterion.label}</th>
                {criterion.values.map((value, index) => (
                  <td key={`${criterion.label}-${index}`}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
