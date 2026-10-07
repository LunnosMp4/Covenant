import { useCallback, useEffect, useState } from 'react'
import type { RemoteDirEntry } from '../../../shared/code/connection'
import { ArrowUpIcon, CloseIcon, FileIcon, FolderIcon } from './icons'

interface RemoteFolderBrowserProps {
  connectionId: string
  connectionName: string
  onClose: () => void
  onSelect: (path: string) => void
}

const SECONDARY_BUTTON =
  'rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50'
const PRIMARY_BUTTON =
  'rounded-xl px-3.5 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'

export default function RemoteFolderBrowser({
  connectionId,
  connectionName,
  onClose,
  onSelect
}: RemoteFolderBrowserProps): JSX.Element {
  const [path, setPath] = useState<string>('')
  const [parent, setParent] = useState<string | null>(null)
  const [entries, setEntries] = useState<RemoteDirEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hideDotfolders, setHideDotfolders] = useState(true)

  const load = useCallback(
    async (target?: string) => {
      const api = window.api?.code
      if (!api) return
      setLoading(true)
      setError(null)
      const result = await api.browseRemote(connectionId, target)
      setLoading(false)
      if (!result.success) {
        setError(result.error)
        return
      }
      setPath(result.path)
      setParent(result.parent)
      setEntries(result.entries)
    },
    [connectionId]
  )

  useEffect(() => {
    void load()
  }, [load])

  const visibleEntries = hideDotfolders
    ? entries.filter((entry) => !entry.name.startsWith('.'))
    : entries

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-neutral-100">Choose a folder</h3>
          <p className="mt-0.5 truncate text-xs text-neutral-500">
            {connectionName} · {path || 'Loading…'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {parent !== null && (
            <button
              type="button"
              onClick={() => void load(parent)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
              aria-label="Go to parent folder"
              title="Parent folder"
            >
              <ArrowUpIcon />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setHideDotfolders((value) => !value)}
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition-colors ${
            hideDotfolders
              ? 'bg-white/10 text-neutral-200'
              : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
          }`}
          aria-pressed={hideDotfolders}
          title="Folders whose name starts with a dot (e.g. .config) are hidden"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              hideDotfolders ? 'bg-[var(--chat-accent)]' : 'bg-neutral-600'
            }`}
          />
          Hide dot folders
        </button>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] chat-scrollbar">
        {loading && <p className="px-3 py-2 text-xs text-neutral-500">Loading…</p>}
        {!loading && error && <p className="px-3 py-2 text-xs text-red-300">{error}</p>}
        {!loading && !error && visibleEntries.length === 0 && (
          <p className="px-3 py-2 text-xs text-neutral-500">
            {entries.length > 0 ? 'No folders to show.' : 'Empty folder.'}
          </p>
        )}
        {!loading &&
          !error &&
          visibleEntries.map((entry) => {
            const isDir = entry.type === 'dir'
            return (
              <button
                key={entry.path}
                type="button"
                disabled={!isDir}
                onClick={() => isDir && void load(entry.path)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors ${
                  isDir ? 'text-neutral-200 hover:bg-white/5' : 'cursor-default text-neutral-500'
                }`}
              >
                <span className={isDir ? 'text-neutral-400' : 'text-neutral-600'}>
                  {isDir ? <FolderIcon /> : <FileIcon />}
                </span>
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              </button>
            )
          })}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 border-t border-white/5 pt-3">
        <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!path || Boolean(error)}
          onClick={() => onSelect(path)}
          className={PRIMARY_BUTTON}
          style={{ background: 'var(--chat-accent)', color: 'var(--chat-on-accent)' }}
        >
          Use this folder
        </button>
      </div>
    </div>
  )
}
