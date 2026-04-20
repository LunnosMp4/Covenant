import { motion } from 'framer-motion'
import type { RefObject } from 'react'

export type ActivePopup = 'module2' | 'module3'

type PopupIcon = 'grid' | 'folder' | 'doc' | 'bolt' | 'shield' | 'clock'

interface PopupItem {
  id: string
  label: string
  icon: PopupIcon
}

const MODULE_LABELS: Record<ActivePopup, string> = {
  module2: 'App Launcher',
  module3: 'Workflows'
}

const MODULE_ITEMS: Record<ActivePopup, PopupItem[]> = {
  module2: [
    { id: 'open-notion', label: 'Ouvrir Notion', icon: 'grid' },
    { id: 'workflow-backup', label: 'Workflow Backup', icon: 'folder' },
    { id: 'daily-briefing', label: 'Daily Briefing', icon: 'doc' }
  ],
  module3: [
    { id: 'deploy-release', label: 'Deploy Release', icon: 'bolt' },
    { id: 'security-audit', label: 'Security Audit', icon: 'shield' },
    { id: 'review-tasks', label: 'Review Pending Tasks', icon: 'clock' }
  ]
}

interface ModulePopupProps {
  activePopup: ActivePopup
  popupRef: RefObject<HTMLDivElement>
  onAddNew: () => void
}

function PlusIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function ItemIcon({ icon }: { icon: PopupIcon }): JSX.Element {
  if (icon === 'grid') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    )
  }

  if (icon === 'folder') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3V7z" />
        <rect x="3" y="10" width="18" height="10" rx="2" />
      </svg>
    )
  }

  if (icon === 'doc') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </svg>
    )
  }

  if (icon === 'shield') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 3l7 3v6c0 5-3.5 8.7-7 10-3.5-1.3-7-5-7-10V6l7-3z" />
      </svg>
    )
  }

  if (icon === 'clock') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6l4 2" />
      </svg>
    )
  }

  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2L5 13h6l-1 9 8-11h-6l1-9z" />
    </svg>
  )
}

export default function ModulePopup({ activePopup, popupRef, onAddNew }: ModulePopupProps): JSX.Element {
  const items = MODULE_ITEMS[activePopup]

  return (
    <motion.div
      ref={popupRef}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="absolute bottom-full right-0 z-30 mb-3 w-[320px] rounded-2xl border border-white/10 bg-neutral-900/80 p-3 shadow-xl shadow-black/40 backdrop-blur-xl"
      style={{ WebkitBackdropFilter: 'blur(30px)', backdropFilter: 'blur(30px)' }}
    >
      <p className="px-2 pb-2 text-xs uppercase tracking-[0.12em] text-neutral-500">{MODULE_LABELS[activePopup]}</p>

      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => console.log(`${MODULE_LABELS[activePopup]}: ${item.label}`)}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left text-sm text-neutral-200 transition-colors duration-150 hover:bg-white/5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-neutral-300">
              <ItemIcon icon={item.icon} />
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onAddNew}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-800/40 p-3 text-sm text-neutral-500 transition-colors duration-150 hover:border-neutral-500 hover:text-neutral-300"
      >
        <PlusIcon />
        <span>Add new action</span>
      </button>
    </motion.div>
  )
}
