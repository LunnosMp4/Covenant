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
        description="Pick a gradient preset. Changes apply instantly across windows."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {THEME_OPTIONS.map((themeOption) => {
            const isActive = selectedTheme === themeOption.gradientClass

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
                  className="h-10 rounded-lg border border-neutral-700/60"
                  style={{
                    backgroundImage: `linear-gradient(to right, ${themeOption.preview.from}, ${themeOption.preview.to})`
                  }}
                />
                <p className="mt-3 text-sm font-medium text-neutral-100">{themeOption.label}</p>
                <p className="mt-1 text-xs text-neutral-400">{themeOption.description}</p>
              </button>
            )
          })}
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

          <div className="flex justify-between text-[10px] uppercase tracking-[0.08em] text-neutral-500">
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
            checked={buttonVisibility.appLauncher}
            onChange={(checked) => onButtonVisibilityChange({ ...buttonVisibility, appLauncher: checked })}
            label="App Launcher"
            description="Show the App Launcher button to quickly open your favorite applications."
          />
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
            checked={buttonVisibility.code}
            onChange={(checked) => onButtonVisibilityChange({ ...buttonVisibility, code: checked })}
            label="Covenant Code"
            description="Show the Code button to open the agentic coding workspace."
          />
        </div>
      </SectionCard>

      {isWindows && (
        <SectionCard
          title="App Launcher"
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
