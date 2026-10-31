import { useMemo, type RefObject } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ChatConversation } from '../../../shared/chat/chat'
import {
  DEFAULT_CONVERSATION_TITLE,
  formatConversationRowTimestamp,
  groupConversationsByRecency
} from '../app/utils/chat'
import { SPRING_POPOVER } from '../constants/motion'
import { TrashIcon } from '../ui/icons'

interface ConversationHistoryMenuProps {
  open: boolean
  conversations: ChatConversation[]
  activeConversationId: string | null
  panelRef: RefObject<HTMLDivElement>
  onSelect: (conversation: ChatConversation) => void
  onDelete: (conversation: ChatConversation) => void
}

const ROW =
  'group relative flex w-full items-center rounded-lg transition-colors duration-150'

/**
 * Anchored history popover for the chat surface.
 *
 * Grouped by recency (Apple's "Today / Yesterday / Previous…" rhythm) so the
 * list stays scannable as it grows. The surface is a translucent material:
 * content underneath keeps hinting at the conversation, which anchors the
 * popover to what it belongs to instead of feeling like a detached modal.
 */
export default function ConversationHistoryMenu({
  open,
  conversations,
  activeConversationId,
  panelRef,
  onSelect,
  onDelete
}: ConversationHistoryMenuProps): JSX.Element {
  const groups = useMemo(
    () => (open ? groupConversationsByRecency(conversations) : []),
    [open, conversations]
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="history-menu"
          ref={panelRef}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98, pointerEvents: 'none' }}
          transition={SPRING_POPOVER}
          style={{ transformOrigin: 'top right' }}
          className="surface-shadow absolute right-0 top-10 z-20 w-[320px] overflow-hidden rounded-xl border border-white/10 bg-neutral-950/85 backdrop-blur-xl"
          data-interactive-surface
          aria-label="Conversation history"
        >
          <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              History
            </span>
            {conversations.length > 0 ? (
              <span className="text-[10px] font-medium tabular-nums text-neutral-600">
                {conversations.length}
              </span>
            ) : null}
          </div>

          {groups.length === 0 ? (
            <div className="px-4 pb-5 pt-3 text-center">
              <p className="text-[12px] font-medium text-neutral-300">No conversations yet</p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                Your chats will appear here.
              </p>
            </div>
          ) : (
            <div className="chat-scrollbar max-h-[min(360px,50vh)] overflow-y-auto px-1 pb-1">
              {groups.map((group) => (
                <div key={group.label} className="pb-1">
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    {group.label}
                  </p>
                  {group.conversations.map((conversation) => {
                    const isActive = conversation.id === activeConversationId
                    const title = conversation.title?.trim() || DEFAULT_CONVERSATION_TITLE
                    const messageCount = conversation.messages.length
                    const timestamp = formatConversationRowTimestamp(conversation.updatedAt)

                    return (
                      <div
                        key={conversation.id}
                        className={`${ROW} ${
                          isActive ? 'bg-white/10 text-neutral-100' : 'text-neutral-300 hover:bg-white/5'
                        }`}
                      >
                        {isActive ? (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[color:var(--chat-accent)]"
                          />
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onSelect(conversation)}
                          title={title}
                          aria-current={isActive ? 'true' : undefined}
                          className="pressable-soft flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg py-1.5 pl-3 pr-10 text-left"
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
                          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-neutral-500">
                            <span className="tabular-nums">{timestamp}</span>
                            <span aria-hidden>·</span>
                            <span className="truncate">
                              {messageCount} {messageCount === 1 ? 'message' : 'messages'}
                            </span>
                          </span>
                        </button>
                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
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
                  })}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
