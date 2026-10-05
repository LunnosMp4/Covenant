import { useState, type DragEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Task } from '../types/renderer'
import type { GamificationState, XpToastState } from '../types/renderer'
import { getRankTitle, getXpForLevel } from '../../../shared/tasks/gamification'
import { getThemePalette } from '../constants/theme'
import { getTierLabel, hexToRgba } from '../utils/tasks/gamification'

interface TasksPopupProps {
  tasks: Task[]
  onAdd: (title: string) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (orderedIds: string[]) => void
  onClearCompleted: () => void
  gamification?: GamificationState
  xpToast?: XpToastState | null
  themeGradient?: string
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

function GripIcon(): JSX.Element {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
      <circle cx="2.5" cy="2" r="1.1" />
      <circle cx="7.5" cy="2" r="1.1" />
      <circle cx="2.5" cy="7" r="1.1" />
      <circle cx="7.5" cy="7" r="1.1" />
      <circle cx="2.5" cy="12" r="1.1" />
      <circle cx="7.5" cy="12" r="1.1" />
    </svg>
  )
}

export default function TasksPopup({
  tasks,
  onAdd,
  onToggle,
  onDelete,
  onReorder,
  onClearCompleted,
  gamification,
  xpToast,
  themeGradient
}: TasksPopupProps): JSX.Element {
  const [draft, setDraft] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const palette = getThemePalette(themeGradient)
  const accent = palette.accent
  const levelColor = palette.gamification.levelColor
  const streakColor = palette.gamification.streakColor
  const tierColors = palette.gamification.tierColors
  const rgba = (hex: string, alpha: number): string => hexToRgba(hex, alpha)

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

  const handleDragStart = (event: DragEvent<HTMLDivElement>, id: string): void => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
    setDraggedId(id)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>, id: string): void => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverId((current) => (current === id ? current : id))
  }

  const handleDragLeave = (id: string): void => {
    setDragOverId((current) => (current === id ? null : current))
  }

  const handleDragEnd = (): void => {
    setDraggedId(null)
    setDragOverId(null)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string): void => {
    event.preventDefault()
    const sourceId = event.dataTransfer.getData('text/plain')
    setDraggedId(null)
    setDragOverId(null)

    if (!sourceId || sourceId === targetId) return

    const next = [...tasks]
    const fromIndex = next.findIndex((t) => t.id === sourceId)
    const toIndex = next.findIndex((t) => t.id === targetId)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return

    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    onReorder(next.map((t) => t.id))
  }

  return (
    <div className="relative flex flex-col">
      {gamification && (
        <div className="pb-3">
          <div className="flex items-center justify-between pb-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className="rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-none"
                style={{ borderColor: rgba(levelColor, 0.4), backgroundColor: rgba(levelColor, 0.14), color: levelColor }}
              >
                Lv {gamification.currentLevel}
              </span>
              <span className="text-[11px] font-medium text-neutral-400">{rankTitle}</span>
              {gamification.streakDays > 0 && (
                <span
                  className="rounded border px-1 py-0.5 text-[10px] font-medium leading-none"
                  style={{ borderColor: rgba(streakColor, 0.35), backgroundColor: rgba(streakColor, 0.12), color: rgba(streakColor, 0.9) }}
                  title={`${gamification.streakDays}-day streak`}
                >
                  {gamification.streakDays}-day streak
                </span>
              )}
            </div>
            <span className="text-[10px] tabular-nums" style={{ color: rgba(levelColor, 0.85) }}>
              {gamification.currentXP} / {xpToNext} XP
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full" style={{ backgroundColor: rgba(levelColor, 0.16) }}>
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progressPct}%`,
                background: `linear-gradient(90deg, ${levelColor}, ${rgba(levelColor, 0.65)})`
              }}
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
              onDragOver={(e) => handleDragOver(e, task.id)}
              onDragLeave={() => handleDragLeave(task.id)}
              onDrop={(e) => handleDrop(e, task.id)}
              className={`group flex items-center gap-1.5 rounded-xl px-2 py-2 transition-colors ${
                draggedId === task.id
                  ? 'opacity-40'
                  : dragOverId === task.id
                    ? 'bg-emerald-400/10'
                    : 'hover:bg-white/5'
              }`}
            >
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, task.id)}
                onDragEnd={handleDragEnd}
                className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-neutral-600 opacity-0 transition-opacity hover:text-neutral-300 group-hover:opacity-100 active:cursor-grabbing"
                title="Drag to reorder"
              >
                <GripIcon />
              </div>
              <button
                type="button"
                onClick={() => onToggle(task.id)}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  task.done
                    ? ''
                    : 'border-white/20 text-transparent hover:border-white/40'
                }`}
                style={
                  task.done
                    ? { borderColor: rgba(accent, 0.6), backgroundColor: rgba(accent, 0.25), color: accent }
                    : undefined
                }
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
                      className="rounded border px-1 py-px text-[10px] font-medium leading-none"
                      style={{
                        borderColor: rgba(tierColors[task.tier], 0.4),
                        backgroundColor: rgba(tierColors[task.tier], 0.14),
                        color: tierColors[task.tier]
                      }}
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
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute inset-x-0 bottom-1 z-10 flex justify-center"
          >
            <div
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-medium shadow-lg shadow-black/40"
              style={{
                borderColor: rgba(levelColor, 0.35),
                backgroundColor: 'rgba(12, 12, 12, 0.95)',
                color: rgba(levelColor, 0.95)
              }}
            >
              {xpToast.levelUp && (
                <span style={{ color: '#ffffff' }}>Level {xpToast.newLevel}</span>
              )}
              <span>+{xpToast.xpGained} XP</span>
              {xpToast.streakBonusApplied && xpToast.streakDays > 0 && (
                <span style={{ color: rgba(streakColor, 0.9) }}>· {xpToast.streakDays}-day streak</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
