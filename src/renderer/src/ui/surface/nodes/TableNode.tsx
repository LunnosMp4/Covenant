import type { TableProps } from '../../../../../shared/ui/spec'
import DataTable from '../DataTable'
import { useSurfaceContext, type NodeViewProps } from '../types'

export default function TableNode({ nodeId }: NodeViewProps): JSX.Element | null {
  const { spec } = useSurfaceContext()
  const node = spec.elements[nodeId]
  if (!node) return null

  const props = node.props as unknown as TableProps

  return (
    <DataTable
      columns={props.columns}
      rows={props.rows}
      align={props.align}
      title={props.title}
      caption={props.caption}
      searchable={props.searchable}
    />
  )
}
