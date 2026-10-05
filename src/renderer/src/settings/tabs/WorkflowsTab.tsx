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

interface WorkflowsTabProps {
  workflows: Workflow[]
  isLoading: boolean
  feedbackMessage: string
  onAdd: () => void
  onEdit: (workflow: Workflow) => void
  onDelete: (workflow: Workflow) => void
}

export default function WorkflowsTab({
  workflows,
  isLoading,
  feedbackMessage,
  onAdd,
  onEdit,
  onDelete
}: WorkflowsTabProps): JSX.Element {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="mt-1 text-sm text-neutral-400">Build reusable script and prompt actions for the Workflows button.</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
        >
          Add Workflow
        </button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 px-4 py-6 text-sm text-neutral-400">
            Loading workflows...
          </div>
        ) : null}

        {!isLoading && workflows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/70 px-4 py-6 text-sm text-neutral-500">
            No workflows saved yet. Add your first executable workflow.
          </div>
        ) : null}

        {!isLoading && workflows.map((item) => (
          <article key={item.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">{item.title}</h3>
                <span className="mt-2 inline-flex rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs uppercase tracking-[0.06em] text-amber-300">
                  {item.language}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-300"
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-400">
              {item.content.substring(0, 50)}...
            </p>
          </article>
        ))}
      </div>

      {feedbackMessage ? <p className="text-xs text-emerald-300">{feedbackMessage}</p> : null}
    </div>
  )
}
