import { motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FADE_FAST, SPRING_POPOVER } from '../constants/motion'

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

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

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
  const contentRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Keep keyboard focus inside the dialog, close on Escape when allowed, and
  // return focus to the control that opened it once the modal unmounts.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const content = contentRef.current

    const getFocusable = (): HTMLElement[] => {
      if (!content) return []
      return Array.from(content.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getClientRects().length > 0
      )
    }

    const frame = window.requestAnimationFrame(() => {
      if (!content || content.contains(document.activeElement)) return
      const preferred = content.querySelector<HTMLElement>('[data-autofocus]')
      const first = preferred ?? getFocusable()[0] ?? content
      first.focus({ preventScroll: true })
    })

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && onCloseRef.current) {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const items = getFocusable()
      if (items.length === 0) {
        event.preventDefault()
        content?.focus({ preventScroll: true })
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const inside = content?.contains(active)

      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown, true)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

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
      transition={FADE_FAST}
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
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98, transition: FADE_FAST }}
        transition={SPRING_POPOVER}
        className={`modal-scroll w-full max-h-full overflow-y-auto outline-none ${resolvedContentClassName}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body
  )
}
