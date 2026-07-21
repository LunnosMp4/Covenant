import { useState } from 'react'
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
import type { LauncherAppTarget } from '../types/launcher-app'
import type { Workflow, WorkflowExecutionState } from '../types/workflow'
import CustomSelect from './CustomSelect'
import WorkflowList from './WorkflowList'

export type ActivePopup = 'appLauncher' | 'workflow' | 'settings'
export type PopupAnchorSide = 'left' | 'right'
type SettingsPopupTab = 'prompt' | 'model'

type PopupIcon = 'grid' | 'folder' | 'doc' | 'bolt' | 'shield' | 'clock'

export interface PopupItem {
  id: string
  title: string
  icon: PopupIcon
  subtitle?: string
  promptText?: string
  iconDataUrl?: string
  appPath?: string
  launchArguments?: string
  appLaunchTargets?: LauncherAppTarget[]
  workflowData?: Workflow
}

const MODULE_LABELS: Record<ActivePopup, string> = {
  appLauncher: 'App Launcher',
  workflow: 'Workflows',
  settings: 'Settings'
}

interface ModulePopupProps {
  activePopup: ActivePopup
  popupRef: RefObject<HTMLDivElement>
  onAddNew: () => void
  onSelectItem: (item: PopupItem) => void
  appLauncherItems?: PopupItem[]
  workflowItems?: PopupItem[]
  settingsItems?: PopupItem[]
  workflowExecutionById?: Record<string, WorkflowExecutionState>
  workflowLogsOpenById?: Record<string, boolean>
  onToggleWorkflowLogs?: (workflowId: string) => void
  anchorSide?: PopupAnchorSide
  themeGradient: string
  selectedSettingsItemId?: string | null
  onClearSelectedSettingsItem?: () => void
  isAppVisible?: boolean
  chatModel?: string
  onSelectChatModel?: (model: string) => void
  onOpenFullSettings?: () => void
  reasoningEffort?: ReasoningEffort
  onSelectReasoningEffort?: (effort: ReasoningEffort) => void
}

function CloseIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
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
  if (icon === 'grid') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    )
  }

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

function getAppBadgeText(title: string): string {
  const trimmedTitle = title.trim()
  return trimmedTitle.slice(0, 2).toUpperCase() || 'AP'
}

function SettingsPopup({
  items,
  selectedItemId,
  onClearSelectedItem,
  onSelectItem,
  onAddNew,
  onOpenFullSettings,
  chatModel,
  onSelectChatModel,
  reasoningEffort,
  onSelectReasoningEffort
}: {
  items: PopupItem[]
  selectedItemId: string | null | undefined
  onClearSelectedItem?: () => void
  onSelectItem: (item: PopupItem) => void
  onAddNew: () => void
  onOpenFullSettings?: () => void
  chatModel: string
  onSelectChatModel?: (model: string) => void
  reasoningEffort: ReasoningEffort
  onSelectReasoningEffort?: (effort: ReasoningEffort) => void
}): JSX.Element {
  const [activeTab, setActiveTab] = useState<SettingsPopupTab>('prompt')
  const supportsExtended = modelSupportsExtendedParams(chatModel || DEFAULT_CHAT_MODEL)

  return (
    <div className="flex flex-col">
      <div className="flex gap-1 px-2 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('prompt')}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'prompt'
              ? 'bg-white/10 text-neutral-100'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          System Prompt
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('model')}
          className={`flex-1 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'model'
              ? 'bg-white/10 text-neutral-100'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          Model
        </button>
      </div>

      {activeTab === 'prompt' ? (
        <div className="space-y-1">
          {items.length === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-5 text-center text-xs text-neutral-500">
              No preprompts saved yet.
            </div>
          ) : (
            items.map((item) =>
              selectedItemId === item.id ? (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0.95, scale: 0.995 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative overflow-hidden rounded-xl border border-emerald-400/70 bg-emerald-400/10 p-3 text-sm text-emerald-50 shadow-[0_0_0_1px_rgba(16,185,129,0.18)]"
                >
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-[-30%] w-[30%] bg-gradient-to-r from-transparent via-emerald-200/20 to-transparent"
                    animate={{ x: ['0%', '420%'] }}
                    transition={{ duration: 2.8, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
                  />
                  <div className="relative flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-300/25 bg-emerald-300/10 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-50">
                      <ItemIcon icon={item.icon} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-emerald-50">{item.title}</span>
                      {item.subtitle && <span className="mt-0.5 truncate text-xs text-emerald-50/65">{item.subtitle}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={onClearSelectedItem}
                      className="shrink-0 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-1.5 text-emerald-50 transition-colors hover:bg-emerald-300/20 hover:text-white"
                      aria-label="Remove selected system prompt"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectItem(item)}
                  disabled={Boolean(selectedItemId)}
                  className={`flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm transition-colors duration-150 ${
                    Boolean(selectedItemId)
                      ? 'cursor-not-allowed border border-neutral-800/90 bg-neutral-950/55 text-neutral-500 opacity-55'
                      : 'cursor-pointer text-neutral-200 hover:bg-white/5'
                  }`}
                  aria-disabled={Boolean(selectedItemId)}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-xs font-semibold uppercase tracking-[0.08em] text-neutral-200">
                    <ItemIcon icon={item.icon} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{item.title}</span>
                    {item.subtitle && <span className="mt-0.5 truncate text-xs text-neutral-500">{item.subtitle}</span>}
                  </span>
                </button>
              )
            )
          )}

          <button
            type="button"
            onClick={onAddNew}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-800/40 p-2.5 text-sm text-neutral-500 transition-colors duration-150 hover:border-neutral-500 hover:text-neutral-300"
          >
            <PlusIcon />
            <span>Add new...</span>
          </button>
        </div>
      ) : (
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
            <p className={`mt-2 text-xs ${supportsExtended ? 'text-neutral-500' : 'text-neutral-600'}`}>
              {supportsExtended
                ? 'Controls how much compute the model spends reasoning.'
                : 'Not supported by this model.'}
            </p>
          </div>
        </div>
      )}

      <div className="mt-2 border-t border-white/5 pt-2">
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
  appLauncherItems,
  workflowItems,
  settingsItems,
  workflowExecutionById = {},
  workflowLogsOpenById = {},
  onToggleWorkflowLogs,
  anchorSide = 'right',
  themeGradient,
  selectedSettingsItemId = null,
  onClearSelectedSettingsItem,
  isAppVisible = true,
  chatModel = DEFAULT_CHAT_MODEL,
  onSelectChatModel,
  onOpenFullSettings,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  onSelectReasoningEffort
}: ModulePopupProps): JSX.Element {
  const items =
    activePopup === 'appLauncher'
      ? appLauncherItems && appLauncherItems.length > 0
        ? appLauncherItems
        : []
      : activePopup === 'workflow'
      ? workflowItems && workflowItems.length > 0
        ? workflowItems
        : []
      : activePopup === 'settings'
      ? settingsItems && settingsItems.length > 0
        ? settingsItems
        : []
      : []

  const emptyMessage =
    activePopup === 'appLauncher'
      ? 'No applications saved yet.'
      : activePopup === 'workflow'
        ? 'No workflows saved yet.'
      : activePopup === 'settings'
        ? 'No preprompts saved yet.'
        : 'No items available.'
  const anchorClass = anchorSide === 'left' ? 'left-0' : 'right-0'
  const popupWidthClass = activePopup === 'workflow' ? 'w-[460px] max-w-[92vw]' : 'w-[320px]'

  return (
    <motion.div
      ref={popupRef}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={`absolute bottom-full ${anchorClass} z-30 mb-3 ${popupWidthClass} rounded-2xl border border-white/10 bg-gradient-to-br ${themeGradient} p-3 shadow-xl shadow-black/40 backdrop-blur-xl`}
      style={{ WebkitBackdropFilter: 'blur(30px)', backdropFilter: 'blur(30px)' }}
    >
      <p className="px-2 pb-2 text-xs uppercase tracking-[0.12em] text-neutral-500">{MODULE_LABELS[activePopup]}</p>

      {activePopup === 'settings' ? (
        <SettingsPopup
          items={items}
          selectedItemId={selectedSettingsItemId}
          onClearSelectedItem={onClearSelectedSettingsItem}
          onSelectItem={onSelectItem}
          onAddNew={onAddNew}
          onOpenFullSettings={onOpenFullSettings}
          chatModel={chatModel}
          onSelectChatModel={onSelectChatModel}
          reasoningEffort={reasoningEffort}
          onSelectReasoningEffort={onSelectReasoningEffort}
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
              isAppVisible={isAppVisible}
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
                  {activePopup === 'appLauncher' ? getAppBadgeText(item.title) : <ItemIcon icon={item.icon} />}
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

      {activePopup !== 'settings' && (
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
