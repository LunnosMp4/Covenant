import { useState } from 'react'
import type {
  AiModelOption,
  ChatProviderId,
  WebSearchProviderId
} from '../../../../shared/config'
import {
  WEB_SEARCH_PROVIDERS,
  resolveWebSearchProviderChoice,
  webSearchProviderLabel
} from '../../../../shared/config'
import CustomSelect from '../../ui/CustomSelect'
import SecretField from '../SecretField'
import { MinimalistToggle, SectionCard } from '../primitives'
import type { SecretFieldResult } from '../SecretField'

interface WebSearchTabProps {
  enableWebSearch: boolean
  onWebSearchChange: (enabled: boolean) => void
  chatProvider: ChatProviderId
  activeModelOption?: AiModelOption
  hasOpenAIKey: boolean
  webSearchProvider: WebSearchProviderId
  onWebSearchProviderChange: (provider: WebSearchProviderId) => void
  webSearchSearxngUrl: string
  onWebSearchSearxngUrlChange: (value: string) => void
  webSearchSearxngAuthType: 'none' | 'basic' | 'bearer'
  onWebSearchSearxngAuthTypeChange: (value: 'none' | 'basic' | 'bearer') => void
  webSearchSearxngUsername: string
  onWebSearchSearxngUsernameChange: (value: string) => void
  webSearchSearxngAllowInsecure: boolean
  onWebSearchSearxngAllowInsecureChange: (value: boolean) => void
  webSearchBypassProxyForLocal: boolean
  onWebSearchBypassProxyForLocalChange: (value: boolean) => void
  webSearchFallbackProvider: string
  onWebSearchFallbackProviderChange: (value: string) => void
  webSearchTimeoutMs: number
  onWebSearchTimeoutMsChange: (value: number) => void
  hasSearchSecrets: { searxng: boolean; tavily: boolean; exa: boolean }
  onSaveSearchSecret: (provider: 'searxng' | 'tavily' | 'exa', value: string) => Promise<SecretFieldResult>
  onClearSearchSecret: (provider: 'searxng' | 'tavily' | 'exa') => Promise<void>
  onTestWebSearch: (provider?: WebSearchProviderId) => Promise<{ ok: boolean; message: string }>
  onNavigateToProviders: () => void
  isConfigLoaded: boolean
}

export default function WebSearchTab({
  enableWebSearch,
  onWebSearchChange,
  chatProvider,
  activeModelOption,
  hasOpenAIKey,
  webSearchProvider,
  onWebSearchProviderChange,
  webSearchSearxngUrl,
  onWebSearchSearxngUrlChange,
  webSearchSearxngAuthType,
  onWebSearchSearxngAuthTypeChange,
  webSearchSearxngUsername,
  onWebSearchSearxngUsernameChange,
  webSearchSearxngAllowInsecure,
  onWebSearchSearxngAllowInsecureChange,
  webSearchBypassProxyForLocal,
  onWebSearchBypassProxyForLocalChange,
  webSearchFallbackProvider,
  onWebSearchFallbackProviderChange,
  webSearchTimeoutMs,
  onWebSearchTimeoutMsChange,
  hasSearchSecrets,
  onSaveSearchSecret,
  onClearSearchSecret,
  onTestWebSearch,
  onNavigateToProviders,
  isConfigLoaded
}: WebSearchTabProps): JSX.Element {
  const [testing, setTesting] = useState(false)
  const [testFeedback, setTestFeedback] = useState('')

  const handleTestSearch = async (): Promise<void> => {
    if (testing) return
    setTesting(true)
    setTestFeedback('')
    try {
      const result = await onTestWebSearch(
        webSearchProvider === 'auto' ? undefined : webSearchProvider
      )
      setTestFeedback(result.message)
    } catch (error) {
      setTestFeedback(error instanceof Error ? error.message : 'Search failed.')
    } finally {
      setTesting(false)
    }
  }

  const resolvedProvider = resolveWebSearchProviderChoice({
    provider: webSearchProvider,
    chatProvider,
    searxngUrl: webSearchSearxngUrl,
    modelOption: activeModelOption,
    hasOpenAIKey
  })

  const nativeSupported =
    chatProvider === 'opencode' && activeModelOption?.webSearch === 'native'
  const isSearxng =
    webSearchProvider === 'searxng' ||
    (webSearchProvider === 'auto' && Boolean(webSearchSearxngUrl.trim()))
  const isTavily = webSearchProvider === 'tavily'
  const isExa = webSearchProvider === 'exa'

  const saveSecret = (
    provider: 'searxng' | 'tavily' | 'exa',
    value: string
  ): Promise<SecretFieldResult> => onSaveSearchSecret(provider, value)

  return (
    <div className="space-y-6">
      <SectionCard
        title="Web search"
        description="Search runs independently from the chat provider. Auto prefers a configured SearXNG endpoint, then OpenCode native search, then OpenAI."
      >
        <div className="space-y-4">
          <MinimalistToggle
            checked={enableWebSearch}
            onChange={onWebSearchChange}
            label="Enable web search"
            description="Allow the model to search the web for current information."
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">Provider</label>
            <CustomSelect
              options={WEB_SEARCH_PROVIDERS.map((provider) => ({
                value: provider.id,
                label:
                  provider.id === 'native' && !nativeSupported
                    ? 'OpenCode native search (unavailable for this model)'
                    : provider.label
              }))}
              value={webSearchProvider}
              onChange={(value) => onWebSearchProviderChange(value as WebSearchProviderId)}
            />
            <p className="mt-2 text-xs text-neutral-500">
              {webSearchProvider === 'auto'
                ? `Auto currently resolves to ${webSearchProviderLabel(resolvedProvider)}.`
                : `Currently using ${webSearchProviderLabel(resolvedProvider)}.`}
            </p>
            {webSearchProvider === 'native' && !nativeSupported ? (
              <p className="mt-2 text-xs text-amber-300">
                The selected model does not support native search. Choose SearXNG, Tavily, Exa, or OpenAI.
              </p>
            ) : null}
          </div>

          {isSearxng ? (
            <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
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
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                    Username
                  </label>
                  <input
                    type="text"
                    value={webSearchSearxngUsername}
                    onChange={(event) => onWebSearchSearxngUsernameChange(event.target.value)}
                    placeholder="Username"
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                    autoComplete="off"
                  />
                </div>
              ) : null}

              {webSearchSearxngAuthType !== 'none' ? (
                <SecretField
                  label={webSearchSearxngAuthType === 'basic' ? 'Password' : 'Bearer token'}
                  hasSavedValue={hasSearchSecrets.searxng}
                  placeholder={webSearchSearxngAuthType === 'basic' ? 'Password' : 'Bearer token'}
                  disabled={!isConfigLoaded}
                  onSave={(value) => saveSecret('searxng', value)}
                  onClear={() => onClearSearchSecret('searxng')}
                  onTest={async () => {
                    const result = await onTestWebSearch('searxng')
                    return { ok: result.ok, error: result.ok ? undefined : result.message }
                  }}
                  saveLabel="Save credential"
                  clearLabel="Remove credential"
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

          {isTavily || isExa ? (
            <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
              <SecretField
                label={`${isTavily ? 'Tavily' : 'Exa'} API key`}
                hasSavedValue={hasSearchSecrets[isTavily ? 'tavily' : 'exa']}
                placeholder="Paste your API key"
                disabled={!isConfigLoaded}
                onSave={(value) => saveSecret(isTavily ? 'tavily' : 'exa', value)}
                onClear={() => onClearSearchSecret(isTavily ? 'tavily' : 'exa')}
                onTest={async () => {
                  const result = await onTestWebSearch(isTavily ? 'tavily' : 'exa')
                  return { ok: result.ok, error: result.ok ? undefined : result.message }
                }}
                saveLabel="Save key"
                clearLabel="Remove key"
              />
            </div>
          ) : null}

          {resolvedProvider === 'openai' ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
              <p className="text-xs text-neutral-400">
                OpenAI web search uses your OpenAI API key.
              </p>
              {!hasOpenAIKey ? (
                <button
                  type="button"
                  onClick={onNavigateToProviders}
                  className="mt-2 text-xs font-medium text-amber-300 hover:text-amber-200"
                >
                  Add an OpenAI key in Providers & Keys
                </button>
              ) : null}
            </div>
          ) : null}

          {resolvedProvider === 'native' ? (
            <p className="text-xs text-neutral-500">
              Native search is handled by the selected OpenCode model and does not use an extra search key.
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Fallback provider
              </label>
              <CustomSelect
                options={[
                  { value: 'none', label: 'None' },
                  ...WEB_SEARCH_PROVIDERS.filter(
                    (provider) => provider.id !== 'native' && provider.id !== 'auto'
                  ).map((provider) => ({ value: provider.id, label: provider.label }))
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

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleTestSearch()}
              disabled={testing}
              className="pressable rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? 'Testing…' : 'Test search'}
            </button>
            {testFeedback ? (
              <span className="text-xs text-neutral-400">{testFeedback}</span>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
