import type { Transition } from 'framer-motion'

/**
 * Shared motion tokens.
 *
 * House style: springs are critically damped (no overshoot) and every surface
 * enters/exits through the same path. Bounce is reserved for interactions that
 * actually carry momentum (drag release), never for menu or panel appearances.
 */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** Small UI changes (toggles, inline state, micro-layout). */
export const SPRING_UI: Transition = {
  type: 'spring',
  bounce: 0,
  duration: 0.28
}

/** Large surfaces (command bar, terminal, settings window). */
export const SPRING_SURFACE: Transition = {
  type: 'spring',
  bounce: 0,
  duration: 0.32
}

/** Anchored popovers, menus and dropdowns. */
export const SPRING_POPOVER: Transition = {
  type: 'spring',
  bounce: 0,
  duration: 0.24
}

/** Short fades that should never feel like a wait. */
export const FADE_FAST: Transition = {
  duration: 0.14,
  ease: EASE_OUT
}

// Backwards-compatible aliases used across the app. The names stay stable so
// existing call sites keep their intent while the values are centralised.
export const WINDOW_SPRING: Transition = SPRING_SURFACE

export const PANEL_TRANSITION: Transition = {
  duration: 0.22,
  ease: EASE_OUT
}

export const PANEL_EXIT_TRANSITION: Transition = {
  duration: 0.16,
  ease: EASE_OUT
}

export const TERMINAL_SPRING: Transition = SPRING_SURFACE

export const WINDOW_ENTER_TRANSITION: Transition = {
  duration: 0.22,
  ease: EASE_OUT
}

export const WINDOW_EXIT_TRANSITION: Transition = {
  duration: 0.16,
  ease: EASE_OUT
}
