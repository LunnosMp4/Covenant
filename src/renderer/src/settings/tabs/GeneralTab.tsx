import type { UpdateStatus } from '../../../../shared/system/update'
import { MinimalistToggle, SectionCard } from '../primitives'
import { formatUpdateBytes, getUpdateStatusLabel } from '../helpers'

interface GeneralTabProps {
  proxyUrl: string
  onProxyUrlChange: (value: string) => void
  launchOnStartup: boolean
  onLaunchOnStartupChange: (value: boolean) => void
  autoUpdate: boolean
  onAutoUpdateChange: (value: boolean) => void
  updateStatus: UpdateStatus
  onCheckForUpdates: () => void
  onInstallUpdate: () => void
}

export default function GeneralTab({
  proxyUrl,
  onProxyUrlChange,
  launchOnStartup,
  onLaunchOnStartupChange,
  autoUpdate,
  onAutoUpdateChange,
  updateStatus,
  onCheckForUpdates,
  onInstallUpdate
}: GeneralTabProps): JSX.Element {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Startup"
        description="Automatically launch Covenant when you start your computer."
      >
        <MinimalistToggle
          checked={launchOnStartup}
          onChange={onLaunchOnStartupChange}
          label="Launch on startup"
          description="Covenant will open automatically when your system starts."
        />
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
                  className="pressable btn-primary flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
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
                    className={`progress-fill h-full rounded-full ${
                      updateStatus.state === 'downloaded' ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                    style={{
                      transform: `scaleX(${Math.min(Math.max(updateStatus.percent, 0), 100) / 100})`
                    }}
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
        title="Network"
        description="Outbound requests from Covenant (OpenAI, OpenCode, MCP, and web search) can go through a proxy."
      >
        <div>
          <label htmlFor="proxy-url" className="mb-2 block text-sm font-medium text-neutral-300">
            Proxy URL
          </label>
          <input
            id="proxy-url"
            type="text"
            value={proxyUrl}
            onChange={(event) => onProxyUrlChange(event.target.value)}
            placeholder="http://proxy.company.local:8080"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
            autoComplete="off"
          />
          <p className="mt-2 text-xs text-neutral-500">
            Leave empty for direct access. SearXNG can bypass the proxy for local addresses from
            the Web Search page.
          </p>
        </div>
      </SectionCard>
    </div>
  )
}
