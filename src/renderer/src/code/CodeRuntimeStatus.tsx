import type { CodeRuntimePhase, CodeRuntimeProgress } from '../../../shared/code/code'
import { SpinnerIcon } from '../ui/icons'

interface CodeRuntimeStatusProps {
  progress: CodeRuntimeProgress
  onRetry?: () => void
}

const PHASE_TITLES: Record<CodeRuntimePhase, string> = {
  connecting: 'Connecting',
  checking: 'Preparing machine',
  downloading: 'Downloading OpenCode',
  uploading: 'Installing OpenCode',
  starting: 'Starting OpenCode',
  waiting: 'Almost there',
  ready: 'Ready',
  error: 'Setup failed'
}

function ErrorBadge(): JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  )
}

/**
 * Ambient status shown while Covenant prepares an OpenCode runtime — most
 * notably while installing OpenCode on a remote machine over SSH.
 */
export default function CodeRuntimeStatus({ progress, onRetry }: CodeRuntimeStatusProps): JSX.Element {
  const isError = progress.phase === 'error'
  const percent =
    typeof progress.percent === 'number' ? Math.max(0, Math.min(100, Math.round(progress.percent * 100))) : null

  return (
    <div
      className={`w-full rounded-xl border px-3.5 py-3 ${
        isError ? 'border-red-500/30 bg-red-500/[0.06]' : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={isError ? 'shrink-0 text-red-400' : 'shrink-0 text-neutral-300'}>
          {isError ? <ErrorBadge /> : <SpinnerIcon />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-neutral-200">
            {PHASE_TITLES[progress.phase]}
            <span className="font-normal text-neutral-500"> · {progress.connectionName}</span>
          </p>
          <p className="truncate text-[11px] text-neutral-500">{progress.message}</p>
        </div>
        {percent !== null && !isError && (
          <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">{percent}%</span>
        )}
        {isError && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-medium text-neutral-200 transition-colors hover:bg-white/10"
          >
            Retry
          </button>
        )}
      </div>

      {!isError && (
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
          {percent !== null ? (
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${percent}%`, background: 'var(--chat-accent)' }}
            />
          ) : (
            <div
              className="h-full w-1/3 animate-pulse rounded-full"
              style={{ background: 'var(--chat-accent)' }}
            />
          )}
        </div>
      )}
    </div>
  )
}
