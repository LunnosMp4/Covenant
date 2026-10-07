import { useEffect, useState } from 'react'
import type { CodeFileDiff } from '../../../shared/code/code'
import DiffView from './DiffView'

interface CodeChangesSidebarProps {
  diffs: CodeFileDiff[]
  totals: { additions: number; deletions: number }
}

export default function CodeChangesSidebar({
  diffs,
  totals
}: CodeChangesSidebarProps): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (diffs.length === 0) {
      setSelected(null)
      return
    }
    setSelected((current) =>
      current && diffs.some((diff) => diff.file === current) ? current : diffs[0].file
    )
  }, [diffs])

  const current = diffs.find((diff) => diff.file === selected) ?? null

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
          Changes
        </span>
        {diffs.length > 0 && (
          <span className="text-[11px] tabular-nums text-neutral-400">
            <span className="text-emerald-400">+{totals.additions}</span>{' '}
            <span className="text-red-400">-{totals.deletions}</span>
          </span>
        )}
      </div>

      <div className="max-h-[40%] shrink-0 overflow-y-auto px-1 chat-scrollbar">
        {diffs.length === 0 && <p className="px-2 py-1 text-xs text-neutral-500">No file changes yet.</p>}
        {diffs.map((diff) => {
          const isActive = diff.file === selected
          return (
            <button
              key={diff.file}
              type="button"
              onClick={() => setSelected(diff.file)}
              className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                isActive ? 'bg-white/10 text-neutral-100' : 'text-neutral-300 hover:bg-white/5'
              }`}
              title={diff.file}
            >
              <span className="min-w-0 flex-1 truncate">{diff.file}</span>
              <span className="shrink-0 tabular-nums text-[11px]">
                <span className="text-emerald-400">+{diff.additions}</span>{' '}
                <span className="text-red-400">-{diff.deletions}</span>
              </span>
            </button>
          )
        })}
      </div>

      {current?.patch ? (
        <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10">
          <div className="code-tool-diff-head">
            <span className="truncate" title={current.file}>
              {current.file}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <DiffView patch={current.patch} file={current.file} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-neutral-500">
          {diffs.length === 0 ? '' : 'No diff available.'}
        </div>
      )}
    </div>
  )
}
