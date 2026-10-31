import { motion } from 'framer-motion'
import type { Preprompt } from '../../../shared/domain/preprompt'
import { SPRING_POPOVER } from '../constants/motion'
import Kbd from '../ui/Kbd'

interface InstructionPickerProps {
  items: Preprompt[]
  selectedIndex: number
  query: string
  hasInstructions: boolean
  themeGradient: string
  onHover: (index: number) => void
  onSelect: (item: Preprompt) => void
}

function DocIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  )
}

export default function InstructionPicker({
  items,
  selectedIndex,
  query,
  hasInstructions,
  themeGradient,
  onHover,
  onSelect
}: InstructionPickerProps): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: 10 }}
      transition={SPRING_POPOVER}
      style={{ transformOrigin: 'bottom center' }}
      className={`absolute inset-x-0 bottom-full z-40 mb-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${themeGradient} p-2 surface-shadow texture-surface`}
      data-interactive-surface
    >
      <div className="flex items-center justify-between gap-3 px-2 pb-1.5">
        <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-400">
          Instructions
        </span>
        {query ? (
          <span className="truncate text-[10px] text-neutral-400">@{query}</span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-4 text-center text-xs text-neutral-500">
          {hasInstructions
            ? 'No matching instructions.'
            : 'No instructions yet. Add one in Settings → Instructions.'}
        </div>
      ) : (
        <div
          role="listbox"
          className="chat-scrollbar max-h-[280px] space-y-0.5 overflow-y-auto"
        >
          {items.map((item, index) => {
            const isSelected = index === selectedIndex

            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => onHover(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelect(item)}
                className={`pressable-soft group relative flex w-full items-center gap-3 overflow-hidden rounded-xl py-2 pl-3.5 pr-3 text-left text-sm ${
                  isSelected
                    ? 'bg-white/[0.06] text-neutral-50 ring-1 ring-inset ring-white/10'
                    : 'text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-300'
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-[var(--chat-accent)] transition-opacity duration-150 ${
                    isSelected ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-neutral-300 transition-opacity duration-150 ${
                    isSelected ? 'opacity-100' : 'opacity-55 group-hover:opacity-90'
                  }`}
                >
                  <DocIcon />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={`truncate font-medium ${
                      isSelected ? 'text-neutral-50' : 'text-neutral-400'
                    }`}
                  >
                    {item.title}
                  </span>
                  <span
                    className={`mt-0.5 truncate text-xs ${
                      isSelected ? 'text-neutral-400' : 'text-neutral-500'
                    }`}
                  >
                    {item.content}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-[0.08em] transition-opacity duration-150 ${
                    isSelected
                      ? 'border-white/20 bg-white/10 text-neutral-300 opacity-100'
                      : 'opacity-0'
                  }`}
                >
                  tab
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-white/5 px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.08em] text-neutral-400">
        <span className="inline-flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <span>navigate</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Tab</Kbd>
          <Kbd>↵</Kbd>
          <span>apply</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Esc</Kbd>
          <span>dismiss</span>
        </span>
      </div>
    </motion.div>
  )
}
