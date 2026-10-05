import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  USAGE_RANGE_OPTIONS,
  type UsageCostPoint,
  type UsageErrorCode,
  type UsageMetrics,
  type UsageProject
} from '../../../../shared/system/usage'
import CustomSelect from '../../ui/CustomSelect'

interface UsageTabProps {
  adminKey: string
  onAdminKeyChange: (value: string) => void
  onSaveAdminKey: () => void
  isSavingAdminKey: boolean
  isConfigLoaded: boolean
  adminKeyFeedback: string
  refreshSignal: number
  projectId: string
  onProjectChange: (projectId: string) => void
}

interface UsageError {
  code: UsageErrorCode
  message: string
}

const FULL_NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function formatMoney(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '$0.00'
  if (Math.abs(value) < 0.01) return `$${value.toFixed(4)}`
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`
  return FULL_NUMBER.format(value)
}

function formatDay(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

function Card({
  title,
  description,
  children
}: {
  title?: string
  description?: string
  children: ReactNode
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5">
      {title ? <h2 className="text-base font-semibold text-neutral-100">{title}</h2> : null}
      {description ? <p className="mt-1 text-sm text-neutral-400">{description}</p> : null}
      <div className={title || description ? 'mt-4' : ''}>{children}</div>
    </section>
  )
}

function StatCard({
  label,
  value,
  hint
}: {
  label: string
  value: string
  hint?: string
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-neutral-500">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums text-neutral-100">{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  )
}

function SpendChart({ daily }: { daily: UsageCostPoint[] }): JSX.Element {
  const [hover, setHover] = useState<number | null>(null)

  const width = 640
  const height = 176
  const padX = 10
  const padTop = 14
  const padBottom = 26
  const innerWidth = width - padX * 2
  const innerHeight = height - padTop - padBottom

  const max = daily.reduce((peak, point) => Math.max(peak, point.amount), 0)
  const step = daily.length > 0 ? innerWidth / daily.length : innerWidth
  const barWidth = Math.max(Math.min(step * 0.6, 24), 2)
  const baseline = padTop + innerHeight

  const labelIndices = useMemo(() => {
    if (daily.length === 0) return []
    const candidates = [0, Math.floor((daily.length - 1) / 2), daily.length - 1]
    return [...new Set(candidates)]
  }, [daily.length])

  if (daily.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-neutral-800 text-sm text-neutral-500">
        No spend recorded for this range.
      </div>
    )
  }

  const activePoint = hover !== null ? daily[hover] : null

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Daily spend over the selected range"
        onMouseLeave={() => setHover(null)}
      >
        <line
          x1={padX}
          y1={baseline}
          x2={width - padX}
          y2={baseline}
          className="stroke-neutral-800"
          strokeWidth="1"
        />

        {daily.map((point, index) => {
          const barHeight = max > 0 ? (point.amount / max) * innerHeight : 0
          const x = padX + index * step + (step - barWidth) / 2
          const y = baseline - Math.max(barHeight, point.amount > 0 ? 2 : 0)
          const isActive = hover === index

          return (
            <g key={point.startTime}>
              <rect
                x={padX + index * step}
                y={padTop}
                width={step}
                height={innerHeight}
                fill="transparent"
                onMouseEnter={() => setHover(index)}
              />
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, point.amount > 0 ? 2 : 0)}
                rx={Math.min(barWidth / 2, 3)}
                className={`transition-colors ${isActive ? 'fill-neutral-300' : 'fill-neutral-600'}`}
                pointerEvents="none"
              />
            </g>
          )
        })}

        {labelIndices.map((index) => (
          <text
            key={`label-${index}`}
            x={padX + index * step + step / 2}
            y={height - 8}
            textAnchor={index === 0 ? 'start' : index === daily.length - 1 ? 'end' : 'middle'}
            className="fill-neutral-500 text-[10px]"
          >
            {formatDay(daily[index].startTime)}
          </text>
        ))}
      </svg>

      {activePoint ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-950/95 px-2.5 py-1.5 text-center shadow-lg"
          style={{ left: `${((hover! + 0.5) / daily.length) * 100}%`, top: 0 }}
        >
          <p className="text-[10px] uppercase tracking-[0.08em] text-neutral-500">
            {formatDay(activePoint.startTime)}
          </p>
          <p className="text-sm font-semibold tabular-nums text-neutral-100">
            {formatMoney(activePoint.amount)}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function ModelTable({ metrics }: { metrics: UsageMetrics }): JSX.Element {
  const models = metrics.byModel
  const visible = models.slice(0, 6)

  if (models.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-800 px-4 py-6 text-sm text-neutral-500">
        No model usage recorded for this range.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-900/80 text-[10px] uppercase tracking-[0.08em] text-neutral-500">
            <th className="px-4 py-2.5 text-left font-medium">Model</th>
            <th className="px-3 py-2.5 text-right font-medium">Requests</th>
            <th className="px-3 py-2.5 text-right font-medium">Input</th>
            <th className="px-3 py-2.5 text-right font-medium">Output</th>
            <th className="px-4 py-2.5 text-right font-medium">Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((model) => (
            <tr key={model.model} className="border-b border-neutral-800/70 last:border-b-0">
              <td className="max-w-0 px-4 py-2.5">
                <span className="block truncate font-medium text-neutral-200" title={model.model}>
                  {model.model}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-neutral-300">
                {FULL_NUMBER.format(model.requests)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400" title={`${FULL_NUMBER.format(model.inputTokens)} tokens (${formatTokens(model.cachedInputTokens)} cached)`}>
                {formatTokens(model.inputTokens)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">
                {formatTokens(model.outputTokens)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">
                {model.estimatedCost === null ? (
                  <span className="text-neutral-600">—</span>
                ) : (
                  formatMoney(model.estimatedCost)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {models.length > visible.length ? (
        <p className="border-t border-neutral-800 bg-neutral-900/50 px-4 py-2 text-[11px] text-neutral-500">
          Showing top {visible.length} of {models.length} models by spend.
        </p>
      ) : null}
    </div>
  )
}

function ServiceBreakdown({ metrics }: { metrics: UsageMetrics }): JSX.Element {
  if (metrics.byService.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-800 px-4 py-6 text-sm text-neutral-500">
        No cost breakdown available for this range.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {metrics.byService.slice(0, 8).map((service) => {
        const share = metrics.totalCost > 0 ? (service.amount / metrics.totalCost) * 100 : 0
        return (
          <div key={service.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-neutral-300" title={service.label}>
                {service.label}
              </span>
              <span className="flex-shrink-0 tabular-nums text-neutral-200">{formatMoney(service.amount)}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full rounded-full bg-neutral-500/80"
                  style={{ width: `${Math.max(Math.min(share, 100), share > 0 ? 2 : 0)}%` }}
                />
              </div>
              <span className="w-10 text-right text-[10px] tabular-nums text-neutral-500">
                {share.toFixed(0)}%
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LoadingState(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-[78px] animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900/70" />
        ))}
      </div>
      <div className="h-44 animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900/70" />
      <div className="h-40 animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900/70" />
    </div>
  )
}

export default function UsageTab({
  adminKey,
  onAdminKeyChange,
  onSaveAdminKey,
  isSavingAdminKey,
  isConfigLoaded,
  adminKeyFeedback,
  refreshSignal,
  projectId,
  onProjectChange
}: UsageTabProps): JSX.Element {
  const [rangeDays, setRangeDays] = useState<number>(30)
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<UsageError | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [projects, setProjects] = useState<UsageProject[]>([])

  useEffect(() => {
    let cancelled = false

    const loadProjects = async (): Promise<void> => {
      if (!window.api?.usage?.getProjects) return
      try {
        const result = await window.api.usage.getProjects()
        if (cancelled || !result.ok) return
        setProjects(result.projects)
      } catch {
        // The selector falls back to "All projects" when the list is unavailable.
      }
    }

    void loadProjects()

    return () => {
      cancelled = true
    }
  }, [refreshSignal])

  useEffect(() => {
    let cancelled = false

    const load = async (): Promise<void> => {
      if (!window.api?.usage?.getMetrics) {
        setError({ code: 'UNKNOWN', message: 'Usage API is unavailable in this build.' })
        return
      }

      setIsLoading(true)
      try {
        const result = await window.api.usage.getMetrics(rangeDays, projectId)
        if (cancelled) return
        if (result.ok) {
          setMetrics(result.metrics)
          setError(null)
        } else {
          setMetrics(null)
          setError({ code: result.code, message: result.message })
        }
      } catch (loadError) {
        if (cancelled) return
        setMetrics(null)
        setError({
          code: 'UNKNOWN',
          message: loadError instanceof Error ? loadError.message : 'Unable to load usage metrics.'
        })
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [rangeDays, reloadToken, refreshSignal, projectId])

  const projectOptions = useMemo(() => {
    const options = [{ value: '', label: 'All projects' }, ...projects.map((project) => ({ value: project.id, label: project.name || project.id }))]
    if (projectId && !projects.some((project) => project.id === projectId)) {
      options.splice(1, 0, { value: projectId, label: projectId })
    }
    return options
  }, [projects, projectId])

  const avgCostPerRequest =
    metrics && metrics.totalRequests > 0 ? metrics.totalCost / metrics.totalRequests : 0

  return (
    <div className="space-y-6">
      <Card
        title="Admin API Key"
        description="Organization admin key (sk-admin-…) used only to read usage and cost data. Stored locally, never sent anywhere else."
      >
        <div className="flex items-center gap-3">
          <input
            type="password"
            value={adminKey}
            onChange={(event) => onAdminKeyChange(event.target.value)}
            placeholder="sk-admin-..."
            autoComplete="off"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onSaveAdminKey}
            disabled={isSavingAdminKey || !isConfigLoaded}
            className="flex-shrink-0 rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingAdminKey ? 'Saving...' : 'Save'}
          </button>
        </div>
        {adminKeyFeedback ? <p className="mt-2 text-xs text-emerald-300">{adminKeyFeedback}</p> : null}
      </Card>

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

        <div className="w-full min-w-[180px] sm:w-56">
          <CustomSelect
            options={projectOptions}
            value={projectId}
            onChange={onProjectChange}
            disabled={projects.length === 0}
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          {metrics ? (
            <span className="text-[11px] text-neutral-500">
              Updated{' '}
              {new Date(metrics.fetchedAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          ) : null}
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
            error.code === 'UNAUTHORIZED'
              ? 'border-red-500/40 bg-red-500/10 text-red-300'
              : error.code === 'ADMIN_KEY_MISSING'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-neutral-800 bg-neutral-900/70 text-neutral-300'
          }`}
        >
          {error.message}
        </div>
      ) : null}

      {isLoading && !metrics ? <LoadingState /> : null}

      {metrics && !isLoading ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Total spend"
              value={formatMoney(metrics.totalCost)}
              hint={`${metrics.rangeDays}-day total`}
            />
            <StatCard
              label="Requests"
              value={formatTokens(metrics.totalRequests)}
              hint="Model requests"
            />
            <StatCard
              label="Tokens"
              value={formatTokens(metrics.totalInputTokens + metrics.totalOutputTokens)}
              hint={`${formatTokens(metrics.totalInputTokens)} in · ${formatTokens(metrics.totalOutputTokens)} out`}
            />
            <StatCard
              label="Avg / request"
              value={formatMoney(avgCostPerRequest)}
              hint="Blended across models"
            />
          </div>

          <Card title="Daily spend" description={`Cost per day over the last ${metrics.rangeDays} days.`}>
            <SpendChart daily={metrics.daily} />
          </Card>

          <Card
            title="By model"
            description="Request and token volume per model. Costs are estimated from published rates."
          >
            <ModelTable metrics={metrics} />
          </Card>

          <Card title="By service" description="Exact billed cost per line item from OpenAI.">
            <ServiceBreakdown metrics={metrics} />
          </Card>
        </>
      ) : null}
    </div>
  )
}
