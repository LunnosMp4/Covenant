import type { CodePermissionRequest } from '../../../shared/code/code'
import ModalOverlay from '../ui/ModalOverlay'

interface CodePermissionModalProps {
  request: CodePermissionRequest
  onReply: (reply: 'once' | 'always' | 'reject') => void
}

const BUTTON =
  'inline-flex h-9 items-center justify-center rounded-xl border px-4 text-sm font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 active:scale-[0.98]'

export default function CodePermissionModal({
  request,
  onReply
}: CodePermissionModalProps): JSX.Element {
  return (
    // No onClose: a permission request must be answered explicitly. Clicking the
    // backdrop does nothing so a stray click can't silently deny and stop the run.
    <ModalOverlay contentClassName="max-w-md" contained>
      <div className="modal-shadow w-full rounded-2xl border border-white/10 bg-neutral-900 p-4">
        <h3 className="text-sm font-semibold text-neutral-100">Permission requested</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-neutral-400">
          OpenCode wants to <span className="text-neutral-200">{request.action}</span>:
        </p>
        <ul className="mt-3 max-h-32 space-y-1 overflow-auto rounded-xl border border-white/5 bg-neutral-950/60 p-2 text-xs text-neutral-300 chat-scrollbar">
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
            className={`${BUTTON} border-red-400/30 bg-red-500/20 text-red-100 hover:bg-red-500/30`}
          >
            Deny
          </button>
          <button
            type="button"
            onClick={() => onReply('always')}
            className={`${BUTTON} border-white/10 bg-white/5 text-neutral-200 hover:border-white/20 hover:bg-white/10`}
          >
            Always allow
          </button>
          <button
            type="button"
            onClick={() => onReply('once')}
            className={`${BUTTON} border-white/15 font-semibold shadow-sm hover:brightness-110`}
            style={{ background: 'var(--chat-accent)', color: 'var(--chat-on-accent)' }}
          >
            Allow once
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
