import type { ChatConversation } from '../../../shared/chat/chat'
import {
  DEFAULT_CONVERSATION_TITLE,
  formatConversationRowTimestamp
} from '../app/utils/chat'
import { TrashIcon } from '../ui/icons'

interface ConversationRowProps {
  conversation: ChatConversation
  active: boolean
  onSelect: (conversation: ChatConversation) => void
  onDelete: (conversation: ChatConversation) => void
  /**
   * Single-line row used by the wide-chat history rail. The day header already
   * carries the date, so repeating the timestamp and message count there would
   * only add noise.
   */
  compact?: boolean
}

const ROW =
  'group relative flex w-full items-center rounded-lg transition-colors duration-150'

/**
 * One conversation entry, shared by the history popover and the wide-chat
 * history rail so the active state, badges and delete affordance cannot drift
 * between the two.
 */
export default function ConversationRow({
  conversation,
  active,
  onSelect,
  onDelete,
  compact = false
}: ConversationRowProps): JSX.Element {
  const title = conversation.title?.trim() || DEFAULT_CONVERSATION_TITLE
  const messageCount = conversation.messages.length

  return (
    <div
      className={`${ROW} ${
        active ? 'bg-white/10 text-neutral-100' : 'text-neutral-300 hover:bg-white/5'
      }`}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[color:var(--chat-accent)]"
        />
      ) : null}
      <button
        type="button"
        onClick={() => onSelect(conversation)}
        title={title}
        aria-current={active ? 'true' : undefined}
        className={`pressable-soft flex min-w-0 flex-1 flex-col rounded-lg pl-3 pr-10 text-left ${
          compact ? 'gap-0 py-1.5' : 'gap-0.5 py-1.5'
        }`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{title}</span>
          {conversation.terminalSessionId ? (
            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
              term
            </span>
          ) : null}
          {conversation.systemPrompt ? (
            <span className="shrink-0 rounded-full border border-[color:var(--chat-accent-strong)] bg-[color:var(--chat-accent-soft)] px-1.5 py-px text-[9px] font-semibold text-[color:var(--chat-accent)]">
              @
            </span>
          ) : null}
        </span>
        {compact ? null : (
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-neutral-500">
            <span className="tabular-nums">
              {formatConversationRowTimestamp(conversation.updatedAt)}
            </span>
            <span aria-hidden>·</span>
            <span className="truncate">
              {messageCount} {messageCount === 1 ? 'message' : 'messages'}
            </span>
          </span>
        )}
      </button>
      <div className={`absolute top-1/2 -translate-y-1/2 ${compact ? 'right-1' : 'right-1.5'}`}>
        <button
          type="button"
          onClick={() => onDelete(conversation)}
          className="pressable pointer-events-none flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 opacity-0 transition-opacity duration-150 hover:bg-red-500/20 hover:text-red-300 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
          aria-label={`Delete ${title}`}
          title="Delete conversation"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}
