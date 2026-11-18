import { useMemo, type RefObject } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ChatConversation } from '../../../shared/chat/chat'
import { groupConversationsByRecency } from '../app/utils/chat'
import { SPRING_POPOVER } from '../constants/motion'
import ConversationRow from './ConversationRow'

interface ConversationHistoryMenuProps {
  open: boolean
  conversations: ChatConversation[]
  activeConversationId: string | null
  panelRef: RefObject<HTMLDivElement>
  onSelect: (conversation: ChatConversation) => void
  onDelete: (conversation: ChatConversation) => void
}

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
                  {group.conversations.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      active={conversation.id === activeConversationId}
                      onSelect={onSelect}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
