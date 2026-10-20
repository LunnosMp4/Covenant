import type { NotesSettings, TranscriptionModel } from '../../../../shared/config'
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_NOTES_SETTINGS,
  TRANSCRIPTION_MODEL_OPTIONS
} from '../../../../shared/config'
import CustomSelect from '../../ui/CustomSelect'
import { MinimalistToggle, SectionCard } from '../primitives'

interface NotesTabProps {
  settings: NotesSettings
  onChange: (patch: Partial<NotesSettings>) => void
}

const LANGUAGE_OPTIONS = [
  { value: '', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' }
]

export default function NotesTab({ settings, onChange }: NotesTabProps): JSX.Element {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Meeting Recording"
        description="Meetings are recorded locally. Audio segments are sent to OpenAI for transcription only; the recording stays on this device."
      >
        <div className="space-y-4">
          <MinimalistToggle
            checked={settings.captureSystemAudio}
            onChange={(checked) => onChange({ captureSystemAudio: checked })}
            label="Capture system audio by default"
            description="Records the sound of your PC (other participants, videos, apps) in addition to your microphone. On macOS this needs System Audio Recording permission."
          />
          <MinimalistToggle
            checked={settings.keepAudio}
            onChange={(checked) => onChange({ keepAudio: checked })}
            label="Keep audio recordings"
            description="Keep the segmented audio files after transcription so you can play them back from the meeting note."
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Transcription"
        description="Audio is split into short segments and transcribed as the meeting runs, so long meetings stay within API limits."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Transcription model
            </label>
            <CustomSelect
              value={settings.transcriptionModel}
              onChange={(value) =>
                onChange({ transcriptionModel: value as TranscriptionModel })
              }
              options={TRANSCRIPTION_MODEL_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label
              }))}
            />
            <p className="mt-1.5 text-xs text-neutral-500">
              {
                TRANSCRIPTION_MODEL_OPTIONS.find(
                  (option) => option.id === settings.transcriptionModel
                )?.description
              }
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Spoken language
            </label>
            <CustomSelect
              value={settings.transcriptionLanguage}
              onChange={(value) => onChange({ transcriptionLanguage: value })}
              options={LANGUAGE_OPTIONS}
            />
            <p className="mt-1.5 text-xs text-neutral-500">
              Set this when the meeting language is known for better accuracy.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Recap"
        description="After a meeting stops, the transcript is sent to the selected model to produce a structured recap with key points, decisions and action items."
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Summary model
            </label>
            <CustomSelect
              value={settings.summaryModel}
              onChange={(value) => onChange({ summaryModel: value })}
              options={[
                { value: '', label: 'Use current chat model' },
                ...CHAT_MODEL_OPTIONS.map((option) => ({
                  value: option.id,
                  label: option.label
                }))
              ]}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Custom recap instructions
              <span className="ml-2 text-xs font-normal text-neutral-500">Optional</span>
            </label>
            <textarea
              value={settings.summaryPrompt}
              onChange={(event) => onChange({ summaryPrompt: event.target.value })}
              rows={5}
              placeholder="Example: Focus on engineering decisions and include a section for customer feedback."
              className="chat-scrollbar w-full resize-y rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-neutral-500">
              These instructions are added before the built-in recap format. Leave empty to use the
              default.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Defaults"
        description="Restore the meeting defaults. Existing notes and recordings are not affected."
      >
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_NOTES_SETTINGS })}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          Reset note settings
        </button>
      </SectionCard>
    </div>
  )
}
