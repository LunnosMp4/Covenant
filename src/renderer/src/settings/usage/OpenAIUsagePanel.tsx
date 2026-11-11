import { useEffect, useMemo, useState } from 'react'
import {
  USAGE_RANGE_OPTIONS,
  type UsageErrorCode,
  type UsageMetrics,
  type UsageProject
} from '../../../../shared/system/usage'
import CustomSelect from '../../ui/CustomSelect'
import SecretField from '../SecretField'
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
import type { SecretFieldResult } from '../SecretField'

interface OpenAIUsagePanelProps {
  hasAdminKey: boolean
  onSaveAdminKey: (key: string) => Promise<SecretFieldResult>
  onClearAdminKey: () => Promise<void>
  refreshSignal: number
  projectId: string
  onProjectChange: (projectId: string) => void
  isConfigLoaded: boolean
}

interface UsageError {
  code: UsageErrorCode
  message: string
}

export default function OpenAIUsagePanel({
  hasAdminKey,
  onSaveAdminKey,
  onClearAdminKey,
  refreshSignal,
  projectId,
  onProjectChange,
  isConfigLoaded
}: OpenAIUsagePanelProps): JSX.Element {
  const [rangeDays, setRangeDays] = useState<number>(30)
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<UsageError | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [projects, setProjects] = useState<UsageProject[]>([])

  useEffect(() => {
    let cancelled = false

    const loadProjects = async (): Promise<void> => {
      if (!window.api?.usage?.getProjects) {
        setProjects([])
        return
      }
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
        const result = await window.api.usage.getMetrics(rangeDays, projectId, 'openai')
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
        description="Organization admin key (sk-admin-…) used only to read usage and cost data. This is not your regular OpenAI API key."
      >
        <SecretField
          label="Admin API key"
          hasSavedValue={hasAdminKey}
          placeholder="sk-admin-..."
          disabled={!isConfigLoaded}
          onSave={onSaveAdminKey}
          onClear={onClearAdminKey}
          clearLabel="Remove key"
        />
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
          <div className={`grid grid-cols-2 gap-3 ${metrics.allowance ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
            <StatCard
              label="Total spend"
              value={formatMoney(metrics.totalCost)}
              hint={`${metrics.rangeDays}-day total`}
            />
            {metrics.allowance ? (
              <StatCard
                label="Go allowance"
                value={formatMoney(metrics.allowance)}
                hint="Counted toward Go limits"
              />
            ) : null}
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

          <Card
            title="By service"
            description="Exact billed cost per line item from OpenAI."
          >
            <ServiceBreakdown metrics={metrics} />
          </Card>
        </>
      ) : null}
    </div>
  )
}
