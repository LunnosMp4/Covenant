import { lazy, memo, Suspense, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ChatMessage } from '../../../shared/chat/chat'
import { collectExcalidrawCheckpoints } from '../../../shared/chat/excalidraw'
import { describeUiSpec } from '../../../shared/ui/describe'
import { formatSourceUrl, formatUsageSummary } from '../utils/chat/chatUsage'
import { AssistantMarkdown, CopyButton, ToolStepRow, WebSearchStepRow } from './AssistantMarkdown'
import ExcalidrawEmbed from './ExcalidrawEmbed'
import { Favicon } from './Favicon'
import MeasuredCollapse from '../ui/MeasuredCollapse'

const SurfaceRenderer = lazy(() => import('../ui/surface/SurfaceRenderer'))

interface ChatTranscriptProps {
  messages: ChatMessage[]
  isLoading: boolean
  activeStreamMessageId: string | null
  thinkingOpenById: Record<string, boolean>
  onToggleThinking: (messageId: string) => void
  sourcesPanelMessageId: string | null
  onToggleSources: (messageId: string) => void
  /** Sends a prompt proposed by a visual surface. */
  onSurfaceAction?: (prompt: string) => void
  emptyLabel?: string
  /** Terminal rail uses full-width bubbles (Code-style), not chat-style. */
  fullWidthBubbles?: boolean
  /**
   * Wide chat layout: assistant rows span the readable column while user rows
   * stay right-aligned at a narrower measure. Keeps the roomy layout from
   * simply stretching every bubble.
   */
  wide?: boolean
}

interface ChatMessageRowProps {
  message: ChatMessage
  isStreaming: boolean
  isThinkingOpen: boolean
  showSources: boolean
  onToggleThinking: (messageId: string) => void
  onToggleSources: (messageId: string) => void
  onSurfaceAction: (prompt: string) => void
  fullWidthBubbles: boolean
  wide: boolean
  isLatest: boolean
}

/**
 * One transcript row.
 *
 * Memoised on purpose: while a message streams, only that message object is
 * replaced, so every other row keeps its identity and skips re-rendering (and,
 * crucially, skips re-parsing its markdown).
 */
function ChatMessageRow({
  message,
  isStreaming,
  isThinkingOpen,
  showSources,
  onToggleThinking,
  onToggleSources,
  onSurfaceAction,
  fullWidthBubbles,
  wide,
  isLatest
}: ChatMessageRowProps): JSX.Element {
  const isAssistant = message.role === 'assistant'
  const isUser = message.role === 'user'
  const reasoningText = message.reasoning?.trim() ?? ''
  const reasoningSteps = message.steps ?? []
  const hasSteps = reasoningSteps.length > 0
  const hasReasoningContent =
    reasoningText.length > 0 ||
    hasSteps ||
    (message.reasoningTitle != null && message.reasoningTitle.trim().length > 0)
  const showThinking =
    isAssistant &&
    (hasReasoningContent || (isStreaming && isThinkingOpen))
  const modelLabel = message.model?.trim()
  const usageLabel = formatUsageSummary(message)
  const metaLabel = [message.stopped ? 'Stopped' : null, modelLabel, usageLabel]
    .filter(Boolean)
    .join(` \u00b7 `)
  const rowJustify = isUser && !fullWidthBubbles ? 'justify-end' : 'justify-start'
  // A bubble carrying a visual takes the full column (capped like any bubble), so
  // the chart has a stable width that follows the transcript. A shrink-to-fit
  // bubble would otherwise be sized by the chart's own canvas and freeze.
  const hasParts = (message.parts?.length ?? 0) > 0
  const bubbleWidth = fullWidthBubbles
    ? 'w-full'
    : wide
      ? isAssistant
        ? 'w-full'
        : 'max-w-[78%]'
      : hasParts
        ? 'w-full max-w-[78%]'
        : 'max-w-[78%]'
  // The copy payload walks every generated surface spec, which is wasted work
  // while the answer is still streaming (the button is hidden then) and on
  // every unrelated re-render (thinking/sources toggles). Memoised and skipped
  // for the streaming row; the resulting text is unchanged.
  const copyText = useMemo(() => {
    if (!isAssistant || isStreaming) return ''
    return [
      message.content,
      ...(message.parts ?? []).map((part) => describeUiSpec(part.surface.spec))
    ]
      .filter((entry) => entry.trim().length > 0)
      .join('\n\n')
  }, [isAssistant, isStreaming, message.content, message.parts])
  const canCopy = isAssistant && !isStreaming && copyText.trim().length > 0
  // The assistant bubble is created before the first stream event arrives.
  // Show a typing indicator in that window instead of an empty pill; it fades
  // out as soon as the answer or the reasoning block starts filling in.
  const showTypingDots =
    isAssistant &&
    isStreaming &&
    !showThinking &&
    message.content.trim().length === 0 &&
    !hasParts &&
    (message.sources?.length ?? 0) === 0

  return (
    <div
      data-message-id={message.id}
      className={`flex ${rowJustify} ${isLatest ? 'chat-message-enter' : ''}`}
    >
      <div
        className={`chat-message ${bubbleWidth} rounded-2xl border px-3 py-2 text-[13px] leading-relaxed select-text ${
          isUser ? 'chat-message--user whitespace-pre-wrap' : 'chat-message--assistant'
        }`}
      >
        {showThinking && (
          <div className="chat-thinking">
            <button
              type="button"
              className="chat-thinking-toggle"
              onClick={() => onToggleThinking(message.id)}
            >
              <span
                className={
                  isStreaming
                    ? 'chat-thinking-title chat-thinking-title--streaming'
                    : 'chat-thinking-title'
                }
              >
                {message.reasoningTitle?.trim() ? message.reasoningTitle.trim() : 'Reasoning\u2026'}
              </span>
              <span
                className={`chat-thinking-chevron${isThinkingOpen ? ' chat-thinking-chevron--open' : ''}`}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
            </button>

            {isThinkingOpen && (
              <div className="chat-thinking-body">
                {hasSteps ? (
                  reasoningSteps.map((step, stepIndex) => {
                    if (step.type === 'reasoning') {
                      const isLastStep = stepIndex === reasoningSteps.length - 1
                      return (
                        <p
                          key={`reasoning-${stepIndex}`}
                          className="chat-thinking-text whitespace-pre-wrap"
                        >
                          {step.text}
                          {isStreaming && isLastStep ? (
                            <span className="chat-thinking-cursor">|</span>
                          ) : null}
                        </p>
                      )
                    }
                    if (step.type === 'tool') {
                      return <ToolStepRow key={step.id} step={step} />
                    }
                    return <WebSearchStepRow key={step.id} step={step} />
                  })
                ) : reasoningText ? (
                  <p className="chat-thinking-text whitespace-pre-wrap">
                    {reasoningText}
                    {isStreaming ? <span className="chat-thinking-cursor">|</span> : null}
                  </p>
                ) : (
                  <p className="chat-thinking-empty">Reasoning not available.</p>
                )}
              </div>
            )}
          </div>
        )}

        {isAssistant ? (
          <>
            <AnimatePresence initial={false}>
              {showTypingDots ? (
                <motion.span
                  key="typing-dots"
                  className="chat-typing"
                  role="status"
                  aria-label="Assistant is typing"
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                  transition={{ duration: 0.14 }}
                >
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                </motion.span>
              ) : null}
            </AnimatePresence>
            {message.parts && message.parts.length > 0 ? (
              <div className="chat-message-surfaces">
                <Suspense
                  fallback={<div className="surface-skeleton" aria-hidden />}
                >
                  {message.parts.map((part) => (
                    <SurfaceRenderer
                      key={part.id}
                      surface={part.surface}
                      interactive={isLatest && !isStreaming}
                      onAction={onSurfaceAction}
                    />
                  ))}
                </Suspense>
              </div>
            ) : null}
            {message.sources && message.sources.length > 0 ? (
              <div className="chat-sources-wrapper">
                <button
                  type="button"
                  className="pressable chat-sources-toggle"
                  onClick={() => onToggleSources(message.id)}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <span>Sources</span>
                  <span className="chat-sources-count">{message.sources.length}</span>
                </button>

                <MeasuredCollapse open={showSources}>
                  <div className="pt-1.5">
                    <div className="chat-sources-panel">
                      <div className="chat-sources-panel-header">
                        <span className="font-medium">Sources</span>
                        <button
                          type="button"
                          className="pressable chat-sources-panel-close"
                          onClick={() => onToggleSources(message.id)}
                          aria-label="Close sources"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="chat-sources-panel-list">
                        {message.sources.map((source, idx) => (
                          <a
                            key={`${source.url}-${idx}`}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="pressable-soft chat-source-item"
                          >
                            <Favicon url={source.url} className="chat-source-favicon" />
                            <div className="chat-source-text">
                              <span className="chat-source-title">
                                {source.title || formatSourceUrl(source.url)}
                              </span>
                              <span className="chat-source-url">{formatSourceUrl(source.url)}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                </MeasuredCollapse>
              </div>
            ) : null}
            <AssistantMarkdown content={message.content} />
            {collectExcalidrawCheckpoints(reasoningSteps).map((checkpoint) => (
              <ExcalidrawEmbed
                key={`${message.id}-${checkpoint.checkpointId}`}
                checkpointId={checkpoint.checkpointId}
                serverId={checkpoint.serverId}
              />
            ))}
          </>
        ) : (
          <>
            {message.content}
            {message.images && message.images.length > 0 && (
              <div className="chat-message-meta flex items-center gap-1 mt-0.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>{message.images.length} image{message.images.length !== 1 ? 's' : ''}</span>
              </div>
            )}
          </>
        )}

        {isAssistant && (metaLabel || canCopy) ? (
          <div className="chat-message-meta flex items-center gap-2">
            {metaLabel ? <span>{metaLabel}</span> : null}
            {/* Only offer copy once the stream has finished and there is text. */}
            {canCopy ? (
              <CopyButton
                text={copyText}
                className="pressable flex items-center justify-center h-6 w-6 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-white/10"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

const MemoChatMessageRow = memo(ChatMessageRow)

/**
 * The single message renderer used by both the main conversation surface and
 * the terminal's linked conversation rail. Keeping it shared is what makes the
 * two views visually identical (bubbles, reasoning, tools, model/usage footer).
 *
 * Memoised so unrelated App state (typing in the input, popups, toasts) does
 * not walk and re-render the whole transcript. Every prop is reference-stable
 * across those renders.
 */
function ChatTranscriptInner({
  messages,
  isLoading,
  activeStreamMessageId,
  thinkingOpenById,
  onToggleThinking,
  sourcesPanelMessageId,
  onToggleSources,
  onSurfaceAction,
  emptyLabel = 'No messages yet.',
  fullWidthBubbles = false,
  wide = false
}: ChatTranscriptProps): JSX.Element {
  if (messages.length === 0) {
    return <p className="text-xs text-neutral-500">{emptyLabel}</p>
  }

  const handleSurfaceAction = onSurfaceAction ?? (() => undefined)

  return (
    <>
      {messages.map((message, index) => {
        const isStreaming =
          message.role === 'assistant' && isLoading && activeStreamMessageId === message.id

        return (
          <MemoChatMessageRow
            key={message.id}
            message={message}
            isStreaming={isStreaming}
            isThinkingOpen={Boolean(thinkingOpenById[message.id])}
            showSources={sourcesPanelMessageId === message.id}
            onToggleThinking={onToggleThinking}
            onToggleSources={onToggleSources}
            onSurfaceAction={handleSurfaceAction}
            fullWidthBubbles={fullWidthBubbles}
            wide={wide}
            isLatest={index === messages.length - 1}
          />
        )
      })}
    </>
  )
}

const ChatTranscript = memo(ChatTranscriptInner)

export default ChatTranscript
