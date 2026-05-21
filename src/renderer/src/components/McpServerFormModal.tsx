import { useEffect, useState } from 'react'
import ModalOverlay from './ModalOverlay'
import type { McpAuth, McpHeader, McpServer } from '../../../shared/mcp'

interface McpServerFormModalProps {
  initialData?: McpServer
  onCancel: () => void
  onSave: (payload: {
    id?: string
    name: string
    url: string
    description: string
    active: boolean
    auth: McpAuth
  }) => void
}

type HeaderRow = McpHeader & { id: string }
type AuthType = McpAuth['type']

function createRowId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `header-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createHeaderRow(name = '', value = ''): HeaderRow {
  return { id: createRowId(), name, value }
}

function getInitialHeaders(initialData?: McpServer): HeaderRow[] {
  const headers = initialData?.auth.type === 'customHeaders' ? initialData.auth.headers : []
  if (headers.length === 0) {
    return [createHeaderRow()]
  }

  return headers.map((header) => createHeaderRow(header.name, header.value))
}

export default function McpServerFormModal({
  initialData,
  onCancel,
  onSave
}: McpServerFormModalProps): JSX.Element {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(false)
  const [authType, setAuthType] = useState<AuthType>('none')
  const [accessToken, setAccessToken] = useState('')
  const [headers, setHeaders] = useState<HeaderRow[]>([createHeaderRow()])
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setName(initialData?.name ?? '')
    setUrl(initialData?.url ?? '')
    setDescription(initialData?.description ?? '')
    setActive(initialData?.active ?? false)

    const auth = initialData?.auth ?? { type: 'none' as const }
    setAuthType(auth.type)
    setAccessToken(auth.type === 'accessToken' ? auth.token : '')
    setHeaders(getInitialHeaders(initialData))
    setErrorMessage('')
  }, [initialData])

  const isEditMode = Boolean(initialData)
  const isCustomHeaders = authType === 'customHeaders'
  const isAccessToken = authType === 'accessToken'
  const isDisabled = !name.trim() || !url.trim()

  const handleAddHeader = (): void => {
    setHeaders((current) => [...current, createHeaderRow()])
  }

  const handleRemoveHeader = (rowId: string): void => {
    setHeaders((current) => (current.length > 1 ? current.filter((row) => row.id !== rowId) : current))
  }

  const handleHeaderChange = (rowId: string, field: 'name' | 'value', value: string): void => {
    setHeaders((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    )
  }

  const handleSave = (): void => {
    if (!name.trim()) {
      setErrorMessage('MCP server name is required.')
      return
    }

    if (!url.trim()) {
      setErrorMessage('MCP server URL is required.')
      return
    }

    try {
      void new URL(url.trim())
    } catch {
      setErrorMessage('Enter a valid URL, for example https://mcp.example.com.')
      return
    }

    const auth: McpAuth =
      authType === 'accessToken'
        ? { type: 'accessToken', token: accessToken.trim() }
        : authType === 'customHeaders'
        ? {
            type: 'customHeaders',
            headers: headers
              .map((row) => ({ name: row.name.trim(), value: row.value.trim() }))
              .filter((row) => row.name)
          }
        : { type: 'none' }

    setErrorMessage('')
    onSave({
      id: initialData?.id,
      name: name.trim(),
      url: url.trim(),
      description: description.trim(),
      active,
      auth
    })
  }

  return (
    <ModalOverlay onClose={onCancel} contentClassName="max-w-2xl h-[640px]">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/95 p-5 shadow-[0_22px_60px_rgba(0,0,0,0.55)]">
        <h3 className="text-lg font-semibold text-neutral-100">
          {isEditMode ? 'Edit MCP Server' : 'Add MCP Server'}
        </h3>

        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-[1.1fr_1.4fr]">
            <div>
              <label htmlFor="mcp-name" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Name
              </label>
              <input
                id="mcp-name"
                type="text"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setErrorMessage('')
                }}
                placeholder="My MCP Server"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="mcp-url" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                URL
              </label>
              <input
                id="mcp-url"
                type="text"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value)
                  setErrorMessage('')
                }}
                placeholder="https://mcp.example.com"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="mcp-description" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
              Description <span className="normal-case text-neutral-500">(optional)</span>
            </label>
            <input
              id="mcp-description"
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Short summary of what this server does"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
            <div>
              <label htmlFor="mcp-auth" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Authentication
              </label>
              <select
                id="mcp-auth"
                value={authType}
                onChange={(event) => setAuthType(event.target.value as AuthType)}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
              >
                <option value="none">None</option>
                <option value="accessToken">Access token / API key</option>
                <option value="customHeaders">Custom headers</option>
              </select>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span>
                  <span className="block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">Active</span>
                  <span className="mt-1 block text-xs text-neutral-500">Active servers can contribute tools to chat.</span>
                </span>
                <span className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border transition-all ${active ? 'border-emerald-500/40 bg-emerald-500/20' : 'border-neutral-700 bg-neutral-800'}`}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(event) => setActive(event.target.checked)}
                    className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                  <span className={`pointer-events-none inline-block h-6 w-6 translate-x-0.5 rounded-full bg-neutral-100 transition-transform ${active ? 'translate-x-5' : ''}`} />
                </span>
              </label>
            </div>
          </div>

          {isAccessToken ? (
            <div>
              <label htmlFor="mcp-token" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Access Token / API Key
              </label>
              <input
                id="mcp-token"
                type="password"
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder="Token or API key"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                autoComplete="off"
              />
            </div>
          ) : null}

          {isCustomHeaders ? (
            <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">Custom headers</p>
                  <p className="mt-1 text-xs text-neutral-500">Add one or more headers that will be sent with each MCP request.</p>
                </div>
                <button
                  type="button"
                  onClick={handleAddHeader}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-neutral-100"
                >
                  + Header
                </button>
              </div>

              <div className="space-y-2">
                {headers.map((headerRow) => (
                  <div key={headerRow.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={headerRow.name}
                      onChange={(event) => handleHeaderChange(headerRow.id, 'name', event.target.value)}
                      placeholder="header"
                      className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                    />
                    <span className="text-sm text-neutral-500">:</span>
                    <input
                      type="text"
                      value={headerRow.value}
                      onChange={(event) => handleHeaderChange(headerRow.id, 'value', event.target.value)}
                      placeholder="value"
                      className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveHeader(headerRow.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-700 text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-100"
                      aria-label="Remove custom header"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <p className="text-xs text-neutral-500">HTTP Streamable MCP endpoints are expected to live at /mcp.</p>

          {errorMessage ? <p className="text-xs text-red-300">{errorMessage}</p> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDisabled}
            onClick={handleSave}
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}