import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { PANEL_EXIT_TRANSITION, PANEL_TRANSITION } from '../constants/motion'
import { useMeasuredHeight } from '../utils/hooks/useMeasuredHeight'

interface MeasuredPanelProps {
  children: ReactNode
  className?: string
  contentClassName?: string
  width?: number
}

/**
 * A panel that reveals by animating to an explicitly measured pixel height
 * (never `height: 'auto'`), avoiding the flicker where Framer Motion renders
 * the expanded state to measure it.
 *
 * Once the reveal has settled we switch to `height: 'auto'` and stop measuring,
 * so later size changes (e.g. the native window expanding/collapsing) are
 * handled by the browser without re-rendering on every frame.
 */
export default function MeasuredPanel({
  children,
  className,
  contentClassName,
  width
}: MeasuredPanelProps): JSX.Element {
  const [settled, setSettled] = useState(false)
  const { ref, height } = useMeasuredHeight<HTMLDivElement>({ active: !settled })

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{
        opacity: 1,
        y: 0,
        height: settled ? 'auto' : height,
        ...(width !== undefined ? { width } : {})
      }}
      exit={{ opacity: 0, y: -6, height: 0, transition: PANEL_EXIT_TRANSITION }}
      transition={{
        ...PANEL_TRANSITION,
        ...(width !== undefined
          ? { width: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } }
          : {})
      }}
      onAnimationComplete={() => {
        if (height > 0) setSettled(true)
      }}
      className={className}
      style={{ overflow: settled ? 'visible' : 'hidden' }}
    >
      <div ref={ref} className={contentClassName}>
        {children}
      </div>
    </motion.div>
  )
}
