import { useState } from 'react'
import type { CodeConnection, CodeSshAuthMethod } from '../../../shared/code/connection'
import ModalOverlay from '../ui/ModalOverlay'

interface CodeConnectionModalProps {
  connection?: CodeConnection
  onClose: () => void
  onSaved: (connectionId: string) => void
}

const AUTH_OPTIONS: Array<{ value: CodeSshAuthMethod; label: string }> = [
  { value: 'password', label: 'Password' },
  { value: 'key', label: 'Private key file' },
  { value: 'agent', label: 'SSH agent' }
]

export default function CodeConnectionModal({
  connection,
  onClose,
  onSaved
}: CodeConnectionModalProps): JSX.Element {
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
    <ModalOverlay onClose={onClose} contentClassName="max-w-lg">
      <div className="flex flex-col rounded-2xl border border-neutral-800 bg-neutral-900/95 p-5 shadow-[0_22px_60px_rgba(0,0,0,0.55)]">
        <h3 className="text-lg font-semibold text-neutral-100">
          {isEdit ? 'Edit machine' : 'Add a machine over SSH'}
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          Covenant installs OpenCode on the machine if it is missing, then runs the session there.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My dev VM"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Host
              </label>
              <input
                type="text"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="192.168.1.20 or vm.example.com"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Port
              </label>
              <input
                type="number"
                value={port}
                onChange={(event) => setPort(event.target.value)}
                min={1}
                max={65535}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="ubuntu"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
              Authentication
            </label>
            <select
              value={authMethod}
              onChange={(event) => setAuthMethod(event.target.value as CodeSshAuthMethod)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
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
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isEdit ? '•••••••• (unchanged)' : 'Password'}
                autoComplete="off"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
              />
            </div>
          )}

          {authMethod === 'key' && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                  Private key
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={privateKeyPath}
                    onChange={(event) => setPrivateKeyPath(event.target.value)}
                    placeholder="~/.ssh/id_ed25519"
                    className="min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void pickKey()}
                    className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                  >
                    Browse
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                  Key passphrase <span className="normal-case text-neutral-500">(optional)</span>
                </label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  placeholder="Passphrase"
                  autoComplete="off"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
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

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={busy || disabled}
            className="mr-auto rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Working…' : 'Save & test'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy || disabled}
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
