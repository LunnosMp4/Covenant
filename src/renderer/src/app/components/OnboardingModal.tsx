import { motion } from 'framer-motion'

interface OnboardingModalProps {
  apiKey: string
  onApiKeyChange: (value: string) => void
  onSkip: () => void
  onComplete: () => void
}

export default function OnboardingModal({
  apiKey,
  onApiKeyChange,
  onSkip,
  onComplete
}: OnboardingModalProps): JSX.Element {
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-neutral-100">Welcome to Covenant</h2>
        <p className="mt-2 text-sm text-neutral-400">
          A floating command bar for AI chat, terminal, and workflows. Press{' '}
          <span className="text-neutral-200">Alt+Space</span> to open it.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-neutral-400">
          <li>
            <span className="text-neutral-200">Alt+Space</span> — open the bar for a new
            conversation
          </li>
          <li>
            <span className="text-neutral-200">Ctrl+Alt+Space</span> — open your last conversation
          </li>
          <li>
            <span className="text-neutral-200">Alt+T</span> — open the terminal
          </li>
          <li>
            <span className="text-neutral-200">Alt+C</span> — open Covenant Code
          </li>
          <li>
            <span className="text-neutral-200">Ctrl+Tab</span> — toggle the conversation panel
          </li>
          <li>
            <span className="text-neutral-200">Escape</span> — close the bar
          </li>
        </ul>
        <div className="mt-5">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
            OpenAI API key <span className="normal-case text-neutral-500">(optional)</span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            placeholder="sk-..."
            autoComplete="off"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
          />
          <p className="mt-2 text-xs text-neutral-500">
            You can also add this later in Settings. The key never leaves this device.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onComplete}
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
          >
            Get started
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
