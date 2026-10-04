import type { ReactNode } from 'react'
import {
  MAX_PASTE_AGE_DAYS,
  MAX_PASTE_ITEMS,
  MIN_PASTE_AGE_DAYS,
  MIN_PASTE_ITEMS,
  type PasteManagerSettings
} from '../../../shared/paste'

interface PasteSettingsTabProps {
  settings: PasteManagerSettings
  onChange: (patch: Partial<PasteManagerSettings>) => void
  onClearHistory: (keepPinned: boolean) => void
  feedbackMessage: string
}

const AGE_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: 'Unlimited' },
  { value: 1, label: '1 day' },
  { value: 7, label: '1 week' },
  { value: 30, label: '1 month' },
  { value: 90, label: '3 months' },
  { value: 180, label: '6 months' },
  { value: 365, label: '1 year' }
]

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }): JSX.Element {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <header className="mb-4">
        <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
        {description && <p className="mt-1 text-xs text-neutral-500">{description}</p>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-neutral-200">{label}</p>
        <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors ${
          checked ? 'border-emerald-400/60 bg-emerald-400/30' : 'border-white/15 bg-white/5'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}

export default function PasteSettingsTab({
  settings,
  onChange,
  onClearHistory,
  feedbackMessage
}: PasteSettingsTabProps): JSX.Element {
  return (
    <div className="space-y-6">
      <Card
        title="Paste Manager"
        description="Keep a searchable history of everything you copy. Captured locally; nothing leaves your machine except optional OCR and AI actions."
      >
        <ToggleRow
          label="Enable Paste Manager"
          description="Monitor the clipboard in the background and register the global hotkey."
          checked={settings.enabled}
          onChange={(value) => onChange({ enabled: value })}
        />
        <ToggleRow
          label="Capture images"
          description="Store copied images (as files) so they appear in history. Disable to save disk space."
          checked={settings.captureImages}
          onChange={(value) => onChange({ captureImages: value })}
        />
        <ToggleRow
          label="Capture rich text"
          description="Preserve formatting (HTML) alongside plain text when available."
          checked={settings.captureRichText}
          onChange={(value) => onChange({ captureRichText: value })}
        />
        <ToggleRow
          label="Fetch link previews"
          description="Fetch the page title for copied links (non-blocking, cached)."
          checked={settings.fetchLinkPreviews}
          onChange={(value) => onChange({ fetchLinkPreviews: value })}
        />
        <ToggleRow
          label="OCR copied images"
          description="Extract text from copied images via your OpenAI API key so it becomes searchable. Sends the image to the model."
          checked={settings.ocrEnabled}
          onChange={(value) => onChange({ ocrEnabled: value })}
        />
      </Card>

      <Card title="Retention" description="Pinned items are always kept, regardless of these limits.">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-200">Maximum items</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              Keep the most recent {settings.maxItems.toLocaleString()} unpinned items.
            </p>
          </div>
          <input
            type="number"
            min={MIN_PASTE_ITEMS}
            max={MAX_PASTE_ITEMS}
            value={settings.maxItems}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isFinite(value)) onChange({ maxItems: value })
            }}
            className="w-28 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-right text-sm text-neutral-100 focus:border-emerald-400/50"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-200">Keep history for</p>
            <p className="mt-0.5 text-xs text-neutral-500">Delete unpinned items older than this.</p>
          </div>
          <select
            value={settings.maxAgeDays ?? ''}
            onChange={(event) =>
              onChange({ maxAgeDays: event.target.value === '' ? null : Number(event.target.value) })
            }
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-neutral-100 focus:border-emerald-400/50"
          >
            {AGE_OPTIONS.map((option) => (
              <option key={option.label} value={option.value ?? ''} className="bg-neutral-900">
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[11px] text-neutral-600">
          Range: {MIN_PASTE_AGE_DAYS}–{MAX_PASTE_AGE_DAYS} days, or unlimited.
        </p>
      </Card>

      <Card title="Danger zone" description="Clearing history cannot be undone.">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onClearHistory(true)}
            className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200"
          >
            Clear unpinned history
          </button>
          <button
            type="button"
            onClick={() => onClearHistory(false)}
            className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200"
          >
            Clear everything
          </button>
        </div>
        {feedbackMessage && <p className="text-xs text-emerald-300">{feedbackMessage}</p>}
      </Card>
    </div>
  )
}
