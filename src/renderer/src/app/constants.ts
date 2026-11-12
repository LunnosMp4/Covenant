import type { GamificationState } from '../../../shared/tasks/gamification'

export const DEFAULT_GAMIFICATION_STATE: GamificationState = {
  currentLevel: 1,
  currentXP: 0,
  totalLifetimeXP: 0,
  streakDays: 0,
  lastActiveDate: null
}

export const MAX_WORKFLOW_LOG_LINES = 200
export const CHAT_SCROLL_HEIGHT = 300

// Command bar geometry. The input grows up to `MAX_COMMAND_BAR_LINES` lines and
// then scrolls; the bar keeps a fixed footprint in the layout so growing upward
// overlaps the surface above instead of pushing it higher. These values mirror
// the bar's classes: `p-2` + one `text-lg` line (28px) + 1px borders.
export const MAX_COMMAND_BAR_LINES = 4
export const COMMAND_BAR_LINE_HEIGHT = 28
export const COMMAND_BAR_INPUT_PADDING = 24
export const COMMAND_BAR_COLLAPSED_HEIGHT = 70
export const COMMAND_BAR_GAP = 8
export const COMMAND_BAR_MAX_INPUT_HEIGHT =
  MAX_COMMAND_BAR_LINES * COMMAND_BAR_LINE_HEIGHT + COMMAND_BAR_INPUT_PADDING
// Reserved space inside the command-bar column. The bar is taken out of flow
// and pinned to the bottom of this space, so it can grow upward over the panel
// above while the panel keeps its position (the 8px gap is part of the reserve,
// which is why the panel no longer needs its own bottom margin).
export const COMMAND_BAR_RESERVED_HEIGHT = COMMAND_BAR_COLLAPSED_HEIGHT + COMMAND_BAR_GAP
// Distance from the window bottom to the top of the collapsed bar: the root's
// `pb-5` (20px) + bar height + gap. Used to stack the terminal surface above it.
export const COMMAND_BAR_TOP_OFFSET = 20 + COMMAND_BAR_COLLAPSED_HEIGHT + COMMAND_BAR_GAP

export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const MAX_ATTACHED_IMAGES = 10
