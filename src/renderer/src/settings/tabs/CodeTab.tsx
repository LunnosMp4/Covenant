import { useCallback, useEffect, useState } from 'react'
import type { CodeModel, CodePermissionEffect, CodeSettings, CodeStatus } from '../../../../shared/code/code'
import { CODE_PERMISSION_EFFECTS } from '../../../../shared/code/code'
import type { CodeConnection } from '../../../../shared/code/connection'
import CodeConnectionModal from '../../code/CodeConnectionModal'
import { MinimalistToggle, SectionCard } from '../primitives'

interface CodeTabProps {
  settings: CodeSettings
  status: (CodeStatus & { hasApiKey: boolean }) | null
  models: CodeModel[]
  onSettingsChange: (patch: Partial<CodeSettings>) => void
  onSetApiKey: (key: string) => Promise<{ ok: boolean; error?: string }>
  onClearApiKey: () => Promise<void>
  onTestConnection: () => Promise<{ ok: boolean; error?: string }>
  onRestartRuntime: () => Promise<{ ok: boolean; error?: string }>
  onOpenLogs: () => void
}

const PERMISSION_LABELS: Array<{ key: keyof CodeSettings['permission']; label: string; description: string }> = [
  { key: 'edit', label: 'File edits', description: 'Creating, modifying, and deleting files.' },
  { key: 'bash', label: 'Shell commands', description: 'Running commands via the shell tool.' },
  { key: 'external_directory', label: 'External directories', description: 'Touching paths outside the project.' },
  { key: 'webfetch', label: 'Web fetch', description: 'Fetching URLs.' }
]

export default function CodeTab({
  settings,
  status,
  models,
  onSettingsChange,
  onSetApiKey,
  onClearApiKey,
  onTestConnection,
  onRestartRuntime,
  onOpenLogs
}: CodeTabProps): JSX.Element {
  const [apiKey, setApiKey] = useState('')
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [restartMessage, setRestartMessage] = useState<string | null>(null)
  const [connections, setConnections] = useState<CodeConnection[]>([])
  const [activeConnectionId, setActiveConnectionId] = useState('local')
  const [editingConnection, setEditingConnection] = useState<CodeConnection | null>(null)
  const [addingConnection, setAddingConnection] = useState(false)
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null)

  const loadConnections = useCallback(async () => {
    const result = await window.api?.code?.listConnections()
    if (result?.success) {
      setConnections(result.connections)
      setActiveConnectionId(result.activeConnectionId)
    }
  }, [])

  useEffect(() => {
    void loadConnections()
  }, [loadConnections])

  const handleSelectConnection = async (id: string): Promise<void> => {
    const result = await window.api?.code?.selectConnection(id)
    if (result?.success) {
      setActiveConnectionId(result.activeConnectionId)
      setConnectionMessage(null)
    } else {
      setConnectionMessage(result?.error ?? 'Could not switch machine.')
    }
  }

  const handleDeleteConnection = async (id: string): Promise<void> => {
    const result = await window.api?.code?.removeConnection(id)
    if (result?.success) {
      setConnections(result.connections)
      setActiveConnectionId(result.activeConnectionId)
      setConnectionMessage(null)
    } else {
      setConnectionMessage(result?.error ?? 'Could not remove machine.')
    }
  }

  const handleTestConnection = async (id: string): Promise<void> => {
    setConnectionMessage('Testing…')
    const result = await window.api?.code?.testMachine(id)
    if (result?.success) {
      const status = result.status
      setConnectionMessage(
        status.ready
          ? `Connected${status.version ? ` · OpenCode ${status.version}` : ''}`
          : `Reachable, but OpenCode did not start: ${status.error ?? 'unknown error'}`
      )
    } else {
      setConnectionMessage(result?.error ?? 'Connection failed.')
    }
  }

  const selectedModel = models.find(
    (model) => `${model.providerID}/${model.id}` === settings.defaultModel
  )
  const variants = selectedModel?.variants ?? []

  const handleSaveKey = async (): Promise<void> => {
    if (!apiKey.trim()) return
    setAuthBusy(true)
    setAuthMessage(null)
    const result = await onSetApiKey(apiKey.trim())
    setAuthBusy(false)
    if (result.ok) {
      setApiKey('')
      setAuthMessage('Connected.')
    } else {
      setAuthMessage(result.error ?? 'Failed to save key.')
    }
  }

  const handleTest = async (): Promise<void> => {
    setTestMessage(null)
    const result = await onTestConnection()
    setTestMessage(result.ok ? 'Connection successful.' : result.error ?? 'Connection failed.')
  }

  const handleRestart = async (): Promise<void> => {
    setRestartMessage('Restarting…')
    const result = await onRestartRuntime()
    setRestartMessage(result.ok ? 'Runtime restarted.' : result.error ?? 'Restart failed.')
  }

  return (
    <div className="space-y-5">
      <SectionCard title="OpenCode runtime" description="The bundled OpenCode server that powers Covenant Code.">
        <div className="space-y-3 text-sm text-neutral-300">
          <div className="flex items-center justify-between">
            <span>Status</span>
            <span className={status?.ready ? 'text-emerald-400' : 'text-neutral-400'}>
              {status?.installed === false
                ? 'Runtime binary not found'
                : status?.running
                  ? 'Running'
                  : 'Stopped'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Version</span>
            <span className="text-neutral-400">{status?.version ?? '—'}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleTest()}
              className="rounded-md border border-neutral-700/70 px-3 py-1 text-xs hover:bg-neutral-800/70"
            >
              Test connection
            </button>
            <button
              type="button"
              onClick={() => void handleRestart()}
              className="rounded-md border border-neutral-700/70 px-3 py-1 text-xs hover:bg-neutral-800/70"
            >
              Restart runtime
            </button>
            <button
              type="button"
              onClick={onOpenLogs}
              className="rounded-md border border-neutral-700/70 px-3 py-1 text-xs hover:bg-neutral-800/70"
            >
              Open logs
            </button>
          </div>
          {testMessage && <p className="text-xs text-neutral-400">{testMessage}</p>}
          {restartMessage && <p className="text-xs text-neutral-400">{restartMessage}</p>}
        </div>
      </SectionCard>

      <SectionCard
        title="Machines"
        description="Run Covenant Code here or on a remote machine over SSH. Only one machine is active at a time."
      >
        <div className="space-y-2">
          {connections.map((connection) => {
            const isActive = connection.id === activeConnectionId
            return (
              <div
                key={connection.id}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                  isActive ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-neutral-800 bg-neutral-950/50'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-100">
                    {connection.name}
                    {isActive && <span className="ml-2 text-[11px] text-emerald-400">Active</span>}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {connection.kind === 'local'
                      ? 'This computer'
                      : `${connection.username}@${connection.host}:${connection.port}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => void handleSelectConnection(connection.id)}
                      className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                    >
                      Use
                    </button>
                  )}
                  {connection.kind === 'ssh' && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleTestConnection(connection.id)}
                        className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                      >
                        Test
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingConnection(connection)}
                        className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteConnection(connection.id)}
                        className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setAddingConnection(true)}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              Add machine over SSH
            </button>
            {connectionMessage && <p className="text-xs text-neutral-400">{connectionMessage}</p>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="OpenCode Go" description="Subscribe at opencode.ai, then paste your Go API key. Stored securely on this device.">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={status?.hasApiKey ? '•••••••• (saved)' : 'Paste your Go API key'}
              className="flex-1 rounded-md border border-neutral-700/70 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
            />
            <button
              type="button"
              onClick={() => void handleSaveKey()}
              disabled={authBusy || !apiKey.trim()}
              className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              Save
            </button>
          </div>
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>{status?.hasApiKey ? 'A key is stored for this device.' : 'No key stored.'}</span>
            {status?.hasApiKey && (
              <button
                type="button"
                onClick={() => void onClearApiKey()}
                className="hover:text-red-400"
              >
                Disconnect
              </button>
            )}
          </div>
          {authMessage && <p className="text-xs text-neutral-400">{authMessage}</p>}
        </div>
      </SectionCard>

      <SectionCard title="Models" description="Choose the default model and reasoning effort for new sessions.">
        <div className="space-y-3">
          <label className="block text-xs text-neutral-400">
            Default model
            <select
              value={settings.defaultModel}
              onChange={(event) => onSettingsChange({ defaultModel: event.target.value, defaultVariant: '' })}
              className="mt-1 w-full rounded-md border border-neutral-700/70 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100"
            >
              <option value="">Provider default</option>
              {models.map((model) => (
                <option key={`${model.providerID}/${model.id}`} value={`${model.providerID}/${model.id}`}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-neutral-400">
            Reasoning effort
            <select
              value={settings.defaultVariant}
              onChange={(event) => onSettingsChange({ defaultVariant: event.target.value })}
              disabled={variants.length === 0}
              className="mt-1 w-full rounded-md border border-neutral-700/70 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 disabled:opacity-40"
            >
              <option value="">Model default</option>
              {variants.map((variant) => (
                <option key={variant} value={variant}>
                  {variant}
                </option>
              ))}
            </select>
          </label>
          {models.length === 0 && (
            <p className="text-xs text-neutral-500">Connect OpenCode Go to load models.</p>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Permissions" description="Control which agent actions require your approval.">
        <div className="space-y-3">
          {PERMISSION_LABELS.map((entry) => (
            <div key={entry.key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-neutral-100">{entry.label}</p>
                <p className="text-xs text-neutral-400">{entry.description}</p>
              </div>
              <select
                value={settings.permission[entry.key]}
                onChange={(event) =>
                  onSettingsChange({
                    permission: { ...settings.permission, [entry.key]: event.target.value as CodePermissionEffect }
                  })
                }
                className="w-28 rounded-md border border-neutral-700/70 bg-neutral-950/60 px-2 py-1 text-sm text-neutral-100"
              >
                {CODE_PERMISSION_EFFECTS.map((effect) => (
                  <option key={effect} value={effect}>
                    {effect}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Advanced" description="Runtime behaviour.">
        <div className="space-y-4">
          <MinimalistToggle
            label="Start runtime on launch"
            description="Start the OpenCode server when Covenant starts instead of on first use."
            checked={settings.autoStart}
            onChange={(checked) => onSettingsChange({ autoStart: checked })}
          />
          <label className="block text-xs text-neutral-400">
            Server port (0 = automatic)
            <input
              type="number"
              min={0}
              max={65535}
              value={settings.serverPort}
              onChange={(event) => onSettingsChange({ serverPort: Number(event.target.value) || 0 })}
              className="mt-1 w-32 rounded-md border border-neutral-700/70 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100"
            />
          </label>
        </div>
      </SectionCard>

      {(addingConnection || editingConnection) && (
        <CodeConnectionModal
          connection={editingConnection ?? undefined}
          onClose={() => {
            setAddingConnection(false)
            setEditingConnection(null)
          }}
          onSaved={() => {
            setAddingConnection(false)
            setEditingConnection(null)
            setConnectionMessage(null)
            void loadConnections()
          }}
        />
      )}
    </div>
  )
}
