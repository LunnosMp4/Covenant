import { motion } from 'framer-motion'
import type { RefObject } from 'react'
import type { ReasoningEffort } from '../../../shared/config'
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_REASONING_EFFORT,
  REASONING_EFFORT_OPTIONS,
  modelSupportsExtendedParams
} from '../../../shared/config'
import type { Workflow, WorkflowExecutionState } from '../types/renderer'
import type { Task } from '../types/renderer'
import type { GamificationState, XpToastState } from '../types/renderer'
import CustomSelect from '../ui/CustomSelect'
import WorkflowList from '../workflow/WorkflowList'
import TasksPopup from '../tasks/TasksPopup'

export type ActivePopup = 'workflow' | 'settings' | 'tasks'
export type PopupAnchorSide = 'left' | 'right'

type PopupIcon = 'folder' | 'doc' | 'bolt' | 'shield' | 'clock'

export interface PopupItem {
  id: string
  title: string
  icon: PopupIcon
  subtitle?: string
  workflowData?: Workflow
}

const MODULE_LABELS: Record<ActivePopup, string> = {
  workflow: 'Workflows',
  settings: 'Model & effort',
  tasks: 'Tasks'
}

interface ModulePopupProps {
  activePopup: ActivePopup
  popupRef: RefObject<HTMLDivElement>
  onAddNew: () => void
  onSelectItem: (item: PopupItem) => void
  workflowItems?: PopupItem[]
  workflowExecutionById?: Record<string, WorkflowExecutionState>
  workflowLogsOpenById?: Record<string, boolean>
  onToggleWorkflowLogs?: (workflowId: string) => void
  anchorSide?: PopupAnchorSide
  themeGradient: string

  chatModel?: string
  onSelectChatModel?: (model: string) => void
  onOpenFullSettings?: () => void
  reasoningEffort?: ReasoningEffort
  onSelectReasoningEffort?: (effort: ReasoningEffort) => void
  tasks?: Task[]
  onAddTask?: (title: string) => void
  onToggleTask?: (id: string) => void
  onDeleteTask?: (id: string) => void
  onReorderTasks?: (orderedIds: string[]) => void
  onClearCompletedTasks?: () => void
  gamification?: GamificationState
  xpToast?: XpToastState | null
}

function PlusIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function ItemIcon({ icon }: { icon: PopupIcon }): JSX.Element {
  if (icon === 'folder') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3V7z" />
        <rect x="3" y="10" width="18" height="10" rx="2" />
      </svg>
    )
  }

  if (icon === 'doc') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </svg>
    )
  }

  if (icon === 'shield') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 3l7 3v6c0 5-3.5 8.7-7 10-3.5-1.3-7-5-7-10V6l7-3z" />
      </svg>
    )
  }

  if (icon === 'clock') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6l4 2" />
      </svg>
    )
  }

  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2L5 13h6l-1 9 8-11h-6l1-9z" />
    </svg>
  )
}

function SettingsPopup({
  onOpenFullSettings,
  chatModel,
  onSelectChatModel,
  reasoningEffort,
  onSelectReasoningEffort
}: {
  onOpenFullSettings?: () => void
  chatModel: string
  onSelectChatModel?: (model: string) => void
  reasoningEffort: ReasoningEffort
  onSelectReasoningEffort?: (effort: ReasoningEffort) => void
}): JSX.Element {
  const supportsExtended = modelSupportsExtendedParams(chatModel || DEFAULT_CHAT_MODEL)

  return (
    <div className="flex flex-col">
      <div className="space-y-3 px-1">
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
            Chat Model
          </label>
          <CustomSelect
            options={CHAT_MODEL_OPTIONS.map((option) => ({
              value: option.id,
              label: option.label
            }))}
            value={chatModel || DEFAULT_CHAT_MODEL}
            onChange={(value) => onSelectChatModel?.(value)}
          />
        </div>

        <div>
          <label className={`mb-2 block text-xs font-medium uppercase tracking-[0.08em] ${supportsExtended ? 'text-neutral-400' : 'text-neutral-600'}`}>
            Reasoning Effort
          </label>
          <CustomSelect
            options={REASONING_EFFORT_OPTIONS.map((effort) => ({
              value: effort,
              label: effort.charAt(0).toUpperCase() + effort.slice(1)
            }))}
            value={reasoningEffort || DEFAULT_REASONING_EFFORT}
            onChange={(value) => onSelectReasoningEffort?.(value as ReasoningEffort)}
            disabled={!supportsExtended}
          />
        </div>
      </div>

      <div className="mt-3 space-y-0.5 border-t border-white/5 pt-2">
        <button
          type="button"
          onClick={onOpenFullSettings}
          className="flex w-full items-center justify-center gap-2 rounded-xl p-2.5 text-xs text-neutral-500 transition-colors duration-150 hover:text-neutral-300"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          <span>Open full settings</span>
        </button>
      </div>
    </div>
  )
}

export default function ModulePopup({
  activePopup,
  popupRef,
  onAddNew,
  onSelectItem,
  workflowItems,
  workflowExecutionById = {},
  workflowLogsOpenById = {},
  onToggleWorkflowLogs,
  anchorSide = 'right',
  themeGradient,
  chatModel = DEFAULT_CHAT_MODEL,
  onSelectChatModel,
  onOpenFullSettings,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  onSelectReasoningEffort,
  tasks = [],
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onReorderTasks,
  onClearCompletedTasks,
  gamification,
  xpToast
}: ModulePopupProps): JSX.Element {
  const items =
    activePopup === 'workflow' && workflowItems && workflowItems.length > 0
      ? workflowItems
      : []

  const emptyMessage = 'No workflows saved yet.'
  const anchorClass = anchorSide === 'left' ? 'left-0' : 'right-0'
  const popupWidthClass =
    activePopup === 'workflow' ? 'w-[460px] max-w-[92vw]' : activePopup === 'tasks' ? 'w-[360px]' : 'w-[320px]'

  return (
    <motion.div
      ref={popupRef}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={`absolute bottom-full ${anchorClass} z-30 mb-3 ${popupWidthClass} rounded-2xl border border-white/10 bg-gradient-to-br ${themeGradient} p-3 surface-shadow texture-surface`}
      data-interactive-surface
    >
      <p className="px-2 pb-2 text-xs uppercase tracking-[0.12em] text-neutral-500">{MODULE_LABELS[activePopup]}</p>

      {activePopup === 'settings' ? (
        <SettingsPopup
          onOpenFullSettings={onOpenFullSettings}
          chatModel={chatModel}
          onSelectChatModel={onSelectChatModel}
          reasoningEffort={reasoningEffort}
          onSelectReasoningEffort={onSelectReasoningEffort}
        />
      ) : activePopup === 'tasks' ? (
        <TasksPopup
          tasks={tasks}
          onAdd={(title) => onAddTask?.(title)}
          onToggle={(id) => onToggleTask?.(id)}
          onDelete={(id) => onDeleteTask?.(id)}
          onReorder={(orderedIds) => onReorderTasks?.(orderedIds)}
          onClearCompleted={() => onClearCompletedTasks?.()}
          gamification={gamification}
          xpToast={xpToast}
          themeGradient={themeGradient}
        />
      ) : (
        <div className="space-y-1">
          {items.length === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-5 text-center text-xs text-neutral-500">
              {emptyMessage}
            </div>
          ) : activePopup === 'workflow' ? (
            <WorkflowList
              items={items}
              workflowExecutionById={workflowExecutionById}
              workflowLogsOpenById={workflowLogsOpenById}
              onRunWorkflow={onSelectItem}
              onToggleLogs={(workflowId) => onToggleWorkflowLogs?.(workflowId)}
            />
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectItem(item)}
                className="flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm transition-colors duration-150 cursor-pointer text-neutral-200 hover:bg-white/5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-xs font-semibold uppercase tracking-[0.08em] text-neutral-200">
                  <ItemIcon icon={item.icon} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.title}</span>
                  {item.subtitle && <span className="mt-0.5 truncate text-xs text-neutral-500">{item.subtitle}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {activePopup !== 'settings' && activePopup !== 'tasks' && (
        <button
          type="button"
          onClick={onAddNew}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-800/40 p-3 text-sm text-neutral-500 transition-colors duration-150 hover:border-neutral-500 hover:text-neutral-300"
        >
          <PlusIcon />
          <span>Add new...</span>
        </button>
      )}
    </motion.div>
  )
}
