import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { motion } from 'framer-motion'
import type { CodeFileDiff } from '../../../shared/code/code'
import { CHAT_SCROLL_HEIGHT } from '../app/constants'
import ContextStatsDonut from '../app/components/ContextStatsDonut'
import type { ContextStats } from '../utils/chat/chatUsage'
import CustomSelect from '../ui/CustomSelect'
import ExpandButton from '../ui/ExpandButton'
import { CodeIcon, PinIcon } from '../ui/icons'
import CodeConversation from './CodeConversation'
import CodeNavMenu from './CodeNavMenu'
import CodeProjectsSidebar from './CodeProjectsSidebar'
import CodeInfoSidebar from './CodeInfoSidebar'
import CodeChangesSidebar from './CodeChangesSidebar'
import { DiffIcon, PlusIcon, SessionIcon } from './icons'
import { useCodeSession } from './useCodeSession'

type CodeSessionApi = ReturnType<typeof useCodeSession>

interface CodePanelProps {
  session: CodeSessionApi
  isExpanded: boolean
  isWide: boolean
  isAltHeld: boolean
  isPinned: boolean
  viewportHeight: number
  onToggleExpand: (event: ReactMouseEvent<HTMLButtonElement>) => void
  onTogglePin: () => void
}

const ICON_BUTTON =
  'flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-neutral-400 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-neutral-200'
const ICON_BUTTON_ACTIVE = 'border-white/20 bg-white/10 text-neutral-100'

function statusLabel(status: CodeFileDiff['status']): string | null {
  if (!status) return null
  return status
}

export default function CodePanel({
  session,
  isExpanded,
  isWide,
  isAltHeld,
  isPinned,
  viewportHeight,
  onToggleExpand,
  onTogglePin
}: CodePanelProps): JSX.Element {
  const [changesOpen, setChangesOpen] = useState(false)
  const changesRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const bodyHeight = isExpanded ? Math.max(CHAT_SCROLL_HEIGHT, viewportHeight - 210) : CHAT_SCROLL_HEIGHT

  const hasKey = session.status?.hasApiKey === true

  const modelOptions = session.models.map((model) => ({
    value: `${model.providerID}/${model.id}`,
    label: model.label
  }))

  const primaryAgents = session.agents.filter(
    (agent) => !agent.hidden && (agent.mode === 'primary' || agent.mode === 'all')
  )
  const variantOptions = [
    ...session.activeVariants.map((variant) => ({ value: variant, label: variant }))
  ]

  const sessionModelRef = session.activeSession?.model
  const sessionModelId = sessionModelRef
    ? `${sessionModelRef.providerID}/${sessionModelRef.id}`
    : session.selectedModel
  const activeModel =
    session.models.find((model) => `${model.providerID}/${model.id}` === sessionModelId) ?? null
  const modelLabel = activeModel?.label ?? (sessionModelId || null)
  const transcriptCost = session.transcript.reduce((sum, item) => sum + (item.cost ?? 0), 0)
  const cost =
    session.liveCost ?? session.activeSession?.cost ?? (transcriptCost > 0 ? transcriptCost : null)
  const contextLimit = activeModel?.maxContextTokens ?? 0
  const codeStats: ContextStats | null = contextLimit
    ? {
        totalTokens: session.usage?.input ?? 0,
        maxTokens: contextLimit,
        totalCost: cost ?? 0,
        messageCount: session.transcript.length,
        totalInputTokens: session.usage?.input ?? 0,
        totalOutputTokens: session.usage?.output ?? 0
      }
    : null

  useEffect(() => {
    if (!changesOpen) return
    const handleClickOutside = (event: MouseEvent): void => {
      if (changesRef.current?.contains(event.target as Node)) return
      setChangesOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [changesOpen])

  useEffect(() => {
    if (!autoScroll) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [session.transcript, session.stream, autoScroll, session.activeSession])

  useEffect(() => {
    setAutoScroll(true)
  }, [session.activeSession?.id])

  const handleScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24
    setAutoScroll((previous) => (previous === atBottom ? previous : atBottom))
  }

  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-500">
      <CodeIcon />
      {!hasKey ? (
        <>
          <p className="text-sm">Add your OpenCode Go API key in Settings → Code.</p>
          <button
            type="button"
            onClick={() => window.api?.window.openSettings('code')}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100"
          >
            Open Settings
          </button>
        </>
      ) : session.projects.length === 0 ? (
        <>
          <p className="text-sm">Add a project folder to start coding.</p>
          <button
            type="button"
            onClick={() => void session.addProject()}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100"
          >
            <PlusIcon /> Add folder
          </button>
        </>
      ) : (
        <>
          <p className="text-sm">Create a session to start coding.</p>
          <button
            type="button"
            onClick={() => void session.createSession()}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100"
          >
            <PlusIcon /> New session
          </button>
        </>
      )}
    </div>
  )

  return (
    <>
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onTogglePin}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              isPinned
                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/25'
                : 'border-white/10 text-neutral-400 hover:border-white/20 hover:bg-white/10 hover:text-neutral-200'
            }`}
            aria-label={isPinned ? 'Unpin window' : 'Pin window'}
            aria-pressed={isPinned}
          >
            <PinIcon active={isPinned} />
          </button>

          {isWide ? (
            <div className="flex min-w-0 items-center gap-2 px-1">
              <span className="shrink-0 text-neutral-400">
                <SessionIcon />
              </span>
              <span className="truncate text-[13px] font-medium text-neutral-200">
                {session.activeSession?.title ?? 'Select a session'}
              </span>
              {session.activeProject && (
                <span className="truncate text-[11px] text-neutral-500">
                  · {session.activeProject.name}
                </span>
              )}
            </div>
          ) : (
            <CodeNavMenu
              projects={session.projects}
              activeProject={session.activeProject}
              onSelectProject={session.selectProject}
              onAddProject={() => void session.addProject()}
              sessions={session.sessions}
              activeSession={session.activeSession}
              loadingSessions={session.loadingSessions}
              onSelectSession={(item) => void session.selectSession(item)}
              onCreateSession={() => void session.createSession()}
              onDeleteSession={(item) => void session.deleteSession(item)}
            />
          )}

          {primaryAgents.length > 1 && (
            <div className="flex h-8 shrink-0 items-center rounded-lg border border-white/10 p-0.5">
              {primaryAgents.map((agent) => {
                const active = session.selectedAgent === agent.id
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => void session.changeAgent(agent.id)}
                    title={agent.description ?? agent.name}
                    className={`h-7 rounded-md px-2 text-[11px] font-medium capitalize transition-colors ${
                      active
                        ? 'bg-white/10 text-neutral-100'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                    aria-pressed={active}
                  >
                    {agent.name}
                  </button>
                )
              })}
            </div>
          )}

        </div>

        <div className="flex shrink-0 items-center gap-1">
          <CustomSelect
            compact
            className="w-[140px]"
            options={modelOptions}
            value={session.selectedModel}
            onChange={(value) => void session.changeModel(value)}
            disabled={modelOptions.length === 0}
          />

          {variantOptions.length > 0 && (
            <CustomSelect
              compact
              className="w-[104px]"
              options={[{ value: '', label: 'Default' }, ...variantOptions]}
              value={session.selectedVariant}
              onChange={session.changeVariant}
            />
          )}

          <ContextStatsDonut
            stats={codeStats}
            chatModel={sessionModelId}
            modelLabel={modelLabel ?? undefined}
          />

          <div ref={changesRef} className="relative">
            <button
              type="button"
              onClick={() => setChangesOpen((value) => !value)}
              className={`${ICON_BUTTON} ${changesOpen ? ICON_BUTTON_ACTIVE : ''} relative`}
              aria-label="Show file changes"
              aria-pressed={changesOpen}
            >
              <DiffIcon />
              {session.diffs.length > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-semibold leading-none text-[var(--chat-on-accent)]"
                  style={{ background: 'var(--chat-accent)' }}
                >
                  {session.diffs.length}
                </span>
              )}
            </button>

            {changesOpen && !isWide && (
              <div className="absolute right-0 top-10 z-30 w-80 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/95 shadow-xl shadow-black/50">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                    Changes
                  </span>
                  {session.diffs.length > 0 && (
                    <span className="text-[11px] tabular-nums text-neutral-400">
                      <span className="text-emerald-400">+{session.totals.additions}</span>{' '}
                      <span className="text-red-400">-{session.totals.deletions}</span>
                    </span>
                  )}
                </div>
                <div className="max-h-60 overflow-y-auto px-2 pb-2 chat-scrollbar">
                  {session.diffs.length === 0 && (
                    <p className="px-1 py-1 text-xs text-neutral-500">No file changes yet.</p>
                  )}
                  {session.diffs.map((diff) => (
                    <div
                      key={diff.file}
                      className="mb-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs"
                    >
                      <div className="truncate text-neutral-300" title={diff.file}>
                        {diff.file}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-500">
                        <span className="text-emerald-400">+{diff.additions}</span>
                        <span className="text-red-400">-{diff.deletions}</span>
                        {statusLabel(diff.status) && <span>{statusLabel(diff.status)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <ExpandButton expanded={isExpanded} wide={isWide} altHeld={isAltHeld} onClick={onToggleExpand} />
        </div>
      </div>

      {session.error && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
          <span className="min-w-0 flex-1 break-words">{session.error}</span>
          <button
            type="button"
            onClick={session.dismissError}
            className="shrink-0 text-red-300/70 transition-colors hover:text-red-200"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <motion.div
        initial={false}
        animate={{ height: bodyHeight }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        className="mt-3 overflow-hidden"
      >
        {isWide ? (
          <div className="flex h-full gap-3">
            <div className="h-full w-52 shrink-0 overflow-hidden border-r border-white/5 pr-2">
              <CodeProjectsSidebar
                projects={session.projects}
                activeProject={session.activeProject}
                onSelectProject={session.selectProject}
                onAddProject={() => void session.addProject()}
                sessions={session.sessions}
                activeSession={session.activeSession}
                loadingSessions={session.loadingSessions}
                onSelectSession={(item) => void session.selectSession(item)}
                onCreateSession={() => void session.createSession()}
                onDeleteSession={(item) => void session.deleteSession(item)}
              />
            </div>
            <div className="h-full min-h-0 min-w-0 flex-1">
              {session.activeSession ? (
                <CodeConversation
                  transcript={session.transcript}
                  stream={session.stream}
                  diffs={session.diffs}
                  forms={session.forms}
                  scrollRef={scrollRef}
                  onScroll={handleScroll}
                  onReplyForm={(form, answer) => void session.replyForm(form, answer)}
                  onCancelForm={(form, message) => void session.cancelForm(form, message)}
                />
              ) : (
                emptyState
              )}
            </div>
            <div className="h-full w-64 shrink-0 overflow-hidden border-l border-white/5 pl-3">
              {changesOpen ? (
                <CodeChangesSidebar diffs={session.diffs} totals={session.totals} />
              ) : (
                <CodeInfoSidebar
                  modelLabel={modelLabel}
                  variant={sessionModelRef?.variant ?? null}
                  agent={session.activeSession?.agent}
                  contextLimit={activeModel?.maxContextTokens}
                  usage={session.usage}
                  cost={cost}
                />
              )}
            </div>
          </div>
        ) : session.activeSession ? (
          <CodeConversation
            transcript={session.transcript}
            stream={session.stream}
            diffs={session.diffs}
            forms={session.forms}
            scrollRef={scrollRef}
            onScroll={handleScroll}
            onReplyForm={(form, answer) => void session.replyForm(form, answer)}
            onCancelForm={(form, message) => void session.cancelForm(form, message)}
          />
        ) : (
          emptyState
        )}
      </motion.div>
    </>
  )
}
