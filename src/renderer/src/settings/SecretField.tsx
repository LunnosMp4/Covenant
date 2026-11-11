import { useId, useState, type ReactNode } from 'react'

export interface SecretFieldResult {
  ok: boolean
  error?: string
}

interface SecretFieldProps {
  label: string
  description?: string
  hasSavedValue: boolean
  placeholder?: string
  disabled?: boolean
  saveLabel?: string
  clearLabel?: string
  testLabel?: string
  savedLabel?: string
  notConfiguredLabel?: string
  savedHint?: string
  savedPlaceholder?: string
  onSave: (value: string) => Promise<SecretFieldResult>
  onClear?: () => Promise<void> | void
  onTest?: () => Promise<SecretFieldResult>
  children?: ReactNode
}

export default function SecretField({
  label,
  description,
  hasSavedValue,
  placeholder,
  disabled = false,
  saveLabel = 'Save',
  clearLabel = 'Disconnect',
  testLabel = 'Test',
  savedLabel = 'Saved',
  notConfiguredLabel = 'Not configured',
  savedHint,
  savedPlaceholder,
  onSave,
  onClear,
  onTest,
  children
}: SecretFieldProps): JSX.Element {
  const inputId = useId()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error' | 'neutral'>('neutral')

  const showFeedback = (message: string, tone: 'success' | 'error' | 'neutral'): void => {
    setFeedback(message)
    setFeedbackTone(tone)
  }

  const handleSave = async (): Promise<void> => {
    const next = value.trim()
    if (!next || busy || disabled) return
    setBusy(true)
    setFeedback('')
    try {
      const result = await onSave(next)
      if (result.ok) {
        setValue('')
        showFeedback('Saved on this device.', 'success')
      } else {
        showFeedback(result.error ?? 'Failed to save.', 'error')
      }
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : 'Failed to save.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleClear = async (): Promise<void> => {
    if (!onClear || busy) return
    setBusy(true)
    setFeedback('')
    try {
      await onClear()
      setValue('')
      showFeedback('Removed from this device.', 'success')
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : 'Failed to remove.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleTest = async (): Promise<void> => {
    if (!onTest || testing) return
    setTesting(true)
    setFeedback('')
    try {
      const result = await onTest()
      showFeedback(
        result.ok ? 'Connection successful.' : result.error ?? 'Connection failed.',
        result.ok ? 'success' : 'error'
      )
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : 'Connection failed.', 'error')
    } finally {
      setTesting(false)
    }
  }

  const inputPlaceholder =
    hasSavedValue && !value
      ? savedPlaceholder ?? '••••••••  Saved on this device'
      : placeholder ?? 'Paste your key'

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor={inputId} className="block text-sm font-medium text-neutral-300">
            {label}
          </label>
          <span className={`text-[11px] ${hasSavedValue ? 'text-emerald-300' : 'text-neutral-500'}`}>
            {hasSavedValue ? savedLabel : notConfiguredLabel}
          </span>
        </div>
        {description ? <p className="mb-2 text-xs text-neutral-500">{description}</p> : null}

        <div className="flex items-center gap-3">
          <input
            id={inputId}
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={inputPlaceholder}
            autoComplete="off"
            disabled={disabled || busy}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!value.trim() || busy || disabled}
            className="pressable btn-primary flex-shrink-0 rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
        <span>
          {hasSavedValue
            ? savedHint ?? 'A value is stored on this device.'
            : 'No value stored.'}
        </span>
        {hasSavedValue && onTest ? (
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={disabled || testing || busy}
            className="hover:text-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? 'Testing…' : testLabel}
          </button>
        ) : null}
        {hasSavedValue && onClear ? (
          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={disabled || busy}
            className="hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {clearLabel}
          </button>
        ) : null}
      </div>

      {children}

      {feedback ? (
        <p
          className={`text-xs ${
            feedbackTone === 'success'
              ? 'text-emerald-300'
              : feedbackTone === 'error'
                ? 'text-red-300'
                : 'text-neutral-400'
          }`}
          role="status"
        >
          {feedback}
        </p>
      ) : null}
    </div>
  )
}
