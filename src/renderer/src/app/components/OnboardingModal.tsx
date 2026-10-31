import { Fragment } from 'react'
import Kbd from '../../ui/Kbd'
import ModalOverlay from '../../ui/ModalOverlay'

interface OnboardingModalProps {
  apiKey: string
  onApiKeyChange: (value: string) => void
  onSkip: () => void
  onComplete: () => void
}

function Shortcut({ keys }: { keys: string[] }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {keys.map((key, index) => (
        <Fragment key={`${key}-${index}`}>
          {index > 0 ? <span className="text-[10px] text-neutral-400">+</span> : null}
          <Kbd>{key}</Kbd>
        </Fragment>
      ))}
    </span>
  )
}

export default function OnboardingModal({
  apiKey,
  onApiKeyChange,
  onSkip,
  onComplete
}: OnboardingModalProps): JSX.Element {
  return (
    <ModalOverlay contentClassName="max-w-md">
      <div className="relative w-full rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-neutral-100">Welcome to Covenant</h2>
        <p className="mt-2 text-sm text-neutral-400">
          A floating command bar for AI chat, terminal, and workflows. Press{' '}
          <Shortcut keys={['Alt', 'Space']} /> to open it.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-neutral-400">
          <li>
            <Shortcut keys={['Alt', 'Space']} /> — open the bar for a new conversation
          </li>
          <li>
            <Shortcut keys={['Ctrl', 'Alt', 'Space']} /> — open your last conversation
          </li>
          <li>
            <Shortcut keys={['Alt', 'T']} /> — open the terminal
          </li>
          <li>
            <Shortcut keys={['Alt', 'C']} /> — open Covenant Code
          </li>
          <li>
            <Shortcut keys={['Ctrl', 'Tab']} /> — toggle the conversation panel
          </li>
          <li>
            <Shortcut keys={['Esc']} /> — close the bar
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
            className="pressable rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-600"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onComplete}
            data-autofocus
            className="pressable btn-primary rounded-xl px-4 py-2 text-sm font-medium"
          >
            Get started
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
