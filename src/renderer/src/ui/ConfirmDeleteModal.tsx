import type { ReactNode } from 'react'
import ModalOverlay from './ModalOverlay'

interface ConfirmDeleteModalProps {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  withBackdrop?: boolean
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /** Scope the backdrop to the visible command-bar surface. */
  contained?: boolean
  /** Custom badge icon; defaults to an alert glyph for destructive dialogs. */
  icon?: ReactNode
}

const SECONDARY_BUTTON =
  'inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:border-white/20 hover:bg-white/10 active:scale-[0.98]'

const PRIMARY_BUTTON =
  'inline-flex h-9 items-center justify-center rounded-xl border px-4 text-sm font-semibold shadow-sm transition duration-150 hover:brightness-110 active:scale-[0.98]'

function AlertIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

export default function ConfirmDeleteModal({
  title,
  message,
  onConfirm,
  onCancel,
  withBackdrop = true,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  contained = false,
  icon
}: ConfirmDeleteModalProps): JSX.Element {
  const badge = icon ?? (danger ? <AlertIcon /> : null)

  return (
    <ModalOverlay onClose={onCancel} withBackdrop={withBackdrop} contained={contained} contentClassName="max-w-sm">
      <div className="modal-shadow w-full rounded-2xl border border-white/10 bg-neutral-900 p-4">
        <div className="flex items-start gap-3">
          {badge && (
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                danger ? 'bg-red-500/15 text-red-300' : 'text-[color:var(--chat-accent)]'
              }`}
              style={danger ? undefined : { background: 'var(--chat-accent-soft, rgba(245, 158, 11, 0.16))' }}
            >
              {badge}
            </span>
          )}
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-neutral-400">{message}</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              danger
                ? `${PRIMARY_BUTTON} border-red-400/30 bg-red-500/20 text-red-100 hover:bg-red-500/30`
                : `${PRIMARY_BUTTON} border-white/15`
            }
            style={danger ? undefined : { background: 'var(--chat-accent)', color: 'var(--chat-on-accent)' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
