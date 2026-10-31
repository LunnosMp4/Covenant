import type { ReactNode } from 'react'

interface KbdProps {
  children: ReactNode
  className?: string
}

/** A small physical keycap used for shortcut hints and onboarding. */
export default function Kbd({ children, className }: KbdProps): JSX.Element {
  return (
    <kbd
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-white/15 bg-white/[0.06] px-1.5 text-[10px] font-medium leading-none text-neutral-300 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)] ${className ?? ''}`}
    >
      {children}
    </kbd>
  )
}
