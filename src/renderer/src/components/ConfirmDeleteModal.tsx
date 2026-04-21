import ModalOverlay from './ModalOverlay'

interface ConfirmDeleteModalProps {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDeleteModal({
  title,
  message,
  onConfirm,
  onCancel
}: ConfirmDeleteModalProps): JSX.Element {
  return (
    <ModalOverlay onClose={onCancel}>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/95 p-5 shadow-[0_22px_60px_rgba(0,0,0,0.55)]">
        <h3 className="text-lg font-semibold text-neutral-100">{title}</h3>
        <p className="mt-2 text-sm text-neutral-400">{message}</p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl border border-red-400/40 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/30"
          >
            Delete
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
