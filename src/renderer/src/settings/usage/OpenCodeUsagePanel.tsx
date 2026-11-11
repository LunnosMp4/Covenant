import { useEffect, useState } from 'react'
import { USAGE_RANGE_OPTIONS } from '../../../../shared/system/usage'
import type {
  OpenCodeUsageErrorCode,
  OpenCodeUsageMeter,
  OpenCodeUsageSnapshot
} from '../../../../shared/ai/opencodeUsage'
import {
  Card,
  LoadingState,
  ModelTable,
  ServiceBreakdown,
  SpendChart,
  StatCard,
  formatMoney,
  formatTokens
} from './shared'

interface OpenCodeUsagePanelProps {
  hasOpenCodeKey: boolean
  onNavigateToProviders: () => void
}

interface OpenCodePanelError {
  code: OpenCodeUsageErrorCode
  message: string
}

function formatReset(resetsAt?: number): string {
  if (!resetsAt) return ''
  const delta = resetsAt - Date.now()
  if (delta <= 0) return 'resetting now'
  const minutes = Math.floor(delta / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
  return `${Math.max(1, minutes)}m`
}

function Meter({ label, meter }: { label: string; meter: OpenCodeUsageMeter }): JSX.Element {
  const percent = Math.max(0, Math.min(100, meter.percent))
  const reset = formatReset(meter.resetsAt)
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
          {label}
        </span>
        <span className="text-sm font-semibold tabular-nums text-neutral-100">
          {percent.toFixed(percent < 10 ? 1 : 0)}%
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full ${
            percent >= 90 ? 'bg-red-400' : percent >= 70 ? 'bg-amber-400' : 'bg-emerald-400'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
        <span>
          {percent >= 100
            ? 'Allowance exhausted'
            : meter.limitUsd !== undefined
              ? `of ${formatMoney(meter.limitUsd)} pool`
              : 'of allowance used'}
        </span>
        {reset ? <span>resets in {reset}</span> : null}
      </div>
    </div>
  )
}

export default function OpenCodeUsagePanel({
  hasOpenCodeKey,
  onNavigateToProviders
}: OpenCodeUsagePanelProps): JSX.Element {
  const [rangeDays, setRangeDays] = useState<number>(30)
  const [snapshot, setSnapshot] = useState<OpenCodeUsageSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<OpenCodePanelError | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    const load = async (): Promise<void> => {
      if (!hasOpenCodeKey) {
        setSnapshot(null)
        setError({
          code: 'KEY_MISSING',
          message: 'Add your OpenCode API key in AI → Providers & Keys to load real usage and credits.'
        })
        return
      }
      if (!window.api?.usage?.getOpenCodeUsage) {
        setError({ code: 'UNKNOWN', message: 'OpenCode usage is unavailable in this build.' })
        return
      }

      setIsLoading(true)
      try {
        const result = await window.api.usage.getOpenCodeUsage(rangeDays)
        if (cancelled) return
        if (result.ok) {
          setSnapshot(result.snapshot)
          setError(null)
        } else {
          setSnapshot(null)
          setError({ code: result.code, message: result.message })
        }
      } catch (loadError) {
        if (cancelled) return
        setSnapshot(null)
        setError({
          code: 'UNKNOWN',
          message: loadError instanceof Error ? loadError.message : 'Unable to load OpenCode usage.'
        })
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [rangeDays, reloadToken, hasOpenCodeKey])

  const go = snapshot?.go
  const spend = snapshot?.spend
  const avgCostPerRequest =
    spend && spend.totalRequests > 0 ? spend.totalCost / spend.totalRequests : 0
  const errors = snapshot?.errors ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-neutral-800 bg-neutral-900/70 p-1">
          {USAGE_RANGE_OPTIONS.map((option) => {
            const isActive = rangeDays === option
            return (
              <button
                key={option}
                type="button"
                onClick={() => setRangeDays(option)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-neutral-800 text-neutral-100'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {option} days
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                errors.length > 0 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
            />
            Live from OpenCode Console
          </span>
          {snapshot ? (
            <span>
              Updated{' '}
              {new Date(snapshot.fetchedAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.api?.openExternal?.('https://opencode.ai/console')}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
          >
            Open Console
          </button>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            disabled={isLoading}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && !isLoading ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN'
              ? 'border-red-500/40 bg-red-500/10 text-red-300'
              : error.code === 'KEY_MISSING'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-neutral-800 bg-neutral-900/70 text-neutral-300'
          }`}
        >
          <p>{error.message}</p>
          {error.code === 'KEY_MISSING' || error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN' ? (
            <button
              type="button"
              onClick={onNavigateToProviders}
              className="mt-2 text-xs font-medium underline underline-offset-2"
            >
              Open Providers &amp; Keys
            </button>
          ) : null}
          {error.code === 'FORBIDDEN' ? (
            <p className="mt-2 text-xs opacity-80">
              Create an OpenCode API key with <strong>Usage: Read</strong>, or use a Go key.
            </p>
          ) : null}
        </div>
      ) : null}

      {isLoading && !snapshot ? <LoadingState /> : null}

      {snapshot && !isLoading ? (
        <>
          {go ? (
            <Card
              title={go.product ? `${go.product} plan` : 'OpenCode Go'}
              description={
                go.accessEndsAt
                  ? `Current period ends ${new Date(go.accessEndsAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}${go.cancelAtPeriodEnd ? ' · cancels automatically' : ''}.`
                  : 'Usage limits reported by OpenCode Console.'
              }
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {go.meters.fiveHour ? <Meter label="5 hours" meter={go.meters.fiveHour} /> : null}
                {go.meters.week ? <Meter label="Weekly" meter={go.meters.week} /> : null}
                {go.meters.month ? <Meter label="Monthly" meter={go.meters.month} /> : null}
              </div>
            </Card>
          ) : null}

          {spend ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label="Total spend"
                  value={formatMoney(spend.totalCost)}
                  hint={`${spend.rangeDays}-day total`}
                />
                <StatCard
                  label="Requests"
                  value={formatTokens(spend.totalRequests)}
                  hint="Model requests"
                />
                <StatCard
                  label="Tokens"
                  value={formatTokens(
                    spend.totalInputTokens +
                      (spend.totalCachedInputTokens ?? 0) +
                      spend.totalOutputTokens
                  )}
                  hint={
                    spend.totalCachedInputTokens
                      ? `${formatTokens(spend.totalInputTokens)} in · ${formatTokens(spend.totalCachedInputTokens)} cached · ${formatTokens(spend.totalOutputTokens)} out`
                      : `${formatTokens(spend.totalInputTokens)} in · ${formatTokens(spend.totalOutputTokens)} out`
                  }
                />
                <StatCard
                  label="Avg / request"
                  value={formatMoney(avgCostPerRequest)}
                  hint="Blended across models"
                />
              </div>

              <Card title="Daily spend" description={`Cost per day over the last ${spend.rangeDays} days.`}>
                <SpendChart daily={spend.daily} />
              </Card>

              <Card
                title="By model"
                description="Request and token volume per model, as reported by OpenCode Console."
              >
                <ModelTable metrics={spend} />
              </Card>

              {spend.byService.length > 0 ? (
                <Card
                  title="By service"
                  description="Exact billed cost per line item from OpenCode Console."
                >
                  <ServiceBreakdown metrics={spend} />
                </Card>
              ) : null}
            </>
          ) : (
            <Card
              title="Spending history"
              description="The current key cannot read detailed usage history."
            >
              <p className="text-sm text-neutral-400">
                Go meters are shown above. To see daily spend and per-model breakdowns, create an
                OpenCode API key with <strong>Usage: Read</strong> permission.
              </p>
            </Card>
          )}

          {errors.length > 0 ? (
            <details className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-xs text-neutral-400">
              <summary className="cursor-pointer select-none text-neutral-300">
                Some OpenCode endpoints could not be read ({errors.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {errors.map((entry) => (
                  <li key={`${entry.source}-${entry.code}`}>
                    <span className="text-neutral-500">{entry.source}:</span> {entry.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
