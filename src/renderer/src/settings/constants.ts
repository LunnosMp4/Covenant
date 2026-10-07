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

export type SettingsTab = 'general' | 'appearance' | 'terminal' | 'appLauncher' | 'workflow' | 'preprompts' | 'mcp' | 'paste' | 'usage' | 'code'

export const VALID_SETTINGS_TABS: readonly SettingsTab[] = ['general', 'appearance', 'terminal', 'appLauncher', 'workflow', 'preprompts', 'mcp', 'paste', 'usage', 'code']

export interface SettingsNavGroup {
  label: string
  items: { id: SettingsTab; label: string }[]
}

export const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  {
    label: 'Application',
    items: [
      { id: 'general', label: 'General' },
      { id: 'appearance', label: 'Appearance' },
      { id: 'terminal', label: 'Terminal' }
    ]
  },
  {
    label: 'AI & Automation',
    items: [
      { id: 'preprompts', label: 'Instructions' },
      { id: 'mcp', label: 'MCP Servers' },
      { id: 'workflow', label: 'Workflows' }
    ]
  },
  {
    label: 'Tools',
    items: [
      { id: 'appLauncher', label: 'App Launcher' },
      { id: 'paste', label: 'Clipboard' }
    ]
  },
  {
    label: 'Code',
    items: [{ id: 'code', label: 'OpenCode' }]
  },
  {
    label: 'Account',
    items: [{ id: 'usage', label: 'Usage & Cost' }]
  }
]

export const SETTINGS_WINDOW_ENTER_TRANSITION: Transition = WINDOW_ENTER_TRANSITION
export const SETTINGS_WINDOW_EXIT_TRANSITION: Transition = WINDOW_EXIT_TRANSITION

export function isSettingsTab(tab: string | null): tab is SettingsTab {
  return typeof tab === 'string' && VALID_SETTINGS_TABS.includes(tab as SettingsTab)
}

export function getInitialTab(): SettingsTab {
  const hash = window.location.hash
  const queryIndex = hash.indexOf('?')
  const query = queryIndex >= 0 ? hash.slice(queryIndex + 1) : ''
  const tab = new URLSearchParams(query).get('tab')
  return isSettingsTab(tab) ? tab : 'general'
}
