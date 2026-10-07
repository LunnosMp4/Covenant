import { useEffect, useRef, useState } from 'react'
import type { CodeModel } from '../../../shared/code/code'
import { ChevronDownIcon } from '../ui/icons'

interface CodeModelMenuProps {
  modelLabel: string | null
  models: CodeModel[]
  selectedModel: string
  onSelectModel: (value: string) => void
  variants: string[]
  selectedVariant: string
  onSelectVariant: (value: string) => void
}

type Tab = 'models' | 'effort'

const ROW =
  'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors'

export default function CodeModelMenu({
  modelLabel,
  models,
  selectedModel,
  onSelectModel,
  variants,
  selectedVariant,
  onSelectVariant
}: CodeModelMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('models')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent): void => {
      if (containerRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex h-8 min-w-0 items-center gap-2 rounded-lg border px-2.5 text-xs transition-colors ${
          open
            ? 'border-white/20 bg-white/10 text-neutral-100'
            : 'border-white/10 text-neutral-200 hover:border-white/20 hover:bg-white/10'
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="min-w-0 max-w-[150px] truncate">{modelLabel ?? 'Default model'}</span>
        {selectedVariant && (
          <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
            {selectedVariant}
          </span>
        )}
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-30 w-72 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/95 shadow-xl shadow-black/50">
          <div className="flex gap-1 border-b border-white/5 p-1.5">
            {(['models', 'effort'] as Tab[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors ${
                  tab === value
                    ? 'bg-white/10 text-neutral-100'
                    : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                }`}
                aria-pressed={tab === value}
              >
                {value === 'models' ? 'Models' : 'Effort'}
              </button>
            ))}
          </div>

          <div className="max-h-80 overflow-y-auto p-1 chat-scrollbar">
            {tab === 'models' && (
              <>
                {models.length === 0 && (
                  <p className="px-2 py-1 text-xs text-neutral-500">No models available.</p>
                )}
                {models.map((model) => {
                  const value = `${model.providerID}/${model.id}`
                  const active = value === selectedModel
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onSelectModel(value)}
                      className={`${ROW} ${
                        active ? 'bg-white/10 text-neutral-100' : 'text-neutral-300 hover:bg-white/5'
                      }`}
                    >
                      <span className="min-w-0 truncate">{model.label}</span>
                      {active && <span className="shrink-0 text-neutral-400">✓</span>}
                    </button>
                  )
                })}
              </>
            )}

            {tab === 'effort' && (
              <>
                {variants.length === 0 && (
                  <p className="px-2 py-1 text-xs text-neutral-500">
                    This model has no reasoning effort options.
                  </p>
                )}
                {variants.length > 0 &&
                  [{ value: '', label: 'Default' }, ...variants.map((v) => ({ value: v, label: v }))].map(
                    (option) => {
                      const active = option.value === selectedVariant
                      return (
                        <button
                          key={option.value || 'default'}
                          type="button"
                          onClick={() => onSelectVariant(option.value)}
                          className={`${ROW} ${
                            active ? 'bg-white/10 text-neutral-100' : 'text-neutral-300 hover:bg-white/5'
                          }`}
                        >
                          <span className="min-w-0 truncate capitalize">{option.label}</span>
                          {active && <span className="shrink-0 text-neutral-400">✓</span>}
                        </button>
                      )
                    }
                  )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
