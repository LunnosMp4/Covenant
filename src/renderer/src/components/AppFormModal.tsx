import { useEffect, useState } from 'react'
import type { LauncherApp, LauncherAppTarget } from '../types/launcher-app'
import ModalOverlay from './ModalOverlay'

interface AppFormModalProps {
  initialData?: LauncherApp
  onCancel: () => void
  onSave: (payload: {
    id?: string
    title: string
    iconBase64: string
    targets: LauncherAppTarget[]
  }) => void
}

type AppTargetRow = LauncherAppTarget & { id: string }

function getAppBadgeText(title: string): string {
  const trimmedTitle = title.trim()
  return trimmedTitle.slice(0, 2).toUpperCase() || 'AP'
}

function IconPreview({ title }: { title: string }): JSX.Element {
  return (
    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-200">
        {getAppBadgeText(title)}
      </span>
    </div>
  )
}

function createTargetId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `target-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createTargetRow(path = '', argumentsValue = ''): AppTargetRow {
  return {
    id: createTargetId(),
    path,
    arguments: argumentsValue
  }
}

function getInitialTargets(initialData?: LauncherApp): AppTargetRow[] {
  if (initialData?.targets?.length) {
    return initialData.targets.map((target) =>
      createTargetRow(target.path ?? '', target.arguments ?? '')
    )
  }

  if (initialData?.path) {
    return [createTargetRow(initialData.path, initialData.arguments ?? '')]
  }

  return [createTargetRow()]
}

export default function AppFormModal({ initialData, onCancel, onSave }: AppFormModalProps): JSX.Element {
  const [title, setTitle] = useState('')
  const [targets, setTargets] = useState<AppTargetRow[]>([createTargetRow()])
  const [browsingTargetId, setBrowsingTargetId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setTitle(initialData?.title ?? '')
    setTargets(getInitialTargets(initialData))
    setErrorMessage('')
  }, [initialData])

  const isEditMode = Boolean(initialData)
  const hasAtLeastOneTarget = targets.some((target) => target.path.trim())
  const hasEmptyTarget = targets.some((target) => !target.path.trim())
  const isBrowsing = Boolean(browsingTargetId)
  const isDisabled = !title.trim() || !hasAtLeastOneTarget || isBrowsing

  const handleBrowse = async (targetId: string): Promise<void> => {
    if (!window.api?.selectFile) {
      setErrorMessage('Native file picker is not available in this environment.')
      return
    }

    setBrowsingTargetId(targetId)
    setErrorMessage('')

    try {
      const selectedPath = await window.api.selectFile()
      if (!selectedPath) return

      setTargets((current) =>
        current.map((target) =>
          target.id === targetId ? { ...target, path: selectedPath } : target
        )
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open file picker.'
      setErrorMessage(message)
    } finally {
      setBrowsingTargetId(null)
    }
  }

  const handleAddTarget = (): void => {
    setTargets((current) => [...current, createTargetRow()])
    setErrorMessage('')
  }

  const handleRemoveTarget = (targetId: string): void => {
    setTargets((current) => {
      if (current.length === 1) return current
      return current.filter((target) => target.id !== targetId)
    })
    setErrorMessage('')
  }

  const handleArgumentsChange = (targetId: string, value: string): void => {
    setTargets((current) =>
      current.map((target) =>
        target.id === targetId ? { ...target, arguments: value } : target
      )
    )
    setErrorMessage('')
  }

  const handleSave = (): void => {
    if (!title.trim()) {
      setErrorMessage('App title is required.')
      return
    }

    if (!hasAtLeastOneTarget) {
      setErrorMessage('At least one app path is required.')
      return
    }

    if (hasEmptyTarget) {
      setErrorMessage('Remove empty app rows or select a path for each one.')
      return
    }

    const normalizedTargets = targets.map((target) => ({
      path: target.path.trim(),
      arguments: target.arguments.trim()
    }))

    setErrorMessage('')
    onSave({
      id: initialData?.id,
      title: title.trim(),
      iconBase64: '',
      targets: normalizedTargets
    })
  }

  return (
    <ModalOverlay onClose={onCancel} contentClassName="max-w-xl h-[520px]">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/95 p-5 shadow-[0_22px_60px_rgba(0,0,0,0.55)]">
        <h3 className="text-lg font-semibold text-neutral-100">{isEditMode ? 'Edit Application' : 'Add Application'}</h3>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <div>
              <label htmlFor="app-title" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                App Title
              </label>
              <input
                id="app-title"
                type="text"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value)
                  setErrorMessage('')
                }}
                placeholder="Ex: Firefox"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                autoFocus
              />
            </div>

            <IconPreview title={title} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Apps to Launch
              </p>
              <button
                type="button"
                onClick={handleAddTarget}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-neutral-100"
              >
                Add another app
              </button>
            </div>

            {targets.map((target, index) => (
              <div
                key={target.id}
                className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">
                    App {index + 1}
                  </p>
                  {targets.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveTarget(target.id)}
                      className="rounded-md border border-neutral-800 px-2 py-1 text-[11px] font-medium text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor={`app-path-${target.id}`}
                      className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400"
                    >
                      App Path
                    </label>
                    <div className="flex gap-2">
                      <input
                        id={`app-path-${target.id}`}
                        type="text"
                        value={target.path}
                        readOnly
                        placeholder="Select an executable..."
                        className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void handleBrowse(target.id)
                        }}
                        disabled={isBrowsing}
                        className="shrink-0 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isBrowsing && browsingTargetId === target.id ? 'Browsing...' : 'Browse...'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor={`app-args-${target.id}`}
                      className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400"
                    >
                      Arguments (optional)
                    </label>
                    <input
                      id={`app-args-${target.id}`}
                      type="text"
                      value={target.arguments}
                      onChange={(event) => handleArgumentsChange(target.id, event.target.value)}
                      placeholder="--incognito"
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {errorMessage ? <p className="text-xs text-red-300">{errorMessage}</p> : null}
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
            onClick={handleSave}
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
