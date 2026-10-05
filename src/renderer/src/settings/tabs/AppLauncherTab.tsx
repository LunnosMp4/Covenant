import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useAnimationControls, type Transition } from 'framer-motion'
import { WINDOW_ENTER_TRANSITION, WINDOW_EXIT_TRANSITION } from '../../constants/motion'
import AppFormModal from '../modals/AppFormModal'
import ConfirmDeleteModal from '../../ui/ConfirmDeleteModal'
import CustomSelect from '../../ui/CustomSelect'
import McpServerFormModal from '../modals/McpServerFormModal'
import McpServersTab, { type McpPreset } from './McpServersTab'
import PrepromptFormModal from '../modals/PrepromptFormModal'
import WorkflowFormModal from '../../workflow/WorkflowFormModal'
import PasteSettingsTab from '../../paste/PasteSettingsTab'
import UsageTab from './UsageTab'
import {
  DEFAULT_TERMINAL_FONT,
  normalizeTerminalFont
} from '../../constants/terminalFonts'
import {
  DEFAULT_THEME_GRADIENT,
  THEME_OPTIONS,
  getThemeMode,
  normalizeThemeGradient
} from '../../constants/theme'
import type { AppConfig, ButtonVisibility, ReasoningEffort, ShortcutConfig } from '../../../../shared/config'
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL, DEFAULT_REASONING_EFFORT, DEFAULT_SHORTCUTS, DEFAULT_TEXTURE_INTENSITY, MAX_TEXTURE_INTENSITY, REASONING_EFFORT_OPTIONS, TEXTURE_MAX_OPACITY, modelSupportsExtendedParams, modelSupportsWebSearch } from '../../../../shared/config'
import type { UpdateStatus } from '../../../../shared/system/update'
import {
  DEFAULT_PASTE_SETTINGS,
  normalizePasteManagerSettings,
  type PasteManagerSettings
} from '../../../../shared/paste/paste'
import type { McpServer } from '../../../../shared/mcp/mcp'
import type { LauncherApp } from '../../types/renderer'
import type { Preprompt } from '../../types/renderer'
import type { Workflow } from '../../types/renderer'
import { getAppBadgeText } from '../../utils/helpers'
import { formatTargetsSummary, normalizeLaunchTargets } from '../../utils/launcher/launcherTargets'
import { MinimalistToggle, SectionCard } from '../primitives'
import { ShortcutRecorder } from '../shortcutRecorder'
import { getAppTargetsSummary, formatUpdateBytes, getUpdateStatusLabel } from '../helpers'

interface AppLauncherTabProps {
  apps: LauncherApp[]
  isLoading: boolean
  feedbackMessage: string
  onAdd: () => void
  onEdit: (launcherApp: LauncherApp) => void
  onDelete: (launcherApp: LauncherApp) => void
}

export default function AppLauncherTab({
  apps,
  isLoading,
  feedbackMessage,
  onAdd,
  onEdit,
  onDelete
}: AppLauncherTabProps): JSX.Element {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="mt-1 text-sm text-neutral-400">Configure shortcuts for apps launched by the App Launcher button.</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
        >
          Add Application
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/80">
        <div className="grid grid-cols-[80px_1fr_2fr_160px] border-b border-neutral-800 bg-neutral-900 px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
          <span>Icon</span>
          <span>App Name</span>
          <span>Apps</span>
          <span className="text-right">Actions</span>
        </div>

        {isLoading ? (
          <div className="px-4 py-6 text-sm text-neutral-400">Loading applications...</div>
        ) : null}

        {!isLoading && apps.length === 0 ? (
          <div className="px-4 py-6 text-sm text-neutral-500">No applications saved yet. Add your first launcher shortcut.</div>
        ) : null}

        {!isLoading &&
          apps.map((appItem) => (
          <div
            key={appItem.id}
            className="grid grid-cols-[80px_1fr_2fr_160px] items-center border-b border-neutral-800 px-4 py-3 text-sm last:border-b-0"
          >
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-200">
              {getAppBadgeText(appItem.title)}
            </span>
            <span className="text-neutral-100">{appItem.title}</span>
            <span className="truncate text-neutral-400">{getAppTargetsSummary(appItem)}</span>
            <span className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onEdit(appItem)}
                className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(appItem)}
                className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-300"
              >
                Delete
              </button>
            </span>
          </div>
        ))}
      </div>

      {feedbackMessage ? <p className="text-xs text-emerald-300">{feedbackMessage}</p> : null}
    </div>
  )
}
