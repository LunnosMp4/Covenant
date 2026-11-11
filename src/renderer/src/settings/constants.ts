import type { Transition } from 'framer-motion'
import { WINDOW_ENTER_TRANSITION, WINDOW_EXIT_TRANSITION } from '../constants/motion'

export type SettingsTab =
  | 'general'
  | 'providers'
  | 'websearch'
  | 'shortcuts'
  | 'appearance'
  | 'terminal'
  | 'workflow'
  | 'preprompts'
  | 'mcp'
  | 'paste'
  | 'notes'
  | 'usage'
  | 'code'

export const VALID_SETTINGS_TABS: readonly SettingsTab[] = [
  'general',
  'providers',
  'websearch',
  'shortcuts',
  'appearance',
  'terminal',
  'workflow',
  'preprompts',
  'mcp',
  'paste',
  'notes',
  'usage',
  'code'
]

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
      { id: 'shortcuts', label: 'Shortcuts' },
      { id: 'terminal', label: 'Terminal' }
    ]
  },
  {
    label: 'AI',
    items: [
      { id: 'providers', label: 'Providers & Keys' },
      { id: 'websearch', label: 'Web Search' },
      { id: 'preprompts', label: 'Instructions' },
      { id: 'mcp', label: 'MCP Servers' },
      { id: 'workflow', label: 'Workflows' }
    ]
  },
  {
    label: 'Covenant Code',
    items: [{ id: 'code', label: 'Covenant Code' }]
  },
  {
    label: 'Tools',
    items: [
      { id: 'paste', label: 'Clipboard' },
      { id: 'notes', label: 'Notes & Meetings' }
    ]
  },
  {
    label: 'Account',
    items: [{ id: 'usage', label: 'Usage & Billing' }]
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
