import { motion, type Transition } from 'framer-motion'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { PANEL_EXIT_TRANSITION, PANEL_TRANSITION } from '../constants/motion'
import { useMeasuredHeight } from '../utils/useMeasuredHeight'

interface MeasuredPanelProps {
  children: ReactNode
  className?: string
  contentClassName?: string
}

/**
 * A panel that reveals by animating to an explicitly measured pixel height
 * (never `height: 'auto'`), avoiding the flicker where Framer Motion renders
 * the expanded state to measure it. Overflow is clipped only while animating so
 * that dropdowns are not clipped once the panel has settled.
 */
export default function MeasuredPanel({
  children,
  className,
  contentClassName
}: MeasuredPanelProps): JSX.Element {
  const { ref, height } = useMeasuredHeight<HTMLDivElement>()
  const [settled, setSettled] = useState(false)

  const transition: Transition = PANEL_TRANSITION

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height }}
      exit={{ opacity: 0, y: -6, height: 0, transition: PANEL_EXIT_TRANSITION }}
      transition={transition}
      onAnimationStart={() => setSettled(false)}
      onAnimationComplete={() => setSettled(true)}
      className={className}
      style={{ overflow: settled ? 'visible' : 'hidden' }}
    >
      <div ref={ref} className={contentClassName}>
        {children}
      </div>
    </motion.div>
  )
}
