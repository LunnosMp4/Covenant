import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useAnimationControls, type Transition } from 'framer-motion'
import { WINDOW_ENTER_TRANSITION, WINDOW_EXIT_TRANSITION } from '../constants/motion'
import ConfirmDeleteModal from '../ui/ConfirmDeleteModal'
import CustomSelect from '../ui/CustomSelect'
import WorkflowFormModal from '../workflow/WorkflowFormModal'
import PasteSettingsTab from '../paste/PasteSettingsTab'
import {
  DEFAULT_TERMINAL_FONT,
  normalizeTerminalFont
} from '../constants/terminalFonts'
import {
  DEFAULT_THEME_GRADIENT,
  THEME_OPTIONS,
  getThemeMode,
  normalizeThemeGradient
} from '../constants/theme'
import type { AppConfig, ButtonVisibility, ReasoningEffort, ShortcutConfig } from '../../../shared/config'
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL, DEFAULT_REASONING_EFFORT, DEFAULT_SHORTCUTS, DEFAULT_TEXTURE_INTENSITY, MAX_TEXTURE_INTENSITY, REASONING_EFFORT_OPTIONS, TEXTURE_MAX_OPACITY, modelSupportsExtendedParams, modelSupportsWebSearch } from '../../../shared/config'
import type { UpdateStatus } from '../../../shared/system/update'
import {
  DEFAULT_PASTE_SETTINGS,
  normalizePasteManagerSettings,
  type PasteManagerSettings
} from '../../../shared/paste/paste'
import type { McpServer } from '../../../shared/mcp/mcp'
import type { LauncherApp } from '../types/renderer'
import type { Preprompt } from '../types/renderer'
import type { Workflow } from '../types/renderer'
import { getAppBadgeText } from '../utils/helpers'
import { formatTargetsSummary, normalizeLaunchTargets } from '../utils/launcher/launcherTargets'

export function MinimalistToggle({
  checked,
  onChange,
  label,
  description,
  disabled
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <label className={`text-sm font-medium ${disabled ? 'text-neutral-600' : 'text-neutral-100'}`}>{label}</label>
        {description ? (
          <p className={`mt-1 text-xs ${disabled ? 'text-neutral-700' : 'text-neutral-400'}`}>{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border transition-all ${
          checked
            ? 'border-emerald-400/60 bg-emerald-400/30 shadow-lg shadow-emerald-500/20'
            : 'border-neutral-700 bg-neutral-800'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-neutral-100 transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          } shadow-sm`}
        />
      </button>
    </div>
  )
}

export function SectionCard({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: JSX.Element
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5">
      <h2 className="text-base font-semibold text-neutral-100">{title}</h2>
      <p className="mt-1 text-sm text-neutral-400">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}
