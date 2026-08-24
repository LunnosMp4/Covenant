import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Task } from '../types/task'
import type { GamificationState, XpToastState } from '../types/gamification'
import { getRankTitle, getXpForLevel } from '../../../shared/gamification'
import { getTierBadgeClass, getTierLabel } from '../utils/gamification'

interface TasksPopupProps {
  tasks: Task[]
  onAdd: (title: string) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onClearCompleted: () => void
  gamification?: GamificationState
  xpToast?: XpToastState | null
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
  onClearCompleted,
  gamification,
  xpToast
}: TasksPopupProps): JSX.Element {
  const [draft, setDraft] = useState('')

  const pendingCount = tasks.filter((t) => !t.done).length
  const completedCount = tasks.length - pendingCount

  const xpForCurrent = gamification ? getXpForLevel(gamification.currentLevel) : 0
  const xpForNext = gamification ? getXpForLevel(gamification.currentLevel + 1) : 0
  const xpToNext = xpForNext - xpForCurrent
  const progressPct =
    gamification && xpToNext > 0 ? Math.min(100, (gamification.currentXP / xpToNext) * 100) : 0
  const rankTitle = gamification ? getRankTitle(gamification.currentLevel) : ''

  const handleSubmit = () => {
    const title = draft.trim()
    if (!title) return
    onAdd(title)
    setDraft('')
  }

  return (
    <div className="relative flex flex-col">
      {gamification && (
        <div className="pb-3">
          <div className="flex items-center justify-between pb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-amber-300">
                Lv {gamification.currentLevel}
              </span>
              <span className="text-[11px] font-medium text-neutral-400">{rankTitle}</span>
              {gamification.streakDays > 0 && (
                <span className="text-[11px] leading-none text-orange-300/90" title={`${gamification.streakDays}-day streak`}>
                  🔥 {gamification.streakDays}
                </span>
              )}
            </div>
            <span className="text-[10px] tabular-nums text-neutral-500">
              {gamification.currentXP} / {xpToNext} XP
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

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
              <div className="min-w-0 flex-1">
                <span
                  className={`block break-words text-sm ${
                    task.done ? 'text-neutral-500 line-through' : 'text-neutral-100'
                  }`}
                >
                  {task.title}
                </span>
                {task.evaluating ? (
                  <span className="task-shimmer mt-0.5 inline-block text-[10px] text-neutral-500">
                    Evaluating…
                  </span>
                ) : task.tier ? (
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span
                      className={`rounded border px-1 py-px text-[10px] font-medium leading-none ${getTierBadgeClass(task.tier)}`}
                    >
                      {getTierLabel(task.tier)} · +{task.xpReward ?? 0} XP
                    </span>
                    {typeof task.estimatedMinutes === 'number' && (
                      <span className="text-[10px] leading-none text-neutral-600">
                        ~{task.estimatedMinutes}m
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
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

      <AnimatePresence>
        {xpToast && (
          <motion.div
            key={xpToast.id}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute -top-1 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-400/30 bg-neutral-900/95 px-3 py-1 text-[11px] font-medium text-amber-200 shadow-lg shadow-black/40"
          >
            {xpToast.levelUp && (
              <span className="text-emerald-300">Lv {xpToast.newLevel}!</span>
            )}
            <span>+{xpToast.xpGained} XP</span>
            {xpToast.streakBonusApplied && xpToast.streakDays > 0 && (
              <span className="text-orange-300/90">🔥 {xpToast.streakDays}d</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
