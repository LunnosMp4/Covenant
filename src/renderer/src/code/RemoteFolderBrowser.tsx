import { useCallback, useEffect, useState } from 'react'
import type { RemoteDirEntry } from '../../../shared/code/connection'
import ModalOverlay from '../ui/ModalOverlay'
import { ArrowUpIcon, FileIcon, FolderIcon } from './icons'

interface RemoteFolderBrowserProps {
  connectionId: string
  connectionName: string
  onClose: () => void
  onSelect: (path: string) => void
}

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

  return (
    <ModalOverlay onClose={onClose} contentClassName="max-w-2xl">
      <div className="flex h-[520px] flex-col rounded-2xl border border-neutral-800 bg-neutral-900/95 p-5 shadow-[0_22px_60px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-neutral-100">Choose a folder</h3>
            <p className="mt-0.5 truncate text-xs text-neutral-500">
              {connectionName} · {path || 'Loading…'}
            </p>
          </div>
          {parent !== null && (
            <button
              type="button"
              onClick={() => void load(parent)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-700 text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
              aria-label="Go to parent folder"
              title="Parent folder"
            >
              <ArrowUpIcon />
            </button>
          )}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950/60 chat-scrollbar">
          {loading && <p className="px-3 py-2 text-xs text-neutral-500">Loading…</p>}
          {!loading && error && <p className="px-3 py-2 text-xs text-red-300">{error}</p>}
          {!loading && !error && entries.length === 0 && (
            <p className="px-3 py-2 text-xs text-neutral-500">Empty folder.</p>
          )}
          {!loading &&
            !error &&
            entries.map((entry) => {
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

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!path || Boolean(error)}
            onClick={() => onSelect(path)}
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Use this folder
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
