import type {
  AiModelOption,
  ChatProviderId,
  OpenCodePlan,
  ReasoningEffort,
  WebSearchProviderId
} from '../../../../shared/config'
import {
  CHAT_PROVIDERS,
  OPENCODE_MODEL_OPTIONS,
  REASONING_EFFORT_OPTIONS,
  WEB_SEARCH_PROVIDERS,
  getModelOptionsForProvider
} from '../../../../shared/config'
import CustomSelect from '../../ui/CustomSelect'
import { MinimalistToggle, SectionCard } from '../primitives'

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
  hasOpenCodeKey: boolean
  opencodeKey: string
  onOpencodeKeyChange: (key: string) => void
  onSaveOpencodeKey: () => void
  onClearOpencodeKey: () => void
  onTestOpencodeKey: () => void
  opencodeFeedback: string
  opencodeTesting: boolean
  reasoningEffort: ReasoningEffort
  onReasoningEffortChange: (effort: ReasoningEffort) => void
  enableWebSearch: boolean
  onWebSearchChange: (enabled: boolean) => void
  webSearchProvider: WebSearchProviderId
  onWebSearchProviderChange: (provider: WebSearchProviderId) => void
  webSearchSearxngUrl: string
  onWebSearchSearxngUrlChange: (url: string) => void
  webSearchSearxngAuthType: 'none' | 'basic' | 'bearer'
  onWebSearchSearxngAuthTypeChange: (value: 'none' | 'basic' | 'bearer') => void
  webSearchSearxngUsername: string
  onWebSearchSearxngUsernameChange: (value: string) => void
  webSearchSearxngSecret: string
  onWebSearchSearxngSecretChange: (value: string) => void
  webSearchSearxngAllowInsecure: boolean
  onWebSearchSearxngAllowInsecureChange: (value: boolean) => void
  webSearchBypassProxyForLocal: boolean
  onWebSearchBypassProxyForLocalChange: (value: boolean) => void
  webSearchFallbackProvider: string
  onWebSearchFallbackProviderChange: (value: string) => void
  webSearchTimeoutMs: number
  onWebSearchTimeoutMsChange: (value: number) => void
  onSaveSearchSecret: () => void
  onTestWebSearch: () => void
  webSearchFeedback: string
  webSearchTesting: boolean
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
  hasOpenCodeKey,
  opencodeKey,
  onOpencodeKeyChange,
  onSaveOpencodeKey,
  onClearOpencodeKey,
  onTestOpencodeKey,
  opencodeFeedback,
  opencodeTesting,
  reasoningEffort,
  onReasoningEffortChange,
  enableWebSearch,
  onWebSearchChange,
  webSearchProvider,
  onWebSearchProviderChange,
  webSearchSearxngUrl,
  onWebSearchSearxngUrlChange,
  webSearchSearxngAuthType,
  onWebSearchSearxngAuthTypeChange,
  webSearchSearxngUsername,
  onWebSearchSearxngUsernameChange,
  webSearchSearxngSecret,
  onWebSearchSearxngSecretChange,
  webSearchSearxngAllowInsecure,
  onWebSearchSearxngAllowInsecureChange,
  webSearchBypassProxyForLocal,
  onWebSearchBypassProxyForLocalChange,
  webSearchFallbackProvider,
  onWebSearchFallbackProviderChange,
  webSearchTimeoutMs,
  onWebSearchTimeoutMsChange,
  onSaveSearchSecret,
  onTestWebSearch,
  webSearchFeedback,
  webSearchTesting,
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
  const supportsWebSearch = activeModel ? activeModel.webSearch !== false : true

  const searchNeedsKey =
    webSearchProvider === 'tavily' || webSearchProvider === 'exa'
  const isSearxng = webSearchProvider === 'searxng'

  return (
    <div className="space-y-6">
      <SectionCard
        title="AI provider"
        description="Choose which provider handles chat, notes, recaps, task evaluation and OCR. OpenAI is still required for microphone and meeting transcription."
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

      {chatProvider === 'opencode' ? (
        <SectionCard
          title="OpenCode"
          description="Use the same OpenCode API key as Covenant Code. Supports Go and pay-as-you-go plans."
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-300">Plan</label>
              <CustomSelect
                options={[
                  { value: 'go', label: 'Go' },
                  { value: 'payg', label: 'Pay-as-you-go' }
                ]}
                value={opencodePlan}
                onChange={(value) => onOpencodePlanChange(value as OpenCodePlan)}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-300">API key</label>
              <div className="flex items-center gap-3">
                <input
                  type="password"
                  value={opencodeKey}
                  onChange={(event) => onOpencodeKeyChange(event.target.value)}
                  placeholder={hasOpenCodeKey ? '•••••••• (saved)' : 'Paste your OpenCode API key'}
                  autoComplete="off"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={onSaveOpencodeKey}
                  disabled={!opencodeKey.trim() || !isConfigLoaded}
                  className="pressable btn-primary flex-shrink-0 rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save
                </button>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
                <span>{hasOpenCodeKey ? 'A key is stored on this device.' : 'No key stored.'}</span>
                {hasOpenCodeKey ? (
                  <>
                    <button
                      type="button"
                      onClick={onTestOpencodeKey}
                      disabled={opencodeTesting}
                      className="hover:text-neutral-300"
                    >
                      {opencodeTesting ? 'Testing…' : 'Test'}
                    </button>
                    <button
                      type="button"
                      onClick={onClearOpencodeKey}
                      className="hover:text-red-400"
                    >
                      Disconnect
                    </button>
                  </>
                ) : null}
              </div>
              {opencodeFeedback ? <p className="mt-2 text-xs text-neutral-400">{opencodeFeedback}</p> : null}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium text-neutral-300">Model</label>
                <button
                  type="button"
                  onClick={onRefreshModels}
                  className="text-xs text-neutral-500 hover:text-neutral-300"
                >
                  Refresh
                </button>
              </div>
              <CustomSelect
                options={models.map((model) => ({ value: model.id, label: model.label }))}
                value={opencodeChatModel}
                onChange={onOpencodeChatModelChange}
              />
              {activeModel ? (
                <p className="mt-2 text-xs text-neutral-500">
                  {Math.round(activeModel.maxContextTokens / 1000)}K context
                  {activeModel.supportsVision ? ' · vision' : ''}
                  {activeModel.supportsTools ? ' · tools' : ''}
                </p>
              ) : null}
            </div>
          </div>
        </SectionCard>
      ) : (
        <SectionCard
          title="OpenAI"
          description="The OpenAI key is configured in General. It is also required for microphone and meeting transcription."
        >
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">Model</label>
            <CustomSelect
              options={getModelOptionsForProvider('openai').map((model) => ({
                value: model.id,
                label: model.label
              }))}
              value={chatModel}
              onChange={onChatModelChange}
            />
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Reasoning"
        description="Controls how much compute the model spends reasoning. Unsupported models ignore this setting."
      >
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
      </SectionCard>

      <SectionCard
        title="Web search"
        description="OpenAI is the default. You can point Covenant at a self-hosted SearXNG instance or use a free-tier provider."
      >
        <div className="space-y-4">
          <MinimalistToggle
            checked={enableWebSearch}
            onChange={onWebSearchChange}
            label="Web search"
            description={
              supportsWebSearch
                ? 'Allow the model to search the web for current information.'
                : 'This model does not support tools or web search.'
            }
            disabled={!supportsWebSearch}
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">Provider</label>
            <CustomSelect
              options={WEB_SEARCH_PROVIDERS.map((provider) => ({
                value: provider.id,
                label: provider.label
              }))}
              value={webSearchProvider}
              onChange={(value) => onWebSearchProviderChange(value as WebSearchProviderId)}
            />
          </div>

          {isSearxng ? (
            <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                  SearXNG endpoint
                </label>
                <input
                  type="text"
                  value={webSearchSearxngUrl}
                  onChange={(event) => onWebSearchSearxngUrlChange(event.target.value)}
                  placeholder="http://192.168.1.50:8080"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                  autoComplete="off"
                />
                <p className="mt-2 text-xs text-neutral-500">
                  Covenant calls <code>/search?q=...&amp;format=json</code>. Enable JSON in SearXNG's
                  settings.yml. Setup guide: <code>docs/searxng-raspberry-pi.md</code>.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                  Authentication
                </label>
                <CustomSelect
                  options={[
                    { value: 'none', label: 'None (LAN)' },
                    { value: 'basic', label: 'Basic auth' },
                    { value: 'bearer', label: 'Bearer token' }
                  ]}
                  value={webSearchSearxngAuthType}
                  onChange={(value) =>
                    onWebSearchSearxngAuthTypeChange(value as 'none' | 'basic' | 'bearer')
                  }
                />
              </div>

              {webSearchSearxngAuthType === 'basic' ? (
                <input
                  type="text"
                  value={webSearchSearxngUsername}
                  onChange={(event) => onWebSearchSearxngUsernameChange(event.target.value)}
                  placeholder="Username"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                  autoComplete="off"
                />
              ) : null}

              {webSearchSearxngAuthType !== 'none' ? (
                <input
                  type="password"
                  value={webSearchSearxngSecret}
                  onChange={(event) => onWebSearchSearxngSecretChange(event.target.value)}
                  placeholder={webSearchSearxngAuthType === 'basic' ? 'Password' : 'Bearer token'}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                  autoComplete="off"
                />
              ) : null}

              <MinimalistToggle
                checked={webSearchSearxngAllowInsecure}
                onChange={onWebSearchSearxngAllowInsecureChange}
                label="Allow self-signed certificate"
                description="Only enable for a SearXNG instance you control."
              />
              <MinimalistToggle
                checked={webSearchBypassProxyForLocal}
                onChange={onWebSearchBypassProxyForLocalChange}
                label="Bypass proxy for local addresses"
                description="Keeps LAN requests to the Pi direct when a global proxy is configured."
              />
            </div>
          ) : null}

          {searchNeedsKey ? (
            <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
              <label className="block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                {webSearchProvider === 'tavily' ? 'Tavily' : 'Exa'} API key
              </label>
              <input
                type="password"
                value={webSearchSearxngSecret}
                onChange={(event) => onWebSearchSearxngSecretChange(event.target.value)}
                placeholder="Paste your API key"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={onSaveSearchSecret}
                className="pressable rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
              >
                Save key
              </button>
            </div>
          ) : null}

          {webSearchProvider === 'openai' ? (
            <p className="text-xs text-neutral-500">
              OpenAI web search uses the OpenAI key from General. No extra setup.
            </p>
          ) : null}
          {webSearchProvider === 'native' ? (
            <p className="text-xs text-neutral-500">
              Native search is used only when the selected OpenCode model supports it.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onTestWebSearch}
              disabled={webSearchTesting}
              className="pressable rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500 disabled:opacity-50"
            >
              {webSearchTesting ? 'Testing…' : 'Test search'}
            </button>
            {webSearchFeedback ? (
              <span className="text-xs text-neutral-400">{webSearchFeedback}</span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Fallback provider
              </label>
              <CustomSelect
                options={[
                  { value: 'none', label: 'None' },
                  ...WEB_SEARCH_PROVIDERS.filter((provider) => provider.id !== 'native').map(
                    (provider) => ({ value: provider.id, label: provider.label })
                  )
                ]}
                value={webSearchFallbackProvider}
                onChange={onWebSearchFallbackProviderChange}
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Timeout (ms)
              </label>
              <input
                type="number"
                min={3000}
                max={120000}
                step={1000}
                value={webSearchTimeoutMs}
                onChange={(event) => onWebSearchTimeoutMsChange(Number(event.target.value))}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 focus:border-neutral-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
