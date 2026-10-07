import { useEffect, useRef, useState } from 'react'
import type { CodeConnection } from '../../../shared/code/connection'
import { ChevronDownIcon, SpinnerIcon } from '../ui/icons'
import { PlusIcon, ServerIcon } from './icons'

interface CodeConnectionMenuProps {
  connections: CodeConnection[]
  activeConnectionId: string
  busy?: boolean
  onSelect: (connectionId: string) => void
  onAdd: () => void
  onManage: () => void
}

const ROW =
  'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors'

function connectionSubtitle(connection: CodeConnection): string {
  if (connection.kind === 'local') return 'Local'
  return `${connection.username}@${connection.host}`
}

export default function CodeConnectionMenu({
  connections,
  activeConnectionId,
  busy = false,
  onSelect,
  onAdd,
  onManage
}: CodeConnectionMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent): void => {
      if (containerRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const active = connections.find((connection) => connection.id === activeConnectionId) ?? connections[0]

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex h-8 min-w-0 items-center gap-2 rounded-lg border px-2.5 text-xs transition-colors ${
          open
            ? 'border-white/20 bg-white/10 text-neutral-100'
            : 'border-white/10 text-neutral-200 hover:border-white/20 hover:bg-white/10'
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={active ? connectionSubtitle(active) : undefined}
      >
        <span className="shrink-0 text-neutral-400">
          {busy ? <SpinnerIcon /> : <ServerIcon />}
        </span>
        <span className="min-w-0 max-w-[160px] truncate">{active?.name ?? 'Select machine'}</span>
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-30 w-72 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/95 shadow-xl shadow-black/50">
          <div className="max-h-72 overflow-y-auto p-1 chat-scrollbar">
            <div className="flex items-center justify-between px-2 pb-1 pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                Machines
              </span>
              <button
                type="button"
                onClick={() => {
                  onAdd()
                  setOpen(false)
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
                aria-label="Add machine"
                title="Add machine over SSH"
              >
                <PlusIcon />
              </button>
            </div>
            {connections.map((connection) => {
              const isActive = connection.id === activeConnectionId
              return (
                <button
                  key={connection.id}
                  type="button"
                  onClick={() => {
                    onSelect(connection.id)
                    setOpen(false)
                  }}
                  className={`${ROW} ${
                    isActive ? 'bg-white/10 text-neutral-100' : 'text-neutral-300 hover:bg-white/5'
                  }`}
                >
                  <span className={`shrink-0 ${isActive ? 'text-neutral-300' : 'text-neutral-500'}`}>
                    <ServerIcon />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{connection.name}</span>
                    <span className="block truncate text-[11px] text-neutral-500">
                      {connectionSubtitle(connection)}
                    </span>
                  </span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => {
                onManage()
                setOpen(false)
              }}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-[12px] text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-200"
            >
              Manage machines…
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
