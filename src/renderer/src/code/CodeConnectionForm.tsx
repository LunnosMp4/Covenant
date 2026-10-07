import { useState } from 'react'
import type { CodeConnection, CodeSshAuthMethod } from '../../../shared/code/connection'
import { CloseIcon } from './icons'

interface CodeConnectionFormProps {
  connection?: CodeConnection
  onClose: () => void
  onSaved: (connectionId: string) => void
}

const AUTH_OPTIONS: Array<{ value: CodeSshAuthMethod; label: string }> = [
  { value: 'password', label: 'Password' },
  { value: 'key', label: 'Private key file' },
  { value: 'agent', label: 'SSH agent' }
]

const FIELD_LABEL =
  'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500'
const FIELD_INPUT =
  'w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-white/25 focus:outline-none'
const SECONDARY_BUTTON =
  'rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50'
const PRIMARY_BUTTON =
  'rounded-xl px-3.5 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'

export default function CodeConnectionForm({
  connection,
  onClose,
  onSaved
}: CodeConnectionFormProps): JSX.Element {
  const isEdit = Boolean(connection)
  const [name, setName] = useState(connection?.name ?? '')
  const [host, setHost] = useState(connection?.host ?? '')
  const [port, setPort] = useState(String(connection?.port ?? 22))
  const [username, setUsername] = useState(connection?.username ?? '')
  const [authMethod, setAuthMethod] = useState<CodeSshAuthMethod>(connection?.authMethod ?? 'password')
  const [privateKeyPath, setPrivateKeyPath] = useState(connection?.privateKeyPath ?? '')
  const [password, setPassword] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageOk, setMessageOk] = useState(false)

  const disabled = !host.trim() || !username.trim()

  const pickKey = async (): Promise<void> => {
    const result = await window.api?.code?.pickFile()
    if (result?.success && result.path) setPrivateKeyPath(result.path)
  }

  const persist = async (): Promise<string | null> => {
    const api = window.api?.code
    if (!api) return null
    const payload = {
      name: name.trim() || undefined,
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim(),
      authMethod,
      privateKeyPath: authMethod === 'key' ? privateKeyPath.trim() : undefined
    }

    let id = connection?.id
    if (isEdit && id) {
      const updated = await api.updateConnection(id, payload)
      if (!updated.success) {
        setMessage(updated.error)
        setMessageOk(false)
        return null
      }
    } else {
      const created = await api.addConnection(payload)
      if (!created.success) {
        setMessage(created.error)
        setMessageOk(false)
        return null
      }
      const match = created.connections.find(
        (item) => item.kind === 'ssh' && item.host === payload.host && item.username === payload.username
      )
      id = match?.id
      if (!id) {
        setMessage('Connection saved but could not be located.')
        setMessageOk(false)
        return null
      }
    }

    if (authMethod !== 'agent' && (password || passphrase)) {
      const saved = await api.setConnectionCredential({
        id,
        password: password || undefined,
        passphrase: passphrase || undefined
      })
      if (!saved.success) {
        setMessage(saved.error)
        setMessageOk(false)
        return null
      }
    }
    return id
  }

  const handleSave = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    const id = await persist()
    setBusy(false)
    if (id) onSaved(id)
  }

  const handleTest = async (): Promise<void> => {
    setBusy(true)
    setMessage('Saving and connecting…')
    setMessageOk(false)
    const id = await persist()
    if (!id) {
      setBusy(false)
      return
    }
    const result = await window.api?.code?.testMachine(id)
    setBusy(false)
    if (result?.success) {
      const status = result.status
      setMessage(
        status.ready
          ? `Connected${status.version ? ` · OpenCode ${status.version}` : ''}`
          : `Reachable, but OpenCode did not start: ${status.error ?? 'unknown error'}`
      )
      setMessageOk(status.ready)
    } else {
      setMessage(result?.error ?? 'Connection failed')
      setMessageOk(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-neutral-100">
            {isEdit ? 'Edit machine' : 'Add a machine over SSH'}
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            Covenant installs OpenCode on the machine if it is missing, then runs the session there.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
          aria-label="Close"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 chat-scrollbar">
        <div>
          <label className={FIELD_LABEL}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My dev VM"
            className={FIELD_INPUT}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <div>
            <label className={FIELD_LABEL}>Host</label>
            <input
              type="text"
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="192.168.1.20 or vm.example.com"
              className={FIELD_INPUT}
            />
          </div>
          <div>
            <label className={FIELD_LABEL}>Port</label>
            <input
              type="number"
              value={port}
              onChange={(event) => setPort(event.target.value)}
              min={1}
              max={65535}
              className={FIELD_INPUT}
            />
          </div>
        </div>

        <div>
          <label className={FIELD_LABEL}>Username</label>
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="ubuntu"
            className={FIELD_INPUT}
          />
        </div>

        <div>
          <label className={FIELD_LABEL}>Authentication</label>
          <select
            value={authMethod}
            onChange={(event) => setAuthMethod(event.target.value as CodeSshAuthMethod)}
            className={FIELD_INPUT}
          >
            {AUTH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {authMethod === 'password' && (
          <div>
            <label className={FIELD_LABEL}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isEdit ? '•••••••• (unchanged)' : 'Password'}
              autoComplete="off"
              className={FIELD_INPUT}
            />
          </div>
        )}

        {authMethod === 'key' && (
          <div className="space-y-3">
            <div>
              <label className={FIELD_LABEL}>Private key</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={privateKeyPath}
                  onChange={(event) => setPrivateKeyPath(event.target.value)}
                  placeholder="~/.ssh/id_ed25519"
                  className={`min-w-0 flex-1 ${FIELD_INPUT}`}
                />
                <button type="button" onClick={() => void pickKey()} className={SECONDARY_BUTTON}>
                  Browse
                </button>
              </div>
            </div>
            <div>
              <label className={FIELD_LABEL}>
                Key passphrase <span className="normal-case text-neutral-500">(optional)</span>
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder="Passphrase"
                autoComplete="off"
                className={FIELD_INPUT}
              />
            </div>
          </div>
        )}

        {authMethod === 'agent' && (
          <p className="text-xs text-neutral-500">
            Uses a running SSH agent (SSH_AUTH_SOCK, or Pageant on Windows).
          </p>
        )}

        {message && (
          <p className={`text-xs ${messageOk ? 'text-emerald-300' : 'text-neutral-400'}`}>{message}</p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={busy || disabled}
          className={`mr-auto ${SECONDARY_BUTTON}`}
        >
          {busy ? 'Working…' : 'Save & test'}
        </button>
        <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy || disabled}
          className={PRIMARY_BUTTON}
          style={{ background: 'var(--chat-accent)', color: 'var(--chat-on-accent)' }}
        >
          Save
        </button>
      </div>
    </div>
  )
}
