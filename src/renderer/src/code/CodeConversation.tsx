import { useState, type RefObject } from 'react'
import type { CodeTranscriptItem, CodeTranscriptTool } from '../../../shared/code/code'
import { AssistantMarkdown, CopyButton } from '../chat/AssistantMarkdown'
import { SpinnerIcon, ToolIcon } from '../ui/icons'
import type { Note, StreamingState, ToolCard } from './types'

interface CodeConversationProps {
  transcript: CodeTranscriptItem[]
  stream: StreamingState
  scrollRef: RefObject<HTMLDivElement>
  onScroll: () => void
}

function Chevron({ open }: { open: boolean }): JSX.Element {
  return (
    <span className={`chat-thinking-chevron${open ? ' chat-thinking-chevron--open' : ''}`}>
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </span>
  )
}

function ReasoningBlock({
  text,
  streaming,
  defaultOpen
}: {
  text: string
  streaming?: boolean
  defaultOpen?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  return (
    <div className="chat-thinking">
      <button type="button" className="chat-thinking-toggle" onClick={() => setOpen((value) => !value)}>
        <span
          className={
            streaming ? 'chat-thinking-title chat-thinking-title--streaming' : 'chat-thinking-title'
          }
        >
          Reasoning…
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="chat-thinking-body">
          <p className="chat-thinking-text whitespace-pre-wrap">
            {text}
            {streaming ? <span className="chat-thinking-cursor">|</span> : null}
          </p>
        </div>
      )}
    </div>
  )
}

function ToolRow({ tool }: { tool: ToolCard }): JSX.Element {
  const hasDetails = Boolean(tool.output || tool.error)
  const [open, setOpen] = useState(false)
  const isError = tool.status === 'error'

  return (
    <div className="chat-thinking-tool">
      {tool.status === 'running' ? (
        <SpinnerIcon />
      ) : (
        <ToolIcon className={`chat-thinking-tool-icon${isError ? ' chat-thinking-tool-icon--error' : ''}`} />
      )}
      <div className="chat-thinking-tool-content">
        <button
          type="button"
          className="flex w-full items-center gap-1.5 text-left"
          onClick={() => hasDetails && setOpen((value) => !value)}
        >
          <span className="chat-thinking-tool-name">{tool.name || 'tool'}</span>
          <span className="text-[11px] text-[var(--chat-meta-text)] opacity-70">{tool.status}</span>
          {hasDetails && <Chevron open={open} />}
        </button>
        {open && tool.output && (
          <pre className="chat-thinking-tool-result whitespace-pre-wrap break-words">{tool.output}</pre>
        )}
        {open && tool.error && (
          <div className="chat-thinking-tool-result chat-thinking-tool-result--error">{tool.error}</div>
        )}
      </div>
    </div>
  )
}

function NoteRow({ note }: { note: Note }): JSX.Element {
  const color =
    note.tone === 'error'
      ? 'text-red-400'
      : 'text-[var(--chat-meta-text)]'
  const mono = note.tone === 'shell' || note.tone === 'file'
  return (
    <p className={`whitespace-pre-wrap pl-1 text-[11px] leading-relaxed ${color} ${mono ? 'font-mono' : ''}`}>
      {note.text}
    </p>
  )
}

function toToolCard(tool: CodeTranscriptTool): ToolCard {
  return {
    callId: tool.callId,
    name: tool.name,
    status: tool.status === 'pending' ? 'running' : tool.status,
    output: tool.output,
    error: tool.error
  }
}

function TranscriptBlock({ item }: { item: CodeTranscriptItem }): JSX.Element {
  if (item.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="chat-message chat-message--user max-w-[78%] whitespace-pre-wrap rounded-2xl border px-3 py-2 text-[13px] leading-relaxed select-text">
          {item.text}
        </div>
      </div>
    )
  }

  if (item.role !== 'assistant') {
    return (
      <div className="flex justify-start">
        <div className="chat-message chat-message--assistant max-w-[78%] rounded-2xl border px-3 py-2 text-[12px] leading-relaxed select-text">
          {item.text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="chat-message chat-message--assistant max-w-[78%] rounded-2xl border px-3 py-2 text-[13px] leading-relaxed select-text">
        {item.reasoning && <ReasoningBlock text={item.reasoning} defaultOpen={false} />}
        {item.tools?.map((tool) => <ToolRow key={tool.callId} tool={toToolCard(tool)} />)}
        {item.text && <AssistantMarkdown content={item.text} />}
        {item.error && <p className="text-xs text-red-400">{item.error}</p>}
        <div className="chat-message-meta flex items-center gap-2">
          <CopyButton
            text={item.text}
            className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
          />
        </div>
      </div>
    </div>
  )
}

function StreamBlock({ stream }: { stream: StreamingState }): JSX.Element {
  const hasContent =
    Boolean(stream.text) || Boolean(stream.reasoning) || stream.tools.length > 0 || stream.notes.length > 0
  if (!hasContent && !stream.error) return <></>

  return (
    <div className="flex justify-start">
      <div className="chat-message chat-message--assistant max-w-[78%] rounded-2xl border px-3 py-2 text-[13px] leading-relaxed select-text">
        {stream.reasoning && <ReasoningBlock text={stream.reasoning} streaming defaultOpen />}
        {stream.tools.map((tool) => (
          <ToolRow key={tool.callId} tool={tool} />
        ))}
        {stream.notes.map((note) => (
          <NoteRow key={note.id} note={note} />
        ))}
        {stream.text && <AssistantMarkdown content={stream.text} />}
        {stream.error && <p className="text-xs text-red-400">{stream.error}</p>}
      </div>
    </div>
  )
}

export default function CodeConversation({
  transcript,
  stream,
  scrollRef,
  onScroll
}: CodeConversationProps): JSX.Element {
  const isEmpty = transcript.length === 0 && !stream.text && !stream.reasoning && stream.tools.length === 0 && stream.notes.length === 0

  return (
    <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-3 chat-scrollbar">
      {isEmpty && !stream.busy && !stream.error ? (
        <p className="text-xs text-neutral-500">No messages yet.</p>
      ) : (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {transcript.map((item) => (
            <TranscriptBlock key={item.id} item={item} />
          ))}
          <StreamBlock stream={stream} />
          {stream.busy && !stream.text && !stream.reasoning && stream.tools.length === 0 && (
            <div className="flex items-center gap-2 py-2 text-xs text-neutral-500">
              <SpinnerIcon /> Working…
            </div>
          )}
        </div>
      )}
    </div>
  )
}
