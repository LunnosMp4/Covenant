import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalOverlayProps {
  children: ReactNode
  onClose?: () => void
  contentClassName?: string
  withBackdrop?: boolean
}

export default function ModalOverlay({
  children,
  onClose,
  contentClassName,
  withBackdrop = true
}: ModalOverlayProps): JSX.Element {
  const resolvedContentClassName = contentClassName ?? 'max-w-xl'

  // Render into document.body so `position: fixed` is relative to the window,
  // not to a transformed (framer-motion) ancestor — otherwise tall modals
  // spill past the command bar's container.
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${
        withBackdrop ? 'bg-black/60 backdrop-blur-sm' : ''
      }`}
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
        className={`modal-scroll w-full max-h-[calc(100vh-2rem)] overflow-y-auto ${resolvedContentClassName}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body
  )
}
