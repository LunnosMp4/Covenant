import { motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalOverlayProps {
  children: ReactNode
  onClose?: () => void
  contentClassName?: string
  withBackdrop?: boolean
  /**
   * Scope the backdrop to the visible command-bar surface instead of the whole
   * (transparent) window. Without it the overlay would paint over the empty
   * margins around the panel. Falls back to the full window if no surface is
   * mounted.
   */
  contained?: boolean
}

const CONTAINED_SELECTOR = '.command-surface'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

function measureContained(): Rect | null {
  if (typeof document === 'undefined') return null
  const el = document.querySelector<HTMLElement>(CONTAINED_SELECTOR)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

export default function ModalOverlay({
  children,
  onClose,
  contentClassName,
  withBackdrop = true,
  contained = false
}: ModalOverlayProps): JSX.Element {
  const resolvedContentClassName = contentClassName ?? 'max-w-xl'
  const [bounds, setBounds] = useState<Rect | null>(() => (contained ? measureContained() : null))

  useEffect(() => {
    if (!contained) return
    const el = document.querySelector<HTMLElement>(CONTAINED_SELECTOR)
    const update = (): void => setBounds(measureContained())
    update()
    if (!el) return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [contained])

  const scoped = contained && bounds !== null
  const backdropClass = scoped
    ? 'bg-black/45 rounded-2xl overflow-hidden'
    : 'inset-0 bg-black/60'

  // Render into document.body so `position: fixed` is relative to the window,
  // not to a transformed (framer-motion) ancestor — otherwise tall modals
  // spill past the command bar's container.
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className={`fixed z-[100] flex items-center justify-center p-4 ${
        withBackdrop ? backdropClass : scoped ? 'rounded-2xl overflow-hidden' : ''
      }`}
      data-interactive-surface
      style={scoped ? { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height } : undefined}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.()
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className={`modal-scroll w-full max-h-full overflow-y-auto ${resolvedContentClassName}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body
  )
}
