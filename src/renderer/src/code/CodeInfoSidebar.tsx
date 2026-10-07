import type { ReactNode } from 'react'
import type { CodeUsage } from '../../../shared/code/code'

interface CodeInfoSidebarProps {
  modelLabel: string | null
  variant: string | null
  agent?: string
  contextLimit?: number
  usage: CodeUsage | null
  cost: number | null
}

function formatTokens(value: number | undefined): string {
  if (!value || value <= 0) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

function formatCost(value: number | null | undefined): string {
  if (value == null || value <= 0) return '$0.00'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="truncate text-neutral-500">{label}</span>
      <span className="shrink-0 tabular-nums text-neutral-300" title={value}>
        {value}
      </span>
    </div>
  )
}

export default function CodeInfoSidebar({
  modelLabel,
  variant,
  agent,
  contextLimit,
  usage,
  cost
}: CodeInfoSidebarProps): JSX.Element {
  const used = usage?.input ?? 0
  const percent =
    contextLimit && contextLimit > 0 ? Math.min(100, Math.round((used / contextLimit) * 100)) : 0
  const hasContext = Boolean(contextLimit) || used > 0

  return (
    <div className="h-full w-full space-y-4 overflow-y-auto pr-1 chat-scrollbar">
      <Section title="Model">
        <Row label="Model" value={modelLabel ?? 'Provider default'} />
        {variant && <Row label="Reasoning" value={variant} />}
        {agent && <Row label="Agent" value={agent} />}
      </Section>

      <Section title="Context">
        {hasContext ? (
          <>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-neutral-500">Used</span>
              <span className="tabular-nums text-neutral-200">
                {formatTokens(used)}
                {contextLimit ? ` / ${formatTokens(contextLimit)}` : ''}
              </span>
            </div>
            {contextLimit ? (
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${percent}%`, background: 'var(--chat-accent)' }}
                />
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-neutral-500">No usage yet.</p>
        )}
      </Section>

      <Section title="Tokens">
        <Row label="Input" value={formatTokens(usage?.input)} />
        <Row label="Output" value={formatTokens(usage?.output)} />
        <Row label="Reasoning" value={formatTokens(usage?.reasoning)} />
        <Row label="Cache read" value={formatTokens(usage?.cacheRead)} />
        <Row label="Cache write" value={formatTokens(usage?.cacheWrite)} />
      </Section>

      <Section title="Cost">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-neutral-500">Session spend</span>
          <span className="tabular-nums text-neutral-100">{formatCost(cost)}</span>
        </div>
      </Section>
    </div>
  )
}
