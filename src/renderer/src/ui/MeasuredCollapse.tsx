import { AnimatePresence, motion, type Transition } from 'framer-motion'
import type { ReactNode } from 'react'
import { useMeasuredHeight } from '../utils/hooks/useMeasuredHeight'

interface MeasuredCollapseProps {
  open: boolean
  children: ReactNode
  className?: string
  duration?: number
}

/**
 * A collapsible region that animates to an explicitly measured pixel height
 * (never `height: 'auto'`), so it never flashes its expanded state before the
 * animation runs.
 */
export default function MeasuredCollapse({
  open,
  children,
  className,
  duration = 0.22
}: MeasuredCollapseProps): JSX.Element {
  const { ref, height } = useMeasuredHeight<HTMLDivElement>()
  const transition: Transition = { duration, ease: [0.22, 1, 0.36, 1] }

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={transition}
          className={`overflow-hidden ${className ?? ''}`}
        >
          <div ref={ref}>{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
