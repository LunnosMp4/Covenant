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

interface GeneralTabProps {
  apiKey: string
  onApiKeyChange: (value: string) => void
  proxyUrl: string
  onProxyUrlChange: (value: string) => void
  isAdvancedOpen: boolean
  onToggleAdvanced: () => void
  onSaveOpenAISettings: () => void
  isSavingApiKey: boolean
  isConfigLoaded: boolean
  saveFeedbackMessage: string
  launchOnStartup: boolean
  onLaunchOnStartupChange: (value: boolean) => void
  chatModel: string
  onChatModelChange: (value: string) => void
  reasoningEffort: ReasoningEffort
  onReasoningEffortChange: (value: ReasoningEffort) => void
  enableWebSearch: boolean
  onWebSearchChange: (value: boolean) => void
  autoCollapseReasoning: boolean
  onAutoCollapseReasoningChange: (value: boolean) => void
  autoUpdate: boolean
  onAutoUpdateChange: (value: boolean) => void
  updateStatus: UpdateStatus
  onCheckForUpdates: () => void
  onInstallUpdate: () => void
  shortcuts: ShortcutConfig
  onShortcutChange: (field: keyof ShortcutConfig, value: string) => void
}

export default function GeneralTab({
  apiKey,
  onApiKeyChange,
  proxyUrl,
  onProxyUrlChange,
  isAdvancedOpen,
  onToggleAdvanced,
  onSaveOpenAISettings,
  isSavingApiKey,
  isConfigLoaded,
  saveFeedbackMessage,
  launchOnStartup,
  onLaunchOnStartupChange,
  chatModel,
  onChatModelChange,
  reasoningEffort,
  onReasoningEffortChange,
  enableWebSearch,
  onWebSearchChange,
  autoCollapseReasoning,
  onAutoCollapseReasoningChange,
  autoUpdate,
  onAutoUpdateChange,
  updateStatus,
  onCheckForUpdates,
  onInstallUpdate,
  shortcuts,
  onShortcutChange
}: GeneralTabProps): JSX.Element {
  return (
    <div className="space-y-6">
      <SectionCard
        title="OpenAI API Key"
        description="Stored in your local OS user data directory. This key is used by Covenant chat requests."
      >
        <div>
          <label htmlFor="openai-key" className="mb-2 block text-sm font-medium text-neutral-300">
            API Key
          </label>

          <div className="flex items-center gap-3">
            <input
              id="openai-key"
              type="password"
              value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder="sk-..."
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
              autoComplete="off"
            />

            <button
              type="button"
              onClick={onSaveOpenAISettings}
              disabled={isSavingApiKey || !isConfigLoaded}
              className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingApiKey ? 'Saving...' : 'Save'}
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleAdvanced}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-neutral-100"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={isAdvancedOpen ? 'rotate-90 transition-transform' : 'transition-transform'}
              aria-hidden
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            <span>Advanced settings</span>
          </button>

          {isAdvancedOpen ? (
            <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
              <label htmlFor="openai-proxy-url" className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Proxy URL
              </label>
              <input
                id="openai-proxy-url"
                type="text"
                value={proxyUrl}
                onChange={(event) => onProxyUrlChange(event.target.value)}
                placeholder="http://proxy.company.local:8080"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                autoComplete="off"
              />
              <p className="mt-2 text-xs text-neutral-500">
                Use this when your company routes outbound traffic through a proxy. Applies to OpenAI requests and MCP
                server connections. Leave empty for direct access.
              </p>
            </div>
          ) : null}

          <p className="mt-2 text-xs text-neutral-500">Saved locally in the native user data folder as part of config.json.</p>
          {saveFeedbackMessage ? <p className="mt-2 text-xs text-emerald-300">{saveFeedbackMessage}</p> : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Startup"
        description="Automatically launch Covenant when you start your computer."
      >
        <div className="space-y-4">
          <MinimalistToggle
            checked={launchOnStartup}
            onChange={onLaunchOnStartupChange}
            label="Launch on startup"
            description="Covenant will open automatically when your system starts."
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Updates"
        description="Covenant checks GitHub Releases for new versions in the background."
      >
        <div className="space-y-4">
          <MinimalistToggle
            checked={autoUpdate}
            onChange={onAutoUpdateChange}
            label="Automatically check for updates"
            description="Check GitHub Releases for new versions and let you know when an update is available."
          />

          <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-200">
                  Covenant v{updateStatus.currentVersion}
                </p>
                <p className={`mt-1 text-xs ${updateStatus.state === 'error' ? 'text-red-400' : 'text-neutral-400'}`}>
                  {getUpdateStatusLabel(updateStatus)}
                </p>
              </div>

              {updateStatus.state === 'downloaded' || (updateStatus.state === 'available' && updateStatus.downloadUrl) ? (
                <button
                  type="button"
                  onClick={onInstallUpdate}
                  className="flex-shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
                >
                  {updateStatus.state === 'downloaded' ? 'Restart & install' : 'Download'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onCheckForUpdates}
                  disabled={updateStatus.state === 'checking' || updateStatus.state === 'downloading'}
                  className="flex-shrink-0 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updateStatus.state === 'checking' ? 'Checking…' : 'Check for updates'}
                </button>
              )}
            </div>

            {typeof updateStatus.percent === 'number' &&
            (updateStatus.state === 'downloading' || updateStatus.state === 'downloaded') ? (
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      updateStatus.state === 'downloaded' ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${Math.min(Math.max(updateStatus.percent, 0), 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {Math.round(updateStatus.percent)}%
                  {updateStatus.state === 'downloading' && updateStatus.bytesPerSecond
                    ? ` · ${formatUpdateBytes(updateStatus.transferred)} / ${formatUpdateBytes(updateStatus.total)} · ${formatUpdateBytes(updateStatus.bytesPerSecond)}/s`
                    : ''}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Chat Model"
        description="Select which OpenAI model to use for AI conversations. Changes apply immediately."
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Model
            </label>
            <CustomSelect
              options={CHAT_MODEL_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label
              }))}
              value={chatModel || DEFAULT_CHAT_MODEL}
              onChange={onChatModelChange}
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${modelSupportsExtendedParams(chatModel || DEFAULT_CHAT_MODEL) ? 'text-neutral-300' : 'text-neutral-600'}`}>
              Reasoning Effort
            </label>
            <CustomSelect
              options={REASONING_EFFORT_OPTIONS.map((effort) => ({
                value: effort,
                label: effort.charAt(0).toUpperCase() + effort.slice(1)
              }))}
              value={reasoningEffort || DEFAULT_REASONING_EFFORT}
              onChange={(value) => onReasoningEffortChange(value as ReasoningEffort)}
              disabled={!modelSupportsExtendedParams(chatModel || DEFAULT_CHAT_MODEL)}
            />
            <p className={`mt-2 text-xs ${modelSupportsExtendedParams(chatModel || DEFAULT_CHAT_MODEL) ? 'text-neutral-500' : 'text-neutral-600'}`}>
              {modelSupportsExtendedParams(chatModel || DEFAULT_CHAT_MODEL)
                ? 'Controls how much compute the model spends reasoning.'
                : 'Not supported by this model.'}
            </p>
          </div>

          <MinimalistToggle
            checked={enableWebSearch}
            onChange={onWebSearchChange}
            label="Web Search"
            description="Allow the model to search the web for up-to-date information. Requires Responses API support."
            disabled={!modelSupportsWebSearch(chatModel || DEFAULT_CHAT_MODEL)}
          />

          <MinimalistToggle
            checked={autoCollapseReasoning}
            onChange={onAutoCollapseReasoningChange}
            label="Auto-collapse Reasoning"
            description="Automatically collapse the reasoning panel after the response completes."
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Keyboard Shortcuts"
        description="Configure global shortcuts to open Covenant. These are OS-level shortcuts that work from anywhere. In-app navigation (Tab, Ctrl+Tab) is unaffected by these settings."
      >
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Open App
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Toggles the Covenant command bar open/close.
            </p>
            <ShortcutRecorder
              value={shortcuts.openApp}
              onChange={(val) => onShortcutChange('openApp', val)}
              conflictWarning={
                shortcuts.openApp && shortcuts.openAppTerminal && shortcuts.openApp === shortcuts.openAppTerminal
                  ? 'This shortcut is also assigned to Open App in Terminal Mode'
                  : null
              }
              defaultShortcut={DEFAULT_SHORTCUTS.openApp}
              onReset={() => onShortcutChange('openApp', DEFAULT_SHORTCUTS.openApp)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Open App in Terminal Mode
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Opens Covenant directly with the terminal panel visible and focused, skipping the AI bar.
            </p>
            <ShortcutRecorder
              value={shortcuts.openAppTerminal}
              onChange={(val) => onShortcutChange('openAppTerminal', val)}
              conflictWarning={
                shortcuts.openAppTerminal && shortcuts.openApp && shortcuts.openAppTerminal === shortcuts.openApp
                  ? 'This shortcut is also assigned to Open App'
                  : null
              }
              defaultShortcut={DEFAULT_SHORTCUTS.openAppTerminal}
              onReset={() => onShortcutChange('openAppTerminal', DEFAULT_SHORTCUTS.openAppTerminal)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Open Tasks
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Opens Covenant directly on the Tasks quick-capture list.
            </p>
            <ShortcutRecorder
              value={shortcuts.openTasks}
              onChange={(val) => onShortcutChange('openTasks', val)}
              conflictWarning={
                shortcuts.openTasks && shortcuts.openApp && shortcuts.openTasks === shortcuts.openApp
                  ? 'This shortcut is also assigned to Open App'
                  : shortcuts.openTasks && shortcuts.openAppTerminal && shortcuts.openTasks === shortcuts.openAppTerminal
                    ? 'This shortcut is also assigned to Open App in Terminal Mode'
                    : null
              }
              defaultShortcut={DEFAULT_SHORTCUTS.openTasks}
              onReset={() => onShortcutChange('openTasks', DEFAULT_SHORTCUTS.openTasks)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Open Paste Manager
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Opens the clipboard history window. Only active when Paste Manager is enabled.
            </p>
            <ShortcutRecorder
              value={shortcuts.openPaste}
              onChange={(val) => onShortcutChange('openPaste', val)}
              conflictWarning={
                shortcuts.openPaste && shortcuts.openApp && shortcuts.openPaste === shortcuts.openApp
                  ? 'This shortcut is also assigned to Open App'
                  : shortcuts.openPaste && shortcuts.openAppTerminal && shortcuts.openPaste === shortcuts.openAppTerminal
                    ? 'This shortcut is also assigned to Open App in Terminal Mode'
                    : shortcuts.openPaste && shortcuts.openTasks && shortcuts.openPaste === shortcuts.openTasks
                      ? 'This shortcut is also assigned to Open Tasks'
                      : null
              }
              defaultShortcut={DEFAULT_SHORTCUTS.openPaste}
              onReset={() => onShortcutChange('openPaste', DEFAULT_SHORTCUTS.openPaste)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Open Covenant Code
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Opens the agentic coding workspace window.
            </p>
            <ShortcutRecorder
              value={shortcuts.openCode}
              onChange={(val) => onShortcutChange('openCode', val)}
              conflictWarning={
                shortcuts.openCode && shortcuts.openApp && shortcuts.openCode === shortcuts.openApp
                  ? 'This shortcut is also assigned to Open App'
                  : null
              }
              defaultShortcut={DEFAULT_SHORTCUTS.openCode}
              onReset={() => onShortcutChange('openCode', DEFAULT_SHORTCUTS.openCode)}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
