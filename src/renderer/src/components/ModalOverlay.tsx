import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface ModalOverlayProps {
  children: ReactNode
  onClose?: () => void
  contentClassName?: string
}

export default function ModalOverlay({
  children,
  onClose,
  contentClassName
}: ModalOverlayProps): JSX.Element {
  const resolvedContentClassName = contentClassName ?? 'max-w-xl'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
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
    </motion.div>
  )
}
