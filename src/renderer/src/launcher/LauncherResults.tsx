import { motion } from 'framer-motion'
import type { LauncherItem } from '../../../shared/launcher/launcher'
import { getAppBadgeText } from '../utils/helpers'

interface LauncherResultsProps {
  items: LauncherItem[]
  selectedIndex: number
  themeGradient: string
  onHover: (index: number) => void
  onSelect: (item: LauncherItem) => void
}

function SparkleIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M18 15l.7 1.8L20.5 18l-1.8.7L18 20.5l-.7-1.8L15.5 18l1.8-.7L18 15z" />
    </svg>
  )
}

function ItemIcon({ item }: { item: LauncherItem }): JSX.Element {
  if (item.iconBase64) {
    return (
      <img
        src={item.iconBase64}
        alt=""
        className="h-8 w-8 rounded-lg object-contain"
        draggable={false}
      />
    )
  }

  if (item.kind === 'ai') {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-neutral-200">
        <SparkleIcon />
      </span>
    )
  }

  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-xs font-semibold uppercase tracking-[0.08em] text-neutral-300">
      {getAppBadgeText(item.title)}
    </span>
  )
}

export default function LauncherResults({
  items,
  selectedIndex,
  themeGradient,
  onHover,
  onSelect
}: LauncherResultsProps): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: 10 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      className={`absolute inset-x-0 bottom-full z-40 mb-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${themeGradient} p-2 shadow-xl shadow-black/50 texture-surface`}
      style={{ WebkitBackdropFilter: 'blur(40px)', backdropFilter: 'blur(40px)' }}
    >
      <div className="space-y-0.5">
        {items.map((item, index) => {
          const isSelected = index === selectedIndex
          return (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => onHover(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(item)}
              aria-selected={isSelected}
              className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl py-2 pl-3.5 pr-3 text-left text-sm transition-all duration-150 ${
                isSelected
                  ? 'bg-[var(--chat-accent-soft)] text-neutral-50 ring-1 ring-inset ring-[var(--chat-accent-strong)]'
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
                className={`shrink-0 transition-opacity duration-150 ${
                  isSelected ? 'opacity-100' : 'opacity-55 group-hover:opacity-90'
                }`}
              >
                <ItemIcon item={item} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`truncate font-medium ${isSelected ? 'text-neutral-50' : 'text-neutral-400'}`}>
                  {item.title}
                </span>
                {item.subtitle && (
                  <span className={`mt-0.5 truncate text-xs ${isSelected ? 'text-neutral-400' : 'text-neutral-600'}`}>
                    {item.subtitle}
                  </span>
                )}
              </span>
              <span
                aria-hidden
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-[0.08em] transition-opacity duration-150 ${
                  isSelected
                    ? 'border-[var(--chat-accent-strong)] bg-[var(--chat-accent-soft)] text-[var(--chat-accent)] opacity-100'
                    : 'opacity-0'
                }`}
              >
                ↵
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-white/5 px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.08em] text-neutral-600">
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span>esc ask AI</span>
      </div>
    </motion.div>
  )
}
