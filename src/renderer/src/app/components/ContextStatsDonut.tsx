import { CHAT_MODEL_OPTIONS } from '../../../../shared/config'
import { formatCurrency, formatTokenCount, type ContextStats } from '../../utils/chat/chatUsage'

interface ContextStatsDonutProps {
  stats: ContextStats | null
  chatModel: string
  /** Overrides the label shown in the tooltip (e.g. an OpenCode model). */
  modelLabel?: string
}

export default function ContextStatsDonut({
  stats,
  chatModel,
  modelLabel
}: ContextStatsDonutProps): JSX.Element | null {
  if (!stats || stats.maxTokens <= 0) return null

  const radius = 11
  const circumference = 2 * Math.PI * radius
  const fillPercent = Math.min(stats.totalTokens / stats.maxTokens, 1)
  const dashOffset = circumference * (1 - fillPercent)
  let progressClass = 'stroke-white/50'
  if (fillPercent > 0.95) progressClass = 'stroke-red-500/80'
  else if (fillPercent > 0.8) progressClass = 'stroke-amber-500/80'

  return (
    <div className="relative group">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 cursor-default">
        <svg width="20" height="20" viewBox="0 0 28 28" className="-rotate-90">
          <circle cx="14" cy="14" r={radius} fill="none" className="stroke-white/10" strokeWidth="2" />
          <circle cx="14" cy="14" r={radius} fill="none" className={progressClass} strokeWidth="2"
            strokeDasharray={circumference} strokeDashoffset={dashOffset}
            strokeLinecap="round" />
        </svg>
      </div>
      <div className="absolute right-0 top-full mt-1 z-50 min-w-[240px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150">
        <div className="rounded-xl border border-white/10 bg-neutral-900 p-3 shadow-lg">
          <div className="mb-2">
            <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
              <span>{formatTokenCount(stats.totalTokens)} / {formatTokenCount(stats.maxTokens)} tokens used</span>
              <span>{Math.round(fillPercent * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-white/40 transition-all" style={{ width: `${Math.round(fillPercent * 100)}%` }} />
            </div>
          </div>
          <div className="space-y-0.5 text-[11px] text-neutral-400">
            <p className="font-medium text-neutral-300">
              {modelLabel ?? CHAT_MODEL_OPTIONS.find(m => m.id === chatModel)?.label ?? chatModel}
            </p>
            <p>Cost: {formatCurrency(stats.totalCost)}</p>
            <p>{stats.messageCount} messages &middot; {'>'}{formatTokenCount(stats.totalInputTokens)}tk &middot; {formatTokenCount(stats.totalOutputTokens)}tk</p>
          </div>
        </div>
      </div>
    </div>
  )
}
