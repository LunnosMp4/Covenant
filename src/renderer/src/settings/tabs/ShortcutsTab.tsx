import type { ShortcutConfig } from '../../../../shared/config'
import { DEFAULT_SHORTCUTS } from '../../../../shared/config'
import { SectionCard } from '../primitives'
import { ShortcutRecorder } from '../shortcutRecorder'

interface ShortcutsTabProps {
  shortcuts: ShortcutConfig
  onShortcutChange: (field: keyof ShortcutConfig, value: string) => void
}

export default function ShortcutsTab({
  shortcuts,
  onShortcutChange
}: ShortcutsTabProps): JSX.Element {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Keyboard Shortcuts"
        description="Configure global shortcuts to open Covenant. These are OS-level shortcuts that work from anywhere. Each shortcut shows or switches to its view, and pressing it again while that view is active closes the window. In-app navigation (Tab, Ctrl+Tab) is unaffected by these settings."
      >
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Open App
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Shows the bare command bar ready for a new conversation. From another view it switches back to the bar; pressing it again closes the window.
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
              Open Last Conversation
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Opens the bar with the conversation panel already showing your most recent conversation (or the one you were last in). Press again to close.
            </p>
            <ShortcutRecorder
              value={shortcuts.openLastConversation}
              onChange={(val) => onShortcutChange('openLastConversation', val)}
              conflictWarning={
                shortcuts.openLastConversation && shortcuts.openApp && shortcuts.openLastConversation === shortcuts.openApp
                  ? 'This shortcut is also assigned to Open App'
                  : null
              }
              defaultShortcut={DEFAULT_SHORTCUTS.openLastConversation}
              onReset={() => onShortcutChange('openLastConversation', DEFAULT_SHORTCUTS.openLastConversation)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Open App in Terminal Mode
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Shows Covenant with the terminal panel visible and focused. Press again to close, or use another shortcut to switch.
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
              Shows the Tasks quick-capture list. Press again to close, or use another shortcut to switch.
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
              Opens the clipboard history view. Only active when Paste Manager is enabled.
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
              Open Notes &amp; Meetings
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Opens the notes surface. From another view it switches to Notes; pressing it again
              closes the window.
            </p>
            <ShortcutRecorder
              value={shortcuts.openNotes}
              onChange={(val) => onShortcutChange('openNotes', val)}
              conflictWarning={
                shortcuts.openNotes && shortcuts.openApp && shortcuts.openNotes === shortcuts.openApp
                  ? 'This shortcut is also assigned to Open App'
                  : shortcuts.openNotes && shortcuts.openPaste && shortcuts.openNotes === shortcuts.openPaste
                    ? 'This shortcut is also assigned to Open Paste Manager'
                    : shortcuts.openNotes && shortcuts.openTasks && shortcuts.openNotes === shortcuts.openTasks
                      ? 'This shortcut is also assigned to Open Tasks'
                      : null
              }
              defaultShortcut={DEFAULT_SHORTCUTS.openNotes}
              onReset={() => onShortcutChange('openNotes', DEFAULT_SHORTCUTS.openNotes)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Open Covenant Code
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Shows the OpenCode coding surface above the command bar. Press again to close, or use another shortcut to switch.
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

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Toggle Code Mode
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Switches Covenant Code between Build and Plan mode while the coding surface is open.
            </p>
            <ShortcutRecorder
              value={shortcuts.toggleCodeMode}
              onChange={(val) => onShortcutChange('toggleCodeMode', val)}
              conflictWarning={
                shortcuts.toggleCodeMode && shortcuts.openApp && shortcuts.toggleCodeMode === shortcuts.openApp
                  ? 'This shortcut is also assigned to Open App'
                  : null
              }
              defaultShortcut={DEFAULT_SHORTCUTS.toggleCodeMode}
              onReset={() => onShortcutChange('toggleCodeMode', DEFAULT_SHORTCUTS.toggleCodeMode)}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
