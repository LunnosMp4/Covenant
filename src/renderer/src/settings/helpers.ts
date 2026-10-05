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

export function getAppTargetsSummary(app: LauncherApp): string {
  const targets = normalizeLaunchTargets(app.targets, app.path, app.arguments)
  return formatTargetsSummary(targets)
}

export function formatUpdateBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, exponent)
  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export function getUpdateStatusLabel(status: UpdateStatus): string {
  switch (status.state) {
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return status.downloadUrl
        ? `Version ${status.version ?? ''} is available. Download the installer to update.`
        : `Version ${status.version ?? ''} found. Downloading…`
    case 'downloading':
      return `Downloading version ${status.version ?? ''}…`
    case 'downloaded':
      return `Version ${status.version ?? ''} is ready. Restart to finish installing.`
    case 'not-available':
      return 'You are on the latest version.'
    case 'error':
      return `Update check failed${status.error ? `: ${status.error}` : '.'}`
    default:
      return 'No update check has run yet.'
  }
}
