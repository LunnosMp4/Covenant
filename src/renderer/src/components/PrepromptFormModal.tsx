import { useEffect, useState } from 'react'
import type { Preprompt } from '../types/preprompt'
import ModalOverlay from './ModalOverlay'

interface PrepromptFormModalProps {
  initialData?: Preprompt
  onCancel: () => void
  onSave: (payload: { id?: string; title: string; content: string }) => void
}

export default function PrepromptFormModal({
  initialData,
  onCancel,
  onSave
}: PrepromptFormModalProps): JSX.Element {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  useEffect(() => {
    setTitle(initialData?.title ?? '')
    setContent(initialData?.content ?? '')
  }, [initialData])

  const isEditMode = Boolean(initialData)
  const isDisabled = !title.trim() || !content.trim()

  return (
    <ModalOverlay onClose={onCancel}>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/95 p-5 shadow-[0_22px_60px_rgba(0,0,0,0.55)]">
        <h3 className="text-lg font-semibold text-neutral-100">{isEditMode ? 'Edit Preprompt' : 'Add Preprompt'}</h3>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="preprompt-title" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
              Title
            </label>
            <input
              id="preprompt-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex: Bug triage assistant"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="preprompt-content" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
              Prompt Content
            </label>
            <textarea
              id="preprompt-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Write the reusable preprompt content here..."
              className="min-h-[180px] w-full resize-y rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>
        </div>

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
            disabled={isDisabled}
            onClick={() => onSave({ id: initialData?.id, title, content })}
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
