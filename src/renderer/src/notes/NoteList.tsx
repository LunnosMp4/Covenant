import type { NoteMeta } from '../../../shared/notes/note'
import { formatDuration } from '../../../shared/notes/meeting'
import { formatRelativeTime } from '../utils/paste/pasteFormat'
import { PinIcon, SearchIcon, SparklesIcon } from '../paste/PasteIcons'
import { MeetingIcon } from '../ui/icons'

export type NoteFilter = 'all' | 'note' | 'meeting'

const FILTERS: Array<{ id: NoteFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'note', label: 'Notes' },
  { id: 'meeting', label: 'Meetings' }
]

interface NoteListProps {
  notes: NoteMeta[]
  selectedId: string | null
  query: string
  filter: NoteFilter
  isRecording: boolean
  aiOpen: boolean
  aiEnabled: boolean
  onQueryChange: (value: string) => void
  onFilterChange: (filter: NoteFilter) => void
  onSelect: (id: string) => void
  onNewNote: () => void
  onNewMeeting: () => void
  onToggleAi: () => void
}

function meetingStatusLabel(meta: NoteMeta): string | null {
  switch (meta.meetingStatus) {
    case 'recording':
      return 'Recording'
    case 'transcribing':
      return 'Transcribing'
    case 'summarizing':
      return 'Summarizing'
    case 'error':
      return 'Needs attention'
    default:
      return null
  }
}

export default function NoteList({
  notes,
  selectedId,
  query,
  filter,
  isRecording,
  aiOpen,
  aiEnabled,
  onQueryChange,
  onFilterChange,
  onSelect,
  onNewNote,
  onNewMeeting,
  onToggleAi
}: NoteListProps): JSX.Element {
  return (
    <aside className="flex w-[290px] shrink-0 flex-col border-r border-white/5">
      <div className="space-y-2 border-b border-white/5 p-3">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onNewNote}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-medium text-neutral-200 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            + Note
          </button>
          <button
            type="button"
            onClick={onNewMeeting}
            className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors ${
              isRecording
                ? 'border-red-400/30 bg-red-500/15 text-red-300'
                : 'border-white/10 bg-white/[0.04] text-neutral-200 hover:border-white/20 hover:bg-white/10'
            }`}
          >
            <MeetingIcon className={isRecording ? 'animate-pulse' : undefined} />
            Meet
          </button>
          <button
            type="button"
            onClick={onToggleAi}
            disabled={!aiEnabled}
            title={aiEnabled ? 'Toggle note AI' : 'Open a note or switch to Recap to use AI'}
            className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              aiOpen && aiEnabled
                ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
                : 'border-white/10 bg-white/[0.04] text-neutral-200 hover:border-white/20 hover:bg-white/10'
            }`}
          >
            <SparklesIcon />
            AI
          </button>
        </div>

        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search notes…"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-emerald-400/50"
            aria-label="Search notes"
          />
        </div>

        <div className="flex flex-wrap gap-1">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onFilterChange(entry.id)}
              className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                filter === entry.id
                  ? 'bg-white/10 text-neutral-100'
                  : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        {notes.length === 0 ? (
          <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-8 text-center text-xs text-neutral-500">
            {query.trim() ? 'No matches.' : 'No notes yet. Create one to get started.'}
          </div>
        ) : (
          notes.map((meta) => {
            const active = meta.id === selectedId
            const status = meetingStatusLabel(meta)
            return (
              <button
                key={meta.id}
                type="button"
                onClick={() => onSelect(meta.id)}
                className={`mb-1 flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  active ? 'bg-emerald-400/10 ring-1 ring-emerald-400/30' : 'hover:bg-white/5'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {meta.pinned && <PinIcon filled className="shrink-0 text-amber-300" />}
                  <span className="truncate text-sm text-neutral-200">{meta.title}</span>
                  {meta.kind === 'meeting' && (
                    <span
                      className="shrink-0 rounded border border-white/10 p-1 text-neutral-400"
                      title="Meeting"
                    >
                      <MeetingIcon />
                    </span>
                  )}
                </span>
                <span className="line-clamp-2 text-[11px] leading-snug text-neutral-500">
                  {meta.preview || 'Empty note'}
                </span>
                <span className="flex items-center justify-between gap-2 text-[10px] text-neutral-500">
                  <span className="flex items-center gap-1.5">
                    {formatRelativeTime(meta.updatedAt)}
                    {meta.meetingDurationMs ? ` · ${formatDuration(meta.meetingDurationMs)}` : ''}
                  </span>
                  {status && (
                    <span
                      className={`shrink-0 rounded px-1 py-0.5 ${
                        meta.meetingStatus === 'recording'
                          ? 'bg-red-500/15 text-red-300'
                          : meta.meetingStatus === 'error'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-white/5 text-neutral-400'
                      }`}
                    >
                      {status}
                    </span>
                  )}
                </span>
              </button>
            )
          })
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/5 px-3 py-2 text-[11px] text-neutral-500">
        <span>{notes.length} note{notes.length === 1 ? '' : 's'}</span>
        <span>Esc close</span>
      </div>
    </aside>
  )
}
