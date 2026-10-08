/**
 * The single surface the command window is currently showing. This is the
 * source of truth for keyboard navigation: every global shortcut targets one
 * view, and pressing the same shortcut again while that view is active closes
 * the window instead of re-opening something stale.
 */
export type WindowView = 'bar' | 'chat' | 'code' | 'terminal' | 'tasks' | 'popup'

/**
 * Views a global shortcut can explicitly request. `popup` is a reported-only
 * sentinel for any popup that has no dedicated shortcut (app launcher, workflow,
 * settings), so a shortcut press switches views instead of being mistaken for a
 * repeat press.
 */
export type WindowTargetView = 'bar' | 'chat' | 'code' | 'terminal' | 'tasks'
