import { useEffect, useState } from 'react'
import type { LauncherApp } from '../types/launcher-app'
import ModalOverlay from './ModalOverlay'

interface AppFormModalProps {
  initialData?: LauncherApp
  onCancel: () => void
  onSave: (payload: {
    id?: string
    title: string
    path: string
    iconBase64: string
    arguments: string
  }) => void
}

function ChevronIcon({ expanded }: { expanded: boolean }): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={expanded ? 'rotate-90 transition-transform' : 'transition-transform'}
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function IconPreview({ iconBase64, title }: { iconBase64: string; title: string }): JSX.Element {
  return (
    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950">
      {iconBase64 ? (
        <img src={iconBase64} alt={`${title || 'Application'} icon`} className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-semibold uppercase text-neutral-500">{title ? title.slice(0, 1) : 'A'}</span>
      )}
    </div>
  )
}

export default function AppFormModal({ initialData, onCancel, onSave }: AppFormModalProps): JSX.Element {
  const [title, setTitle] = useState('')
  const [appPath, setAppPath] = useState('')
  const [iconBase64, setIconBase64] = useState('')
  const [launchArguments, setLaunchArguments] = useState('')
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [isBrowsing, setIsBrowsing] = useState(false)
  const [isLoadingIcon, setIsLoadingIcon] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setTitle(initialData?.title ?? '')
    setAppPath(initialData?.path ?? '')
    setIconBase64(initialData?.iconBase64 ?? '')
    setLaunchArguments(initialData?.arguments ?? '')
    setIsAdvancedOpen(Boolean(initialData?.arguments))
    setErrorMessage('')
  }, [initialData])

  const isEditMode = Boolean(initialData)
  const isDisabled = !title.trim() || !appPath.trim() || isBrowsing || isLoadingIcon

  const loadIconFromPath = async (selectedPath: string): Promise<void> => {
    if (!window.api?.getFileIcon) return

    setIsLoadingIcon(true)
    try {
      const fileIcon = await window.api.getFileIcon(selectedPath)
      setIconBase64(fileIcon || '')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to extract application icon.'
      setIconBase64('')
      setErrorMessage(message)
    } finally {
      setIsLoadingIcon(false)
    }
  }

  const handleBrowse = async (): Promise<void> => {
    if (!window.api?.selectFile) {
      setErrorMessage('Native file picker is not available in this environment.')
      return
    }

    setIsBrowsing(true)
    setErrorMessage('')

    try {
      const selectedPath = await window.api.selectFile()
      if (!selectedPath) return

      setAppPath(selectedPath)
      await loadIconFromPath(selectedPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open file picker.'
      setErrorMessage(message)
    } finally {
      setIsBrowsing(false)
    }
  }

  return (
    <ModalOverlay onClose={onCancel}>
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
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex: Firefox"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                autoFocus
              />
            </div>

            <IconPreview iconBase64={iconBase64} title={title} />
          </div>

          <div>
            <label htmlFor="app-path" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
              App Path
            </label>
            <div className="flex gap-2">
              <input
                id="app-path"
                type="text"
                value={appPath}
                readOnly
                placeholder="Select an executable..."
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  void handleBrowse()
                }}
                disabled={isBrowsing}
                className="shrink-0 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBrowsing ? 'Browsing...' : 'Browse...'}
              </button>
            </div>
            {isLoadingIcon ? <p className="mt-2 text-xs text-neutral-500">Extracting icon...</p> : null}
          </div>

          <button
            type="button"
            onClick={() => setIsAdvancedOpen((current) => !current)}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-neutral-100"
          >
            <ChevronIcon expanded={isAdvancedOpen} />
            <span>Advanced Settings</span>
          </button>

          {isAdvancedOpen ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
              <label htmlFor="launch-args" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Launch Arguments
              </label>
              <input
                id="launch-args"
                type="text"
                value={launchArguments}
                onChange={(event) => setLaunchArguments(event.target.value)}
                placeholder="--incognito"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
              />
            </div>
          ) : null}

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
            onClick={() =>
              onSave({
                id: initialData?.id,
                title: title.trim(),
                path: appPath.trim(),
                iconBase64,
                arguments: launchArguments.trim()
              })
            }
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
