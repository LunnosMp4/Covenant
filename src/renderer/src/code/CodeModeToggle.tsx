import type { CodeAgent } from '../../../shared/code/code'

interface CodeModeToggleProps {
  agents: CodeAgent[]
  selectedAgent: string
  onSelect: (agentId: string) => void
}

function isPlan(agent: CodeAgent): boolean {
  return agent.id.toLowerCase().includes('plan')
}

/**
 * Always-visible Build/Plan switch for Covenant Code. Plan mode is tinted so
 * the active mode is obvious at a glance (and can also be toggled by shortcut).
 */
export default function CodeModeToggle({
  agents,
  selectedAgent,
  onSelect
}: CodeModeToggleProps): JSX.Element | null {
  if (agents.length < 2) return null

  return (
    <div className="flex h-8 shrink-0 items-center rounded-lg border border-white/10 p-0.5" role="group" aria-label="Code mode">
      {agents.map((agent) => {
        const active = selectedAgent === agent.id
        const plan = isPlan(agent)
        const activeClass = plan
          ? 'border border-dashed border-amber-400/50 bg-amber-500/15 text-amber-200'
          : 'bg-white/10 text-neutral-100'
        return (
          <button
            key={agent.id}
            type="button"
            onClick={() => onSelect(agent.id)}
            title={agent.description ?? `${agent.name} mode`}
            className={`h-7 rounded-md px-2.5 text-[11px] font-medium capitalize transition-colors ${
              active ? activeClass : 'text-neutral-400 hover:text-neutral-200'
            }`}
            aria-pressed={active}
          >
            {agent.name}
          </button>
        )
      })}
    </div>
  )
}
