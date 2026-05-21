import type { McpServer } from '../../../shared/mcp'

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
}

function getToolSummary(server: McpServer): string {
  if (server.tools.length === 0) {
    return 'No tools discovered yet'
  }

  const enabledCount = server.tools.filter((tool) => tool.enabled).length
  return `${enabledCount}/${server.tools.length} enabled`
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
  onRefreshTools
}: McpServersTabProps): JSX.Element {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral-100">MCP Servers</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Add streamable HTTP MCP servers, choose which ones are active, and control which tools are exposed to chat.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
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
          <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/70 px-4 py-6 text-sm text-neutral-500">
            No MCP servers saved yet. Add your first server to start discovering tools.
          </div>
        ) : null}

        {!isLoading && servers.map((server) => (
          <article key={server.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-neutral-100">{server.name}</h3>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] ${server.active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-neutral-700 bg-neutral-950 text-neutral-400'}`}>
                    {server.active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-neutral-400">
                    {getToolSummary(server)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">{server.url}</p>
                {server.description ? <p className="mt-2 text-sm text-neutral-400">{server.description}</p> : null}
                {server.lastError ? <p className="mt-2 text-xs text-red-300">{server.lastError}</p> : null}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onToggleActive(server, !server.active)}
                  className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                >
                  {server.active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => onRefreshTools(server)}
                  className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                >
                  Refresh tools
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(server)}
                  className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(server)}
                  className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-300"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">Discovered tools</p>
                <p className="text-xs text-neutral-500">Enable only the tools you want chat to use.</p>
              </div>

              <div className="mt-3 space-y-2">
                {server.tools.length === 0 ? (
                  <p className="text-xs text-neutral-500">No tools discovered yet.</p>
                ) : (
                  server.tools.map((tool) => (
                    <label
                      key={tool.name}
                      className="flex items-start justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                    >
                      <span>
                        <span className="block text-sm text-neutral-100">{tool.name}</span>
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
        ))}
      </div>

      {feedbackMessage ? <p className="text-xs text-emerald-300">{feedbackMessage}</p> : null}
    </div>
  )
}