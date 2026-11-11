import ToggleSwitch from '../ui/ToggleSwitch'

export function MinimalistToggle({
  checked,
  onChange,
  label,
  description,
  disabled
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <label className={`text-sm font-medium ${disabled ? 'text-neutral-600' : 'text-neutral-100'}`}>{label}</label>
        {description ? (
          <p className={`mt-1 text-xs ${disabled ? 'text-neutral-700' : 'text-neutral-400'}`}>{description}</p>
        ) : null}
      </div>
      <ToggleSwitch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        ariaLabel={label}
      />
    </div>
  )
}

export function SectionCard({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: JSX.Element
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5">
      <h2 className="text-base font-semibold text-neutral-100">{title}</h2>
      <p className="mt-1 text-sm text-neutral-400">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}
