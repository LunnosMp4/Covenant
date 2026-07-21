import { useState, useRef, useEffect } from 'react'

interface SelectOption {
  value: string
  label: string
}

interface CustomSelectProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}

function ChevronIcon({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default function CustomSelect({
  options,
  value,
  onChange,
  disabled = false,
  className = ''
}: CustomSelectProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selected = options.find((opt) => opt.value === value)

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent): void => {
      if (containerRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        setOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div ref={containerRef} className={`relative ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}>
      <button
        type="button"
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev)
        }}
        disabled={disabled}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 transition-colors focus:border-neutral-600 focus:outline-none disabled:cursor-not-allowed"
      >
        <span className="truncate">{selected?.label ?? value}</span>
        {!disabled && <ChevronIcon open={open} />}
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl shadow-black/40">
          <div className="max-h-48 overflow-y-auto py-1 scrollbar-hidden">
            {options.map((option) => {
              const isActive = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? 'bg-white/10 text-neutral-100'
                      : 'text-neutral-300 hover:bg-white/5 hover:text-neutral-100'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isActive && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="ml-auto shrink-0 text-neutral-400"
                      aria-hidden
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
