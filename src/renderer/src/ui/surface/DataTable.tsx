import { useMemo, useState } from 'react'

type Alignment = 'left' | 'right'

interface DataTableProps {
  columns: string[]
  rows: string[][]
  align?: Alignment[]
  title?: string
  caption?: string
  /** Show the filter field. Defaults to on once a table has more than 8 rows. */
  searchable?: boolean
}

type SortState = { index: number; direction: 'asc' | 'desc' } | null

/**
 * Accessible table used both by the `Table` node and by the chart's
 * "View data" disclosure. Sorting is presentation-only: it never reaches the
 * model or the conversation.
 */
export default function DataTable({
  columns,
  rows,
  align,
  title,
  caption,
  searchable
}: DataTableProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>(null)

  const showSearch = searchable ?? rows.length > 8

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let next = rows

    if (needle) {
      next = rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(needle)))
    }

    if (sort) {
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
      next = [...next].sort((a, b) => {
        const left = a[sort.index] ?? ''
        const right = b[sort.index] ?? ''
        return sort.direction === 'asc'
          ? collator.compare(left, right)
          : collator.compare(right, left)
      })
    }

    return next
  }, [rows, query, sort])

  const toggleSort = (index: number): void => {
    setSort((current) => {
      if (current?.index !== index) return { index, direction: 'asc' }
      return current.direction === 'asc' ? { index, direction: 'desc' } : null
    })
  }

  const alignment = (index: number): Alignment => align?.[index] ?? 'left'

  return (
    <div className="surface-table-wrap">
      {title ? <p className="surface-table-title">{title}</p> : null}
      {showSearch ? (
        <input
          type="search"
          className="surface-input"
          placeholder="Filter"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={title ? `Filter ${title}` : 'Filter rows'}
        />
      ) : null}

      <div className="surface-table-scroll">
        <table className="surface-table">
          <thead>
            <tr>
              {columns.map((column, index) => {
                const active = sort?.index === index
                return (
                  <th
                    key={`${column}-${index}`}
                    scope="col"
                    style={{ textAlign: alignment(index) }}
                    aria-sort={
                      active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button
                      type="button"
                      className="surface-table-sort"
                      onClick={() => toggleSort(index)}
                      style={{ justifyContent: alignment(index) === 'right' ? 'flex-end' : 'flex-start' }}
                    >
                      <span>{column}</span>
                      {active ? <span aria-hidden>{sort.direction === 'asc' ? '↑' : '↓'}</span> : null}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column, cellIndex) => (
                  <td key={`${column}-${cellIndex}`} style={{ textAlign: alignment(cellIndex) }}>
                    {row[cellIndex] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visibleRows.length === 0 ? <p className="surface-note">No matching rows.</p> : null}
      {caption ? <p className="surface-caption">{caption}</p> : null}
    </div>
  )
}
