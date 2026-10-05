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

const MODIFIER_KEY_DISPLAY: Record<string, string> = {
  Control: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Meta: 'Win'
}

function normalizeKeyName(key: string): string {
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

interface ShortcutRecorderProps {
  value: string
  onChange: (shortcut: string) => void
  conflictWarning?: string | null
  defaultShortcut: string
  onReset: () => void
}

export function ShortcutRecorder({
  value,
  onChange,
  conflictWarning,
  defaultShortcut,
  onReset
}: ShortcutRecorderProps): JSX.Element {
  const [isRecording, setIsRecording] = useState(false)
  const [previousValue, setPreviousValue] = useState(value)

  const startRecording = (): void => {
    setPreviousValue(value)
    setIsRecording(true)
  }

  const cancelRecording = (): void => {
    setIsRecording(false)
  }

  useEffect(() => {
    if (!isRecording) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()

      const modifiers: string[] = []
      if (event.ctrlKey) modifiers.push('Ctrl')
      if (event.altKey) modifiers.push('Alt')
      if (event.shiftKey) modifiers.push('Shift')
      if (event.metaKey) modifiers.push('Win')

      const keyName = normalizeKeyName(event.key)

      if (MODIFIER_KEY_DISPLAY[keyName]) {
        return
      }

      if (event.key === 'Escape') {
        setIsRecording(false)
        return
      }

      const combo = modifiers.length > 0
        ? `${modifiers.join('+')}+${keyName}`
        : keyName

      setIsRecording(false)
      onChange(combo)
    }

    const handleBlur = (): void => {
      setIsRecording(false)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('blur', handleBlur)
    }
  }, [isRecording, onChange])

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={startRecording}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm text-left transition-colors cursor-pointer ${
            isRecording
              ? 'border-amber-500/60 bg-amber-500/10 text-amber-200 animate-pulse'
              : !value
                ? 'border-neutral-800 bg-neutral-950 text-neutral-600'
                : 'border-neutral-700 bg-neutral-950 text-neutral-100 hover:border-neutral-600'
          }`}
        >
          {isRecording
            ? 'Press a key combo...'
            : value || (
              <span className="italic text-neutral-600">Disabled</span>
            )}
        </button>

        <button
          type="button"
          onClick={() => {
            setIsRecording(false)
            onReset()
          }}
          className="flex-shrink-0 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-2 text-xs text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200"
          title={`Reset to default (${defaultShortcut})`}
        >
          Reset
        </button>
      </div>

      {conflictWarning ? (
        <p className="mt-2 text-xs text-amber-400">{conflictWarning}</p>
      ) : null}
    </div>
  )
}
