import { useEffect, useState } from 'react'
import type { ChatProviderId } from '../../../../shared/config'
import OpenAIUsagePanel from '../usage/OpenAIUsagePanel'
import OpenCodeUsagePanel from '../usage/OpenCodeUsagePanel'
import type { SecretFieldResult } from '../SecretField'

interface UsageTabProps {
  hasAdminKey: boolean
  onSaveAdminKey: (key: string) => Promise<SecretFieldResult>
  onClearAdminKey: () => Promise<void>
  isConfigLoaded: boolean
  refreshSignal: number
  projectId: string
  onProjectChange: (projectId: string) => void
  chatProvider: ChatProviderId
  hasOpenCodeKey: boolean
  onNavigateToProviders: () => void
}

export default function UsageTab({
  hasAdminKey,
  onSaveAdminKey,
  onClearAdminKey,
  isConfigLoaded,
  refreshSignal,
  projectId,
  onProjectChange,
  chatProvider,
  hasOpenCodeKey,
  onNavigateToProviders
}: UsageTabProps): JSX.Element {
  const [usageProvider, setUsageProvider] = useState<ChatProviderId>(chatProvider)

  useEffect(() => {
    setUsageProvider(chatProvider)
  }, [chatProvider])

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-xl border border-neutral-800 bg-neutral-900/70 p-1">
        {(['openai', 'opencode'] as ChatProviderId[]).map((provider) => {
          const isActive = usageProvider === provider
          return (
            <button
              key={provider}
              type="button"
              onClick={() => setUsageProvider(provider)}
              className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {provider === 'openai' ? 'OpenAI' : 'OpenCode'}
            </button>
          )
        })}
      </div>

      {usageProvider === 'openai' ? (
        <OpenAIUsagePanel
          hasAdminKey={hasAdminKey}
          onSaveAdminKey={onSaveAdminKey}
          onClearAdminKey={onClearAdminKey}
          refreshSignal={refreshSignal}
          projectId={projectId}
          onProjectChange={onProjectChange}
          isConfigLoaded={isConfigLoaded}
        />
      ) : (
        <OpenCodeUsagePanel
          hasOpenCodeKey={hasOpenCodeKey}
          onNavigateToProviders={onNavigateToProviders}
        />
      )}
    </div>
  )
}
