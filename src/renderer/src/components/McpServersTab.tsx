import { useState } from 'react'
import type { McpAuth, McpServer } from '../../../shared/mcp'
import { PresetLogo, type BrandKind } from './brands'
import { MoreIcon } from './icons'

export interface McpPreset {
  id: string
  name: string
  url: string
  description: string
  authType: McpAuth['type']
  logo: BrandKind
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: 'github',
    name: 'GitHub',
    url: 'https://api.githubcopilot.com/mcp/',
    description: 'Repositories, issues, and code tools. Requires a GitHub token.',
    authType: 'accessToken',
    logo: 'github'
  },
  {
    id: 'slack',
    name: 'Slack',
    url: 'https://mcp.slack.com/mcp',
    description: 'Workspace messages and channels. Requires an OAuth token.',
    authType: 'accessToken',
    logo: 'slack'
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    url: 'https://api.brave.com/mcp/',
    description: 'Web search with citations. Requires a Brave API key.',
    authType: 'accessToken',
    logo: 'brave'
  }
]

interface McpServersTabProps {
  servers: McpServer[]
  isLoading: boolean
  feedbackMessage: string
  onAdd: () => void
  onEdit: (server: McpServer) => void
  onDelete: (server: McpServer) => void
  onToggleActive: (server: McpServer, active: boolean) => void
  onToggleTool: (server: McpServer, toolName: string, enabled: boolean) => void
  onRefreshTools: (server: McpServer) => void
  onTest: (server: McpServer) => void
  onApplyPreset: (preset: McpPreset) => void
}

function getToolSummary(server: McpServer): string {
  if (server.tools.length === 0) {
    return 'No tools discovered yet'
  }

  const enabledCount = server.tools.filter((tool) => tool.enabled).length
  return `${enabledCount}/${server.tools.length} enabled`
}

type ConnectionState = 'connected' | 'error' | 'unknown'

function getConnectionState(server: McpServer): ConnectionState {
  if (server.lastError) return 'error'
  if (typeof server.lastSyncedAt === 'number') return 'connected'
  return 'unknown'
}

function formatRelativeTime(timestamp: number): string {
  const elapsedMs = Date.now() - timestamp
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  if (elapsedSeconds < 5) return 'just now'
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`
  const elapsedMinutes = Math.floor(elapsedSeconds / 60)
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}h ago`
  const elapsedDays = Math.floor(elapsedHours / 24)
  return `${elapsedDays}d ago`
}

const CONNECTION_LABELS: Record<ConnectionState, { label: string; className: string }> = {
  connected: {
    label: 'Connected',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  },
  error: {
    label: 'Error',
    className: 'border-red-500/30 bg-red-500/10 text-red-300'
  },
  unknown: {
    label: 'Not synced',
    className: 'border-neutral-700 bg-neutral-950 text-neutral-400'
  }
}

function findPresetLogo(server: McpServer): BrandKind | undefined {
  const url = server.url.toLowerCase()
  return MCP_PRESETS.find((preset) => url.includes(preset.url.toLowerCase()))?.logo
}

function McpServerCard({
  server,
  onToggleActive,
  onToggleTool,
  onRefreshTools,
  onTest,
  onEdit,
  onDelete
}: {
  server: McpServer
  onToggleActive: (server: McpServer, active: boolean) => void
  onToggleTool: (server: McpServer, toolName: string, enabled: boolean) => void
  onRefreshTools: (server: McpServer) => void
  onTest: (server: McpServer) => void
  onEdit: (server: McpServer) => void
  onDelete: (server: McpServer) => void
}): JSX.Element {
  const [toolFilter, setToolFilter] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const connection = getConnectionState(server)
  const connectionMeta = CONNECTION_LABELS[connection]
  const enabledCount = server.tools.filter((tool) => tool.enabled).length
  const filteredTools = server.tools.filter((tool) =>
    tool.name.toLowerCase().includes(toolFilter.trim().toLowerCase())
  )
  const logo = findPresetLogo(server)

  const setAllTools = (enabled: boolean): void => {
    server.tools.forEach((tool) => {
      if (tool.enabled !== enabled) {
        onToggleTool(server, tool.name, enabled)
      }
    })
  }

  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {logo ? (
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-neutral-800 text-neutral-200">
                <PresetLogo kind={logo} />
              </span>
            ) : null}
            <h3 className="text-sm font-semibold text-neutral-100">{server.name}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] ${server.active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-neutral-700 bg-neutral-950 text-neutral-400'}`}>
              {server.active ? 'Active' : 'Inactive'}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] ${connectionMeta.className}`}>
              {connectionMeta.label}
            </span>
            <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-neutral-400">
              {getToolSummary(server)}
            </span>
            {typeof server.lastSyncedAt === 'number' ? (
              <span className="text-[11px] text-neutral-500">synced {formatRelativeTime(server.lastSyncedAt)}</span>
            ) : null}
          </div>
          <p className="mt-1 break-all text-xs text-neutral-500">{server.url}</p>
          {server.description ? <p className="mt-2 text-sm text-neutral-400">{server.description}</p> : null}
          {server.lastError ? <p className="mt-2 break-all text-xs text-red-300">{server.lastError}</p> : null}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            role="switch"
            aria-checked={server.active}
            onClick={() => onToggleActive(server, !server.active)}
            className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs transition-colors ${
              server.active
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'
            }`}
          >
            <span className={`relative inline-flex h-4 w-7 rounded-full transition-colors ${server.active ? 'bg-emerald-500/70' : 'bg-neutral-700'}`}>
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${server.active ? 'translate-x-3.5' : 'translate-x-0.5'}`}
              />
            </span>
            {server.active ? 'Active' : 'Inactive'}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              className="rounded-lg border border-transparent p-2 text-neutral-400 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-200"
              aria-label="Server actions"
            >
              <MoreIcon />
            </button>
            {isMenuOpen ? (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setIsMenuOpen(false)} />
                <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-neutral-700 bg-neutral-900 p-1 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                  <button
                    type="button"
                    onClick={() => {
                      onTest(server)
                      setIsMenuOpen(false)
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
                  >
                    Test connection
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRefreshTools(server)
                      setIsMenuOpen(false)
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
                  >
                    Refresh tools
                  </button>
                  <div className="my-1 h-px bg-neutral-800" />
                  <button
                    type="button"
                    onClick={() => {
                      onEdit(server)
                      setIsMenuOpen(false)
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
                  >
                    Edit…
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(server)
                      setIsMenuOpen(false)
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs text-red-300 transition-colors hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">Discovered tools</p>
            {server.tools.length > 0 ? (
              <span className="text-xs text-neutral-500">{enabledCount} enabled</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAllTools(true)}
              disabled={enabledCount === server.tools.length}
              className="rounded-lg border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Enable all
            </button>
            <button
              type="button"
              onClick={() => setAllTools(false)}
              disabled={enabledCount === 0}
              className="rounded-lg border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Disable all
            </button>
          </div>
        </div>

        {server.tools.length > 1 ? (
          <input
            type="text"
            value={toolFilter}
            onChange={(event) => setToolFilter(event.target.value)}
            placeholder="Filter tools…"
            className="mt-3 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
          />
        ) : null}

        <div className="mt-3 space-y-2">
          {server.tools.length === 0 ? (
            <p className="text-xs text-neutral-500">
              No tools discovered yet. Activate the server to fetch them automatically.
            </p>
          ) : filteredTools.length === 0 ? (
            <p className="text-xs text-neutral-500">No tools match “{toolFilter}”.</p>
          ) : (
            filteredTools.map((tool) => (
              <label
                key={tool.name}
                className="flex items-start justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block break-all text-sm text-neutral-100">{tool.name}</span>
                  {tool.description ? <span className="mt-1 block text-xs text-neutral-500">{tool.description}</span> : null}
                </span>

                <span className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-[0.08em] text-neutral-500">
                    {tool.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <input
                    type="checkbox"
                    checked={tool.enabled}
                    onChange={(event) => onToggleTool(server, tool.name, event.target.checked)}
                    className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-neutral-100"
                  />
                </span>
              </label>
            ))
          )}
        </div>
      </div>
    </article>
  )
}

function PresetCard({
  preset,
  onApply
}: {
  preset: McpPreset
  onApply: (preset: McpPreset) => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onApply(preset)}
      className="group flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-800/80"
    >
      <span className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-200">
          <PresetLogo kind={preset.logo} />
        </span>
        <span className="text-sm font-medium text-neutral-100">{preset.name}</span>
      </span>
      <span className="text-xs leading-relaxed text-neutral-500">{preset.description}</span>
      <span className="text-xs font-medium text-emerald-300 opacity-0 transition-opacity group-hover:opacity-100">
        + Add server
      </span>
    </button>
  )
}

export default function McpServersTab({
  servers,
  isLoading,
  feedbackMessage,
  onAdd,
  onEdit,
  onDelete,
  onToggleActive,
  onToggleTool,
  onRefreshTools,
  onTest,
  onApplyPreset
}: McpServersTabProps): JSX.Element {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral-100">MCP Servers</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Connect streamable HTTP MCP servers, control which tools are exposed to chat, and see their status at a glance.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex-shrink-0 rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
        >
          Add MCP Server
        </button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 px-4 py-6 text-sm text-neutral-400">
            Loading MCP servers...
          </div>
        ) : null}

        {!isLoading && servers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/70 p-5">
            <p className="text-sm text-neutral-300">Start with a popular server</p>
            <p className="mt-1 text-xs text-neutral-500">
              These prefill the connection settings — add your own token where required, or add a custom server below.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {MCP_PRESETS.map((preset) => (
                <PresetCard key={preset.id} preset={preset} onApply={onApplyPreset} />
              ))}
            </div>
            <button
              type="button"
              onClick={onAdd}
              className="mt-4 text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-200"
            >
              Or add a custom server…
            </button>
          </div>
        ) : null}

        {!isLoading &&
          servers.map((server) => (
            <McpServerCard
              key={server.id}
              server={server}
              onToggleActive={onToggleActive}
              onToggleTool={onToggleTool}
              onRefreshTools={onRefreshTools}
              onTest={onTest}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
      </div>

      {feedbackMessage ? <p className="text-xs text-emerald-300">{feedbackMessage}</p> : null}
    </div>
  )
}