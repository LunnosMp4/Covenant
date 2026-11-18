import { memo, useMemo } from 'react'
import type { ChatConversation } from '../../../shared/chat/chat'
import { groupConversationsByDay } from '../app/utils/chat'
import { PlusIcon } from '../ui/icons'
import ConversationRow from './ConversationRow'

interface ChatHistorySidebarProps {
  conversations: ChatConversation[]
  activeConversationId: string | null
  onSelect: (conversation: ChatConversation) => void
  onDelete: (conversation: ChatConversation) => void
  onNewChat: () => void
  /** Disabled while a response streams: leaving the thread would drop it. */
  newChatDisabled: boolean
}

/**
 * Wide-chat history rail.
 *
 * Every calendar day gets its own section (date + hairline) instead of the
 * coarse recency buckets the popover uses, which makes long histories easy to
 * scan on the extra width. Props are kept primitive/stable so this memoized
 * component skips the App re-renders that happen on every keystroke and
 * streamed token.
 */
function ChatHistorySidebar({
  conversations,
  activeConversationId,
  onSelect,
  onDelete,
  onNewChat,
  newChatDisabled
}: ChatHistorySidebarProps): JSX.Element {
  const groups = useMemo(() => groupConversationsByDay(conversations), [conversations])

  return (
    <aside
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
      aria-label="Conversation history"
    >
      <div className="p-2">
        <button
          type="button"
          onClick={onNewChat}
          disabled={newChatDisabled}
          className="pressable flex w-full items-center gap-2 rounded-lg border border-white/10 px-2.5 py-2 text-[13px] font-medium text-neutral-200 hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          title={newChatDisabled ? 'Wait for the current answer to finish' : 'Start a new chat'}
        >
          <PlusIcon />
          <span>New chat</span>
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="px-3 pb-4 pt-1 text-center">
          <p className="text-[12px] font-medium text-neutral-300">No conversations yet</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">Your chats will appear here.</p>
        </div>
      ) : (
        <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-1 pb-2">
          {groups.map((group) => (
            <section key={group.key} className="pb-1">
              <div className="flex items-center gap-2 px-2 pb-1 pt-2.5">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  {group.label}
                </span>
                <span aria-hidden className="h-px flex-1 bg-white/10" />
              </div>
              {group.conversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === activeConversationId}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  compact
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </aside>
  )
}

export default memo(ChatHistorySidebar)
