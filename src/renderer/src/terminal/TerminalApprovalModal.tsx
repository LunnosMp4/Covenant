import type { TerminalApprovalRequest } from '../../../shared/terminal/terminal'
import ModalOverlay from '../ui/ModalOverlay'

interface TerminalApprovalModalProps {
  request: TerminalApprovalRequest
  onReply: (reply: 'once' | 'always' | 'reject') => void
}

const BUTTON =
  'inline-flex h-9 items-center justify-center rounded-xl border px-4 text-sm font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 active:scale-[0.98]'

export default function TerminalApprovalModal({
  request,
  onReply
}: TerminalApprovalModalProps): JSX.Element {
  return (
    // No onClose: a command request must be answered explicitly.
    <ModalOverlay contentClassName="max-w-md" contained>
      <div className="modal-shadow w-full rounded-2xl border border-white/10 bg-neutral-900 p-4">
        <h3 className="text-sm font-semibold text-neutral-100">Run this command?</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-neutral-400">
          The assistant wants to run a command in{' '}
          <span className="text-neutral-200">{request.cwd || 'the terminal'}</span>.
        </p>

        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/5 bg-neutral-950/70 p-3 font-mono text-[12px] leading-relaxed text-neutral-200 chat-scrollbar">
          {request.command}
        </pre>

        {request.reason ? (
          <p className="mt-2 text-[12px] leading-relaxed text-neutral-400">{request.reason}</p>
        ) : null}

        {request.destructive ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] leading-relaxed text-red-200">
            <span aria-hidden>⚠</span>
            <span>This command looks destructive. Review it carefully before allowing.</span>
          </div>
        ) : null}

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
