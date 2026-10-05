import type { Transition } from 'framer-motion'

/**
 * Shared motion presets so every surface (command bar, chat panel, terminal,
 * windows) enters/exits with the same feel. Values mirror the springs already
 * used across the app — centralising them keeps animations consistent.
 */
export const WINDOW_SPRING: Transition = {
  type: 'spring',
  damping: 15,
  stiffness: 120,
  mass: 0.8
}

export const PANEL_TRANSITION: Transition = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1]
}

export const PANEL_EXIT_TRANSITION: Transition = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1]
}

export const TERMINAL_SPRING: Transition = {
  type: 'spring',
  damping: 22,
  stiffness: 280,
  mass: 1
}

export const WINDOW_ENTER_TRANSITION: Transition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1]
}

export const WINDOW_EXIT_TRANSITION: Transition = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1]
}
