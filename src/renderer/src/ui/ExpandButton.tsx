import type { MouseEvent } from 'react'
import { ExpandIcon } from './icons'

interface ExpandButtonProps {
  expanded: boolean
  wide: boolean
  altHeld: boolean
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}

/**
 * The expand/collapse control shared by the chat and terminal headers. Holding
 * Alt (when already vertically expanded) turns it into the horizontal
 * expand/collapse control.
 */
export default function ExpandButton({
  expanded,
  wide,
  altHeld,
  onClick
}: ExpandButtonProps): JSX.Element {
  const horizontal = altHeld
  const label = horizontal
    ? wide
      ? 'Shrink width'
      : 'Expand width'
    : expanded
      ? 'Collapse window'
      : 'Expand window'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
        expanded
          ? 'border-white/20 bg-white/10 text-neutral-200'
          : 'border-white/10 text-neutral-400 hover:border-white/20 hover:bg-white/10 hover:text-neutral-200'
      }`}
      aria-label={label}
      aria-pressed={expanded}
    >
      <ExpandIcon expanded={expanded} wide={wide} altHeld={altHeld} />
    </button>
  )
}
