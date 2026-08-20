import { useState } from 'react'
import type { Task } from '../types/task'

interface TasksPopupProps {
  tasks: Task[]
  onAdd: (title: string) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onClearCompleted: () => void
}

function CheckIcon(): JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function TrashIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

function PlusIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export default function TasksPopup({
  tasks,
  onAdd,
  onToggle,
  onDelete,
  onClearCompleted
}: TasksPopupProps): JSX.Element {
  const [draft, setDraft] = useState('')

  const pendingCount = tasks.filter((t) => !t.done).length
  const completedCount = tasks.length - pendingCount

  const handleSubmit = () => {
    const title = draft.trim()
    if (!title) return
    onAdd(title)
    setDraft('')
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 pb-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Add a task…"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-emerald-400/50 focus:outline-none"
          aria-label="New task"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!draft.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-neutral-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Add task"
        >
          <PlusIcon />
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-6 text-center text-xs text-neutral-500">
          Nothing to do. Add your first task above.
        </div>
      ) : (
        <div className="chat-scrollbar max-h-56 space-y-1 overflow-y-auto pr-1">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="group flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-white/5"
            >
              <button
                type="button"
                onClick={() => onToggle(task.id)}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  task.done
                    ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-300'
                    : 'border-white/20 text-transparent hover:border-emerald-400/50'
                }`}
                aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
                aria-pressed={task.done}
              >
                {task.done ? <CheckIcon /> : null}
              </button>
              <span
                className={`min-w-0 flex-1 break-words text-sm ${
                  task.done ? 'text-neutral-500 line-through' : 'text-neutral-100'
                }`}
              >
                {task.title}
              </span>
              <button
                type="button"
                onClick={() => onDelete(task.id)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-neutral-600 opacity-0 transition-all hover:bg-white/10 hover:text-neutral-200 group-hover:opacity-100"
                aria-label="Delete task"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      {tasks.length > 0 && (
        <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-2">
          <span className="text-[11px] text-neutral-500">
            {pendingCount} open{completedCount > 0 ? ` · ${completedCount} done` : ''}
          </span>
          {completedCount > 0 ? (
            <button
              type="button"
              onClick={onClearCompleted}
              className="text-[11px] text-neutral-500 transition-colors hover:text-neutral-300"
            >
              Clear completed
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}
