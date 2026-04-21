import { motion } from 'framer-motion'
import type { RefObject } from 'react'

export type ActivePopup = 'module2' | 'module3' | 'module4'
export type PopupAnchorSide = 'left' | 'right'

type PopupIcon = 'grid' | 'folder' | 'doc' | 'bolt' | 'shield' | 'clock'

export interface PopupItem {
  id: string
  title: string
  icon: PopupIcon
  subtitle?: string
  promptText?: string
}

const MODULE_LABELS: Record<ActivePopup, string> = {
  module2: 'App Launcher',
  module3: 'Workflows',
  module4: 'Prompt Library'
}

const MODULE_ITEMS: Record<ActivePopup, PopupItem[]> = {
  module2: [
    { id: 'open-notion', title: 'Ouvrir Notion', icon: 'grid' },
    { id: 'workflow-backup', title: 'Workflow Backup', icon: 'folder' },
    { id: 'daily-briefing', title: 'Daily Briefing', icon: 'doc' }
  ],
  module3: [
    { id: 'deploy-release', title: 'Deploy Release', icon: 'bolt' },
    { id: 'security-audit', title: 'Security Audit', icon: 'shield' },
    { id: 'review-tasks', title: 'Review Pending Tasks', icon: 'clock' }
  ],
  module4: [
    {
      id: 'follow-up-email',
      title: 'Meeting Follow-up',
      subtitle: 'Write a concise summary and action plan.',
      icon: 'doc',
      promptText:
        'Create a clear meeting follow-up message using these details:\n- Key decisions:\n- Action items by owner:\n- Deadlines:\n- Risks or blockers:'
    },
    {
      id: 'bug-report-template',
      title: 'Bug Repro Template',
      subtitle: 'Generate a complete bug ticket structure.',
      icon: 'shield',
      promptText:
        'Turn these notes into a structured bug report with:\n1) Context\n2) Steps to reproduce\n3) Expected result\n4) Actual result\n5) Impact and severity\n6) Suggested next actions.'
    },
    {
      id: 'code-review-summary',
      title: 'Code Review Summary',
      subtitle: 'Summarize findings with priorities.',
      icon: 'clock',
      promptText:
        'Review the following changes and provide:\n- Critical issues\n- Medium-risk concerns\n- Quick wins\n- Final recommendation\nKeep the output concise and actionable.'
    }
  ]
}

interface ModulePopupProps {
  activePopup: ActivePopup
  popupRef: RefObject<HTMLDivElement>
  onAddNew: () => void
  onSelectItem: (item: PopupItem) => void
  anchorSide?: PopupAnchorSide
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

export default function ModulePopup({
  activePopup,
  popupRef,
  onAddNew,
  onSelectItem,
  anchorSide = 'right'
}: ModulePopupProps): JSX.Element {
  const items = MODULE_ITEMS[activePopup]
  const anchorClass = anchorSide === 'left' ? 'left-0' : 'right-0'

  return (
    <motion.div
      ref={popupRef}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={`absolute bottom-full ${anchorClass} z-30 mb-3 w-[320px] rounded-2xl border border-white/10 bg-neutral-900/80 p-3 shadow-xl shadow-black/40 backdrop-blur-xl`}
      style={{ WebkitBackdropFilter: 'blur(30px)', backdropFilter: 'blur(30px)', backgroundImage: 'linear-gradient(135deg, rgba(23, 23, 23, 0.75) 0%, rgba(110, 82, 54, 0.78) 100%)' }}
    >
      <p className="px-2 pb-2 text-xs uppercase tracking-[0.12em] text-neutral-500">{MODULE_LABELS[activePopup]}</p>

      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectItem(item)}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left text-sm text-neutral-200 transition-colors duration-150 hover:bg-white/5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-neutral-300">
              <ItemIcon icon={item.icon} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{item.title}</span>
              {item.subtitle && <span className="mt-0.5 truncate text-xs text-neutral-500">{item.subtitle}</span>}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onAddNew}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-800/40 p-3 text-sm text-neutral-500 transition-colors duration-150 hover:border-neutral-500 hover:text-neutral-300"
      >
        <PlusIcon />
        <span>Add new...</span>
      </button>
    </motion.div>
  )
}
