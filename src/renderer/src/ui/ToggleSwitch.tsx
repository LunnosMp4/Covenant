interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

/**
 * Shared settings switch. Uses the active theme accent so every toggle in the
 * app (settings, MCP servers and tools, clipboard) looks and behaves the same.
 */
export default function ToggleSwitch({
  checked,
  onChange,
  disabled,
  ariaLabel,
  className
}: ToggleSwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`pressable group relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border transition-colors duration-200 ${
        checked
          ? 'border-[color:var(--chat-accent-strong)] bg-[color:var(--chat-accent-soft)]'
          : 'border-neutral-700 bg-neutral-800'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''} ${className ?? ''}`}
    >
      <span
        className={`inline-block h-6 w-6 transform rounded-full shadow-sm transition-[transform,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          checked
            ? 'translate-x-5 bg-[color:var(--chat-accent)]'
            : 'translate-x-0.5 bg-neutral-400'
        }`}
      />
    </button>
  )
}
