import { AnimatePresence, motion } from 'framer-motion'
import type { PopupItem } from './ModulePopup'
import type { WorkflowExecutionState } from '../types/workflow'

interface WorkflowListProps {
  items: PopupItem[]
  workflowExecutionById: Record<string, WorkflowExecutionState>
  workflowLogsOpenById: Record<string, boolean>
  onRunWorkflow: (item: PopupItem) => void
  onToggleLogs: (workflowId: string) => void
}

function StatusSpinner(): JSX.Element {
  return (
    <svg
      className="animate-spin"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" className="opacity-30" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  )
}

function WorkflowIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2L5 13h6l-1 9 8-11h-6l1-9z" />
    </svg>
  )
}

const statusAnimation = {
  idle: { x: 0, scale: 1 },
  running: { x: 0, scale: 1 },
  success: {
    x: 0,
    scale: [1, 1.025, 1],
    transition: {
      duration: 0.45,
      times: [0, 0.45, 1]
    }
  },
  error: {
    x: [0, -5, 5, -4, 4, 0],
    scale: 1,
    transition: {
      duration: 0.35
    }
  }
}

function getStatusContainerClass(status: WorkflowExecutionState['status']): string {
  if (status === 'running') {
    return 'border-amber-400/60 bg-amber-500/12 text-amber-100'
  }

  if (status === 'success') {
    return 'border-emerald-400/70 bg-emerald-500/14 text-emerald-100'
  }

  if (status === 'error') {
    return 'border-rose-500/80 bg-rose-500/16 text-rose-100'
  }

  return 'border-white/10 bg-white/[0.03] text-neutral-200'
}

function getStatusLabel(status: WorkflowExecutionState['status']): string {
  if (status === 'running') return 'Running'
  if (status === 'success') return 'Success'
  if (status === 'error') return 'Error'
  return 'Idle'
}

export default function WorkflowList({
  items,
  workflowExecutionById,
  workflowLogsOpenById,
  onRunWorkflow,
  onToggleLogs
}: WorkflowListProps): JSX.Element {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const workflowState = workflowExecutionById[item.id] ?? { status: 'idle', logs: [] }
        const isLogsVisible = Boolean(workflowLogsOpenById[item.id])
        const canShowLogsButton = workflowState.status === 'running' || workflowState.status === 'error'
        const containerClass = getStatusContainerClass(workflowState.status)

        return (
          <div key={item.id} className="space-y-1.5">
            <motion.div
              initial={false}
              variants={statusAnimation}
              animate={workflowState.status}
              className={`relative overflow-hidden rounded-xl border ${containerClass}`}
            >
              {workflowState.status === 'running' ? (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-amber-300/25 to-transparent"
                  initial={{ x: '-120%' }}
                  animate={{ x: '120%' }}
                  transition={{
                    duration: 1.1,
                    repeat: Infinity,
                    ease: 'linear'
                  }}
                />
              ) : null}

              <button
                type="button"
                onClick={() => onRunWorkflow(item)}
                className="relative z-10 flex w-full items-center gap-3 p-3 text-left text-sm transition-colors duration-150 hover:bg-white/5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-xs font-semibold uppercase tracking-[0.08em] text-amber-100">
                  <WorkflowIcon />
                </span>

                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{item.title}</span>
                  <span className="mt-0.5 truncate text-xs text-neutral-400">{item.subtitle}</span>
                </span>

                <span className="mr-2 hidden items-center gap-1 text-xs uppercase tracking-[0.06em] text-neutral-300 sm:inline-flex">
                  {workflowState.status === 'running' ? <StatusSpinner /> : null}
                  <span>{getStatusLabel(workflowState.status)}</span>
                </span>

                <AnimatePresence>
                  {canShowLogsButton ? (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.18 }}
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleLogs(item.id)
                      }}
                      className="rounded-md border border-white/20 bg-black/35 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-200 hover:border-white/40 hover:bg-black/55"
                    >
                      {isLogsVisible ? 'Hide Logs' : 'Show Logs'}
                    </motion.button>
                  ) : null}
                </AnimatePresence>
              </button>
            </motion.div>

            <AnimatePresence initial={false}>
              {isLogsVisible && (workflowState.status === 'running' || workflowState.status === 'error') ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="bg-black p-2 font-mono text-xs overflow-y-auto max-h-32 whitespace-pre-wrap break-words rounded-lg border border-neutral-800 text-neutral-300">
                    {workflowState.logs.length > 0 ? (
                      workflowState.logs.map((line, index) => (
                        <p key={`${item.id}-${index}`} className="leading-5">
                          {line}
                        </p>
                      ))
                    ) : (
                      <p className="text-neutral-500">Waiting for logs...</p>
                    )}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
