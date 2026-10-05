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

interface TerminalTabProps {
  terminalFont: string
  onTerminalFontSelect: (fontFamily: string) => void
  preferredShell?: string
  onPreferredShellChange: (shell: string) => void
}

export default function TerminalTab({ terminalFont, onTerminalFontSelect, preferredShell, onPreferredShellChange }: TerminalTabProps): JSX.Element {
  const [availableFonts, setAvailableFonts] = useState<string[]>([])
  const [isLoadingFonts, setIsLoadingFonts] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadFonts = async (): Promise<void> => {
      if (!window.api?.config.getTerminalFonts) return

      try {
        setIsLoadingFonts(true)
        const fonts = await window.api.config.getTerminalFonts()
        if (!isMounted) return
        setAvailableFonts(fonts)
      } catch {
        if (!isMounted) return
        setAvailableFonts([])
      } finally {
        if (!isMounted) return
        setIsLoadingFonts(false)
      }
    }

    void loadFonts()

    return () => {
      isMounted = false
    }
  }, [])

  const selectedFont = normalizeTerminalFont(terminalFont)
  const fontOptions = useMemo(
    () =>
      selectedFont && !availableFonts.includes(selectedFont)
        ? [selectedFont, ...availableFonts]
        : availableFonts,
    [availableFonts, selectedFont]
  )

  return (
    <div className="space-y-6">
      <SectionCard
        title="Terminal Shell"
        description="Choose your preferred shell for Terminal Mode. The app will automatically fall back to available shells if your preference isn't found."
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-100">
              Preferred Shell
            </label>
            <input
              type="text"
              value={preferredShell || ''}
              onChange={(e) => onPreferredShellChange(e.target.value)}
              placeholder="/bin/zsh"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 transition-colors focus:border-neutral-600 focus:outline-none"
            />
            <p className="mt-2 text-xs text-neutral-400">
              Examples: /bin/zsh, /bin/bash, /bin/sh. Leave empty to auto-detect.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Terminal Font"
        description="Choose how your shell text is rendered in Terminal Mode. This updates instantly and is saved locally."
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-100">
              Terminal Fonts
            </label>
            <select
              value={selectedFont}
              onChange={(e) => onTerminalFontSelect(e.target.value)}
              disabled={isLoadingFonts}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 transition-colors focus:border-neutral-600 focus:outline-none disabled:opacity-50"
            >
              <option value="">
                {isLoadingFonts ? 'Loading terminal fonts...' : 'Select a terminal font'}
              </option>
              {fontOptions.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </div>

          {terminalFont && (
            <div>
              <p className="text-xs text-neutral-400 mb-2">Preview:</p>
              <p
                className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                style={{ fontFamily: terminalFont }}
              >
                PS C:\Projects\Covenant&gt; git status
              </p>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
