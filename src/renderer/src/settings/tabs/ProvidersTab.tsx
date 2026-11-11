import type {
  AiModelOption,
  ChatProviderId,
  OpenCodePlan,
  ReasoningEffort
} from '../../../../shared/config'
import {
  CHAT_PROVIDERS,
  OPENCODE_MODEL_OPTIONS,
  REASONING_EFFORT_OPTIONS,
  getModelOptionsForProvider
} from '../../../../shared/config'
import CustomSelect from '../../ui/CustomSelect'
import SecretField from '../SecretField'
import { MinimalistToggle, SectionCard } from '../primitives'
import type { SecretFieldResult } from '../SecretField'

interface ProvidersTabProps {
  chatProvider: ChatProviderId
  onChatProviderChange: (provider: ChatProviderId) => void
  chatModel: string
  onChatModelChange: (model: string) => void
  opencodeChatModel: string
  onOpencodeChatModelChange: (model: string) => void
  opencodePlan: OpenCodePlan
  onOpencodePlanChange: (plan: OpenCodePlan) => void
  opencodeModels: AiModelOption[]
  onRefreshModels: () => void
  hasOpenAIKey: boolean
  openaiKeySource: 'config' | 'env' | 'none'
  hasOpenCodeKey: boolean
  onSaveOpenAIKey: (key: string) => Promise<SecretFieldResult>
  onClearOpenAIKey: () => Promise<void>
  onSaveOpencodeKey: (key: string) => Promise<SecretFieldResult>
  onClearOpencodeKey: () => Promise<void>
  onTestOpencodeKey: () => Promise<SecretFieldResult>
  reasoningEffort: ReasoningEffort
  onReasoningEffortChange: (effort: ReasoningEffort) => void
  autoCollapseReasoning: boolean
  onAutoCollapseReasoningChange: (enabled: boolean) => void
  isConfigLoaded: boolean
}

export default function ProvidersTab({
  chatProvider,
  onChatProviderChange,
  chatModel,
  onChatModelChange,
  opencodeChatModel,
  onOpencodeChatModelChange,
  opencodePlan,
  onOpencodePlanChange,
  opencodeModels,
  onRefreshModels,
  hasOpenAIKey,
  openaiKeySource,
  hasOpenCodeKey,
  onSaveOpenAIKey,
  onClearOpenAIKey,
  onSaveOpencodeKey,
  onClearOpencodeKey,
  onTestOpencodeKey,
  reasoningEffort,
  onReasoningEffortChange,
  autoCollapseReasoning,
  onAutoCollapseReasoningChange,
  isConfigLoaded
}: ProvidersTabProps): JSX.Element {
  const models =
    chatProvider === 'opencode'
      ? opencodeModels.length > 0
        ? opencodeModels
        : OPENCODE_MODEL_OPTIONS
      : getModelOptionsForProvider('openai')
  const activeModelId = chatProvider === 'opencode' ? opencodeChatModel : chatModel
  const activeModel = models.find((model) => model.id === activeModelId)
  const supportsReasoning = activeModel?.supportsExtendedParams ?? false

  return (
    <div className="space-y-6">
      <SectionCard
        title="Chat provider"
        description="This provider handles chat, notes, recaps, task evaluation and OCR. Microphone and meeting transcription always use OpenAI."
      >
        <div className="inline-flex rounded-xl border border-neutral-800 bg-neutral-900/70 p-1">
          {CHAT_PROVIDERS.map((provider) => {
            const isActive = chatProvider === provider.id
            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => onChatProviderChange(provider.id)}
                className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-neutral-800 text-neutral-100'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {provider.label}
              </button>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Credentials"
        description="Keys stay in the main process and are never returned to this window."
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
            <SecretField
              label="OpenAI API key"
              description="Required for microphone and meeting transcription. Also used when OpenAI chat or OpenAI web search is selected."
              hasSavedValue={hasOpenAIKey}
              placeholder="sk-..."
              disabled={!isConfigLoaded}
              savedLabel={openaiKeySource === 'env' ? 'From environment' : 'Saved'}
              savedHint={
                openaiKeySource === 'env'
                  ? 'Loaded from OPENAI_API_KEY.'
                  : undefined
              }
              savedPlaceholder={
                openaiKeySource === 'env'
                  ? '••••••••  Provided by OPENAI_API_KEY'
                  : undefined
              }
              onSave={onSaveOpenAIKey}
              onClear={openaiKeySource === 'config' ? onClearOpenAIKey : undefined}
              clearLabel="Remove key"
            >
              {openaiKeySource === 'env' ? (
                <p className="text-xs text-neutral-500">
                  This key comes from <code>OPENAI_API_KEY</code> in your environment.
                </p>
              ) : null}
            </SecretField>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
            <SecretField
              label="OpenCode API key"
              description="Shared by OpenCode chat and Covenant Code. One key for both."
              hasSavedValue={hasOpenCodeKey}
              placeholder="Paste your OpenCode API key"
              disabled={!isConfigLoaded}
              onSave={onSaveOpencodeKey}
              onClear={onClearOpencodeKey}
              onTest={onTestOpencodeKey}
              clearLabel="Disconnect"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                    Plan
                  </label>
                  <CustomSelect
                    options={[
                      { value: 'go', label: 'Go' },
                      { value: 'payg', label: 'Pay-as-you-go' }
                    ]}
                    value={opencodePlan}
                    onChange={(value) => onOpencodePlanChange(value as OpenCodePlan)}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() =>
                      window.api?.openExternal?.('https://opencode.ai/console')
                    }
                    className="pressable rounded-lg border border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-300 hover:border-neutral-500 hover:text-neutral-100"
                  >
                    Open OpenCode Console
                  </button>
                </div>
              </div>
            </SecretField>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Model"
        description={
          chatProvider === 'opencode'
            ? 'Models are fetched from the OpenCode catalog and can be refreshed.'
            : 'OpenAI models available to Covenant.'
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label className="block text-sm font-medium text-neutral-300">
              {chatProvider === 'opencode' ? 'OpenCode model' : 'OpenAI model'}
            </label>
            {chatProvider === 'opencode' ? (
              <button
                type="button"
                onClick={onRefreshModels}
                className="text-xs text-neutral-500 hover:text-neutral-300"
              >
                Refresh
              </button>
            ) : null}
          </div>
          <CustomSelect
            options={models.map((model) => ({ value: model.id, label: model.label }))}
            value={activeModelId}
            onChange={(value) =>
              chatProvider === 'opencode'
                ? onOpencodeChatModelChange(value)
                : onChatModelChange(value)
            }
          />
          {activeModel ? (
            <p className="text-xs text-neutral-500">
              {Math.round(activeModel.maxContextTokens / 1000)}K context
              {activeModel.supportsVision ? ' · vision' : ''}
              {activeModel.supportsTools ? ' · tools' : ''}
              {activeModel.supportsReasoning ? ' · reasoning' : ''}
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Reasoning"
        description="Controls how much compute the model spends reasoning. Unsupported models ignore this setting."
      >
        <div className="space-y-5">
          <div>
            <label className={`mb-2 block text-sm font-medium ${supportsReasoning ? 'text-neutral-300' : 'text-neutral-600'}`}>
              Reasoning effort
            </label>
            <CustomSelect
              options={REASONING_EFFORT_OPTIONS.map((effort) => ({
                value: effort,
                label: effort.charAt(0).toUpperCase() + effort.slice(1)
              }))}
              value={reasoningEffort}
              onChange={(value) => onReasoningEffortChange(value as ReasoningEffort)}
              disabled={!supportsReasoning}
            />
            <p className={`mt-2 text-xs ${supportsReasoning ? 'text-neutral-500' : 'text-neutral-600'}`}>
              {supportsReasoning ? 'Applies to the next request.' : 'Not supported by this model.'}
            </p>
          </div>

          <MinimalistToggle
            checked={autoCollapseReasoning}
            onChange={onAutoCollapseReasoningChange}
            label="Auto-collapse Reasoning"
            description="Automatically collapse the reasoning panel after the response completes."
          />
        </div>
      </SectionCard>
    </div>
  )
}
