/**
 * Design tokens exposed to generated surfaces.
 *
 * Generated CSS may only reference this allowlist through `var(--token)`, and
 * may not invent palette, font or radius tokens of its own. Keeping the list in
 * one place is what lets the app and the validator agree.
 */

const GENERATED_COLOR_TOKENS = [
  '--chat-accent',
  '--chat-accent-soft',
  '--chat-accent-strong',
  '--chat-on-accent',
  '--chat-assistant-text',
  '--chat-assistant-bg',
  '--chat-assistant-border',
  '--chat-meta-text',
  '--ui-grid',
  '--ui-axis',
  '--ui-surface',
  '--ui-surface-strong',
  '--ui-positive',
  '--ui-negative',
  '--ui-series-1',
  '--ui-series-2',
  '--ui-series-3',
  '--ui-series-4',
  '--ui-series-5',
  '--ui-series-6',
  '--n-50',
  '--n-100',
  '--n-200',
  '--n-300',
  '--n-400',
  '--n-500',
  '--n-600',
  '--n-700',
  '--n-800',
  '--n-900',
  '--n-950'
] as const

const GENERATED_SPACE_TOKENS = [
  '--ui-space-2xs',
  '--ui-space-xs',
  '--ui-space-sm',
  '--ui-space-md',
  '--ui-space-lg',
  '--ui-space-xl'
] as const

const GENERATED_RADIUS_TOKENS = [
  '--ui-radius-sm',
  '--ui-radius-md',
  '--ui-radius-lg',
  '--ui-radius-pill'
] as const

const GENERATED_TYPE_TOKENS = [
  '--ui-font',
  '--ui-font-size-xs',
  '--ui-font-size-sm',
  '--ui-font-size-md',
  '--ui-font-size-lg',
  '--ui-weight-regular',
  '--ui-weight-medium',
  '--ui-weight-semibold',
  '--ui-leading-tight',
  '--ui-leading-normal'
] as const

export const GENERATED_TOKENS: readonly string[] = [
  ...GENERATED_COLOR_TOKENS,
  ...GENERATED_SPACE_TOKENS,
  ...GENERATED_RADIUS_TOKENS,
  ...GENERATED_TYPE_TOKENS
]

/**
 * Presentational controls the runtime injects into every generated frame.
 * Generated CSS may adjust layout only — never their colours, borders or type.
 */
export const GENERATED_SHARED_CONTROL_SELECTORS = [
  '.cv-button',
  '.cv-input',
  '.cv-select',
  '.cv-toggle',
  '.cv-range',
  '.cv-card',
  '.cv-kpi',
  '.cv-chart',
  '.cv-table'
] as const

export const GENERATED_LAYOUT_PROPERTIES = new Set([
  'display',
  'flex',
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'align-items',
  'align-self',
  'justify-content',
  'gap',
  'row-gap',
  'column-gap',
  'grid',
  'grid-template',
  'grid-template-columns',
  'grid-template-rows',
  'grid-auto-flow',
  'grid-column',
  'grid-row',
  'order',
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'overflow',
  'overflow-x',
  'overflow-y',
  'box-sizing'
])
