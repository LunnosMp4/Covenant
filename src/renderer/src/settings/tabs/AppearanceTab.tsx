import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useAnimationControls, type Transition } from 'framer-motion'
import { WINDOW_ENTER_TRANSITION, WINDOW_EXIT_TRANSITION } from '../../constants/motion'
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
import type { Preprompt } from '../../types/renderer'
import type { Workflow } from '../../types/renderer'
import { getAppBadgeText } from '../../utils/helpers'
import { MinimalistToggle, SectionCard } from '../primitives'
import { ShortcutRecorder } from '../shortcutRecorder'
import { formatUpdateBytes, getUpdateStatusLabel } from '../helpers'

interface AppearanceTabProps {
  selectedTheme: string
  onSelectTheme: (gradientClass: string) => void
  textureIntensity: number
  onTextureIntensityChange: (value: number) => void
  buttonVisibility: ButtonVisibility
  onButtonVisibilityChange: (value: ButtonVisibility) => void
  launcherShowSystemApps: boolean
  onLauncherShowSystemAppsChange: (value: boolean) => void
}

export default function AppearanceTab({
  selectedTheme,
  onSelectTheme,
  textureIntensity,
  onTextureIntensityChange,
  buttonVisibility,
  onButtonVisibilityChange,
  launcherShowSystemApps,
  onLauncherShowSystemAppsChange
}: AppearanceTabProps): JSX.Element {
  const isWindows = window.api?.platform === 'win32'

  return (
    <div className="space-y-6">
      <SectionCard
        title="Theme"
        description="Choose a surface tone. Dark and light presets are tuned for contrast and apply instantly across windows."
      >
        <div className="space-y-5">
          {(['dark', 'light'] as const).map((mode) => (
            <div key={mode}>
              <p className="mb-2 text-[11px] font-medium text-neutral-500">
                {mode === 'dark' ? 'Dark' : 'Light'}
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {THEME_OPTIONS.filter((themeOption) => themeOption.mode === mode).map((themeOption) => {
                  const isActive = selectedTheme === themeOption.gradientClass
                  const isDark = themeOption.mode === 'dark'

                  return (
                    <button
                      key={themeOption.id}
                      type="button"
                      onClick={() => onSelectTheme(themeOption.gradientClass)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        isActive
                          ? 'border-neutral-500 bg-neutral-800/80'
                          : 'border-neutral-800 bg-neutral-900/70 hover:border-neutral-600 hover:bg-neutral-800/60'
                      }`}
                    >
                      <div
                        className="relative h-16 overflow-hidden rounded-lg border"
                        style={{
                          borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
                          backgroundImage: `linear-gradient(135deg, ${themeOption.preview.from}, ${themeOption.preview.to})`
                        }}
                      >
                        <div
                          className="absolute inset-x-3 top-3 flex items-center gap-2 rounded-md px-2 py-1.5"
                          style={{
                            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)',
                            border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)'}`
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: themeOption.palette.accent }}
                          />
                          <span
                            className="h-1.5 flex-1 rounded-full"
                            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.14)' }}
                          />
                          <span
                            className="h-1.5 w-8 rounded-full"
                            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }}
                          />
                        </div>
                        <span
                          className="absolute bottom-2.5 left-3.5 h-1 w-10 rounded-full"
                          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }}
                        />
                        {isActive && (
                          <span
                            className="absolute right-2 top-2 h-2 w-2 rounded-full ring-2 ring-black/20"
                            style={{ backgroundColor: themeOption.palette.accent }}
                          />
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-neutral-100">{themeOption.label}</p>
                        <span className="text-[10px] uppercase tracking-[0.08em] text-neutral-400">
                          {isDark ? 'Dark' : 'Light'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-neutral-400">{themeOption.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Texture"
        description="Add a subtle film-grain texture over themed surfaces."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="texture-intensity" className="text-sm font-medium text-neutral-200">
              Grain intensity
            </label>
            <span className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-medium tabular-nums text-neutral-300">
              {textureIntensity}%
            </span>
          </div>

          <input
            id="texture-intensity"
            type="range"
            min={0}
            max={MAX_TEXTURE_INTENSITY}
            step={1}
            value={textureIntensity}
            onChange={(event) => onTextureIntensityChange(Number(event.target.value))}
            className="w-full cursor-pointer accent-neutral-200"
          />

          <div className="flex justify-between text-[10px] uppercase tracking-[0.08em] text-neutral-400">
            <span>Off</span>
            <span>Subtle</span>
            <span>Strong</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Bar Buttons"
        description="Choose which buttons appear on the floating command bar. The Settings button is always visible."
      >
        <div className="space-y-4">
          <MinimalistToggle
            checked={buttonVisibility.workflow}
            onChange={(checked) => onButtonVisibilityChange({ ...buttonVisibility, workflow: checked })}
            label="Workflows"
            description="Show the Workflows button to run saved scripts and automations."
          />
          <MinimalistToggle
            checked={buttonVisibility.tasks}
            onChange={(checked) => onButtonVisibilityChange({ ...buttonVisibility, tasks: checked })}
            label="Tasks"
            description="Show the Tasks button to quickly capture and check off to-dos."
          />
          <MinimalistToggle
            checked={buttonVisibility.notes}
            onChange={(checked) => onButtonVisibilityChange({ ...buttonVisibility, notes: checked })}
            label="Notes & Meetings"
            description="Show the Notes button to open notes and start a meeting recording."
          />
        </div>
      </SectionCard>

      {isWindows && (
        <SectionCard
          title="Application Search"
          description="Control which installed applications appear in the command bar search."
        >
          <MinimalistToggle
            checked={launcherShowSystemApps}
            onChange={onLauncherShowSystemAppsChange}
            label="Show Windows system apps"
            description="Include built-in Windows utilities, administrative tools and documentation shortcuts. Leave off to only see the apps you installed."
          />
        </SectionCard>
      )}
    </div>
  )
}
