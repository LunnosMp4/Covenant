import type { CodePermissionRequest } from '../../../shared/code/code'
import ModalOverlay from '../ui/ModalOverlay'

interface CodePermissionModalProps {
  request: CodePermissionRequest
  onReply: (reply: 'once' | 'always' | 'reject') => void
}

export default function CodePermissionModal({
  request,
  onReply
}: CodePermissionModalProps): JSX.Element {
  return (
    <ModalOverlay onClose={() => onReply('reject')}>
      <div className="rounded-2xl border border-white/10 bg-neutral-900/95 p-5 shadow-[0_22px_60px_rgba(0,0,0,0.55)]">
        <h3 className="text-base font-semibold text-neutral-100">Permission requested</h3>
        <p className="mt-1 text-xs text-neutral-400">
          OpenCode wants to <span className="text-neutral-200">{request.action}</span>:
        </p>
        <ul className="mt-3 max-h-40 space-y-1 overflow-auto rounded-lg border border-white/5 bg-neutral-950/60 p-2 text-xs text-neutral-300 chat-scrollbar">
          {request.resources.length === 0 && <li>—</li>}
          {request.resources.map((resource) => (
            <li key={resource} className="truncate" title={resource}>
              {resource}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onReply('reject')}
            className="rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/25"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={() => onReply('always')}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-white/10"
          >
            Always allow
          </button>
          <button
            type="button"
            onClick={() => onReply('once')}
            className="rounded-xl px-4 py-2 text-sm font-medium shadow-lg shadow-black/20 transition-opacity hover:opacity-90"
            style={{ background: 'var(--chat-accent)', color: 'var(--chat-on-accent)' }}
          >
            Allow once
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
