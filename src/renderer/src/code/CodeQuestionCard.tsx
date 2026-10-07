import { useEffect, useMemo, useState } from 'react'
import type { CodeFormField, CodeFormRequest, CodeFormValue } from '../../../shared/code/code'
import { SessionIcon } from './icons'

interface CodeQuestionCardProps {
  form: CodeFormRequest
  onSubmit: (answer: Record<string, CodeFormValue>) => void
  onCancel: (message?: string) => void
}

const CHIP =
  'rounded-lg border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40'
const CHIP_ON = 'border-white/25 bg-white/15 text-neutral-100'
const CHIP_OFF =
  'border-white/10 text-neutral-400 hover:border-white/20 hover:bg-white/10 hover:text-neutral-200'
const INPUT =
  'w-full rounded-lg border border-white/10 bg-neutral-950/60 px-2.5 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-white/20 focus:outline-none'

function isFieldVisible(field: CodeFormField, answers: Record<string, CodeFormValue>): boolean {
  if (field.hidden) return false
  if (!field.when || field.when.length === 0) return true
  return field.when.every((condition) => {
    const current = answers[condition.key]
    const equal = Array.isArray(current)
      ? current.map(String).includes(String(condition.value))
      : current !== undefined && String(current) === String(condition.value)
    return condition.op === 'eq' ? equal : !equal
  })
}

function isFieldSatisfied(field: CodeFormField, value: CodeFormValue | undefined): boolean {
  if (value === undefined) return false
  if (field.type === 'multiselect') return Array.isArray(value) && value.length > 0
  if (field.type === 'number' || field.type === 'integer') return typeof value === 'number'
  if (field.type === 'boolean') return typeof value === 'boolean'
  if (field.type === 'string') return typeof value === 'string' && value.trim().length > 0
  return true
}

function customEntries(field: CodeFormField, values: string[]): string[] {
  const known = new Set((field.options ?? []).map((option) => option.value))
  return values.filter((value) => !known.has(value))
}

export default function CodeQuestionCard({
  form,
  onSubmit,
  onCancel
}: CodeQuestionCardProps): JSX.Element {
  const [answers, setAnswers] = useState<Record<string, CodeFormValue>>({})
  const [customDraft, setCustomDraft] = useState<Record<string, string>>({})

  useEffect(() => {
    const initial: Record<string, CodeFormValue> = {}
    for (const field of form.fields) {
      if (field.default !== undefined) initial[field.key] = field.default
    }
    setAnswers(initial)
    setCustomDraft({})
  }, [form.id, form.fields])

  const visibleFields = useMemo(
    () => form.fields.filter((field) => isFieldVisible(field, answers)),
    [form.fields, answers]
  )

  const canSubmit = visibleFields.every(
    (field) =>
      !field.required ||
      field.type === 'external' ||
      isFieldSatisfied(field, answers[field.key])
  )

  const setAnswer = (key: string, value: CodeFormValue | undefined): void => {
    setAnswers((current) => {
      const next = { ...current }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })
  }

  const toggleMulti = (field: CodeFormField, value: string): void => {
    const list = Array.isArray(answers[field.key]) ? (answers[field.key] as string[]) : []
    const selected = list.includes(value)
    if (selected) {
      setAnswer(
        field.key,
        list.filter((item) => item !== value)
      )
      return
    }
    if (typeof field.maxItems === 'number' && list.length >= field.maxItems) return
    setAnswer(field.key, [...list, value])
  }

  const addCustom = (field: CodeFormField): void => {
    const draft = (customDraft[field.key] ?? '').trim()
    if (!draft) return
    const list = Array.isArray(answers[field.key]) ? (answers[field.key] as string[]) : []
    if (!list.includes(draft)) {
      if (!(typeof field.maxItems === 'number' && list.length >= field.maxItems)) {
        setAnswer(field.key, [...list, draft])
      }
    }
    setCustomDraft((current) => ({ ...current, [field.key]: '' }))
  }

  const handleSubmit = (): void => {
    const answer: Record<string, CodeFormValue> = {}
    for (const field of visibleFields) {
      if (field.type === 'external') continue
      const value = answers[field.key]
      if (value === undefined) continue
      if (field.type === 'multiselect') {
        if (Array.isArray(value) && value.length > 0) answer[field.key] = value
      } else if (typeof value === 'string') {
        if (value.trim()) answer[field.key] = value.trim()
      } else {
        answer[field.key] = value
      }
    }
    onSubmit(answer)
  }

  const renderString = (field: CodeFormField): JSX.Element => {
    const value = answers[field.key]
    const options = field.options ?? []
    if (options.length === 0) {
      return (
        <input
          className={INPUT}
          type={field.format === 'date' || field.format === 'date-time' ? field.format : 'text'}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder ?? 'Type your answer…'}
          onChange={(event) => setAnswer(field.key, event.target.value || undefined)}
        />
      )
    }
    const isCustom =
      typeof value === 'string' &&
      value.length > 0 &&
      !options.some((option) => option.value === value)
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.description}
              className={`${CHIP} ${value === option.value ? CHIP_ON : CHIP_OFF}`}
              onClick={() => setAnswer(field.key, option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {field.custom && (
          <input
            className={INPUT}
            type="text"
            value={isCustom ? String(value) : ''}
            placeholder={field.placeholder ?? 'Or write your own…'}
            onChange={(event) => setAnswer(field.key, event.target.value || undefined)}
          />
        )}
      </div>
    )
  }

  const renderMultiselect = (field: CodeFormField): JSX.Element => {
    const value = Array.isArray(answers[field.key]) ? (answers[field.key] as string[]) : []
    const extras = customEntries(field, value)
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.description}
              className={`${CHIP} ${value.includes(option.value) ? CHIP_ON : CHIP_OFF}`}
              onClick={() => toggleMulti(field, option.value)}
            >
              {option.label}
            </button>
          ))}
          {extras.map((entry) => (
            <button
              key={entry}
              type="button"
              className={`${CHIP} ${CHIP_ON}`}
              title="Remove"
              onClick={() => toggleMulti(field, entry)}
            >
              {entry} ×
            </button>
          ))}
        </div>
        {field.custom && (
          <div className="flex gap-1.5">
            <input
              className={INPUT}
              type="text"
              value={customDraft[field.key] ?? ''}
              placeholder={field.placeholder ?? 'Add your own…'}
              onChange={(event) =>
                setCustomDraft((current) => ({ ...current, [field.key]: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addCustom(field)
                }
              }}
            />
            <button
              type="button"
              className={`${CHIP} ${CHIP_OFF} shrink-0`}
              onClick={() => addCustom(field)}
            >
              Add
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderBoolean = (field: CodeFormField): JSX.Element => {
    const value = answers[field.key]
    return (
      <div className="flex gap-1.5">
        <button
          type="button"
          className={`${CHIP} ${value === true ? CHIP_ON : CHIP_OFF}`}
          onClick={() => setAnswer(field.key, true)}
        >
          Yes
        </button>
        <button
          type="button"
          className={`${CHIP} ${value === false ? CHIP_ON : CHIP_OFF}`}
          onClick={() => setAnswer(field.key, false)}
        >
          No
        </button>
      </div>
    )
  }

  const renderNumber = (field: CodeFormField): JSX.Element => {
    const value = answers[field.key]
    return (
      <input
        className={INPUT}
        type="number"
        value={typeof value === 'number' ? value : ''}
        min={field.minimum}
        max={field.maximum}
        step={field.type === 'integer' ? 1 : 'any'}
        placeholder={field.placeholder ?? 'Type a number…'}
        onChange={(event) => {
          const raw = event.target.value
          if (!raw) setAnswer(field.key, undefined)
          else setAnswer(field.key, Number(raw))
        }}
      />
    )
  }

  const renderExternal = (field: CodeFormField): JSX.Element => (
    <button
      type="button"
      className={`${CHIP} ${CHIP_OFF}`}
      onClick={() => {
        if (field.url) void window.api?.openExternal?.(field.url)
      }}
    >
      Open link
    </button>
  )

  const renderField = (field: CodeFormField): JSX.Element => {
    let control: JSX.Element
    switch (field.type) {
      case 'string':
        control = renderString(field)
        break
      case 'multiselect':
        control = renderMultiselect(field)
        break
      case 'boolean':
        control = renderBoolean(field)
        break
      case 'number':
      case 'integer':
        control = renderNumber(field)
        break
      case 'external':
        control = renderExternal(field)
        break
      default:
        control = <></>
    }
    return (
      <div key={field.key} className="mt-3 first:mt-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-neutral-200">
            {field.title ?? field.key}
          </span>
          {field.required && (
            <span className="text-[10px] uppercase tracking-wide text-red-400/80">required</span>
          )}
        </div>
        {field.description && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">{field.description}</p>
        )}
        <div className="mt-1.5">{control}</div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="chat-message chat-message--assistant w-full max-w-[85%] rounded-2xl border px-3 py-2.5 text-[13px] leading-relaxed select-text">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-neutral-400">
            <SessionIcon />
          </span>
          <span className="text-[13px] font-medium text-neutral-100">{form.title}</span>
        </div>
        <div className="mt-2">{visibleFields.map(renderField)}</div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100"
            onClick={() => onCancel()}
          >
            Skip
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            className="rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg shadow-black/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--chat-accent)', color: 'var(--chat-on-accent)' }}
            onClick={handleSubmit}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
