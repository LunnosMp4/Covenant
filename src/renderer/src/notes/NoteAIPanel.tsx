import { useCallback, useEffect, useRef, useState } from 'react'
import type { Note, NoteAiEvent } from '../../../shared/notes/note'
import { AssistantMarkdown } from '../chat/AssistantMarkdown'
import { SparklesIcon } from '../paste/PasteIcons'

interface ChatEntry {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface NoteAIPanelProps {
  note: Note
  noteContent: string
  noteTitle: string
  open: boolean
  selection: string
  onClose: () => void
  onInsert: (text: string) => void
}

function createChatId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export default function NoteAIPanel({
  note,
  noteContent,
  noteTitle,
  open,
  selection,
  onClose,
  onInsert
}: NoteAIPanelProps): JSX.Element | null {
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const streamIdRef = useRef<string | null>(null)
  const pendingStreamRef = useRef(false)
  const assistantIdRef = useRef<string | null>(null)
  const noteIdRef = useRef(note.id)

  useEffect(() => {
    if (noteIdRef.current === note.id) return
    noteIdRef.current = note.id
    if (streamIdRef.current) {
      window.api?.notes?.ai?.cancel(streamIdRef.current)
      streamIdRef.current = null
    }
    pendingStreamRef.current = false
    setMessages([])
    setError(null)
    setStreaming(false)
  }, [note.id])

  useEffect(() => {
    if (!open) {
      if (streamIdRef.current) {
        window.api?.notes?.ai?.cancel(streamIdRef.current)
      }
      streamIdRef.current = null
      pendingStreamRef.current = false
      setStreaming(false)
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (streamIdRef.current) {
        window.api?.notes?.ai?.cancel(streamIdRef.current)
        streamIdRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!open) return
    return window.api?.notes?.ai?.onEvent((event: NoteAiEvent) => {
      if (!streamIdRef.current) {
        if (!pendingStreamRef.current) return
        streamIdRef.current = event.id
      }
      if (event.id !== streamIdRef.current) return

      if (event.type === 'content' && event.delta) {
        const assistantId = assistantIdRef.current
        if (!assistantId) return
        const delta = event.delta
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantId
              ? { ...message, content: message.content + delta }
              : message
          )
        )
        return
      }

      if (event.type === 'error') {
        setError(event.error ?? 'Unable to reach the AI.')
        setStreaming(false)
        pendingStreamRef.current = false
        streamIdRef.current = null
        return
      }

      if (event.type === 'done') {
        setStreaming(false)
        pendingStreamRef.current = false
        streamIdRef.current = null
      }
    })
  }, [open])

  const sendChat = useCallback((): void => {
    const prompt = input.trim()
    if (!prompt || streaming) return
    setInput('')
    setError(null)
    setStreaming(true)

    const userEntry: ChatEntry = {
      id: createChatId(),
      role: 'user',
      content: prompt
    }
    const assistantEntry: ChatEntry = {
      id: createChatId(),
      role: 'assistant',
      content: ''
    }
    assistantIdRef.current = assistantEntry.id
    const history = messages
      .filter((message) => message.content.trim())
      .map((message) => ({ role: message.role, content: message.content }))
    setMessages((previous) => [...previous, userEntry, assistantEntry])

    void (async () => {
      try {
        pendingStreamRef.current = true
        const response = await window.api?.notes?.ai?.run({
          noteId: note.id,
          action: 'chat',
          noteContent,
          noteTitle,
          selection: selection.trim() || undefined,
          text: prompt,
          messages: history
        })
        if (response?.id) {
          if (pendingStreamRef.current && !streamIdRef.current) streamIdRef.current = response.id
        } else {
          pendingStreamRef.current = false
          setStreaming(false)
          setError('Unable to start the AI request.')
        }
      } catch (requestError) {
        pendingStreamRef.current = false
        setStreaming(false)
        setError(
          requestError instanceof Error ? requestError.message : 'Unable to start the AI request.'
        )
      }
    })()
  }, [input, messages, note.id, noteContent, noteTitle, selection, streaming])

  if (!open) return null

  return (
    <aside className="flex w-[330px] shrink-0 flex-col border-l border-white/5 bg-neutral-950/20">
      <header className="flex items-center justify-between border-b border-white/5 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color:var(--chat-accent-soft)] text-[color:var(--chat-accent)]">
            <SparklesIcon />
          </span>
          <div>
            <p className="text-xs font-semibold text-neutral-100">Note AI</p>
            <p className="text-[10px] text-neutral-500">Uses the current note as context</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
          aria-label="Close note AI"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </header>

      <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {selection.trim() && (
          <p className="rounded-md border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200">
            Using {selection.trim().split(/\s+/).length} selected word(s)
          </p>
        )}

        {messages.length > 0 && (
          <div className={`space-y-2 ${selection.trim() ? 'mt-3' : ''}`}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`select-text rounded-xl border px-2.5 py-2 text-[12px] leading-relaxed ${
                  message.role === 'user'
                    ? 'ml-6 border-white/10 bg-white/[0.06] text-neutral-200'
                    : 'mr-2 border-white/5 bg-white/[0.03] text-neutral-300'
                }`}
              >
                {message.role === 'assistant' ? (
                  message.content ? (
                    <div>
                      <AssistantMarkdown content={message.content} />
                      <button
                        type="button"
                        onClick={() => onInsert(message.content)}
                        className="mt-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
                      >
                        Insert into note
                      </button>
                    </div>
                  ) : (
                    <span className="text-neutral-500">Thinking…</span>
                  )
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-200">
            {error}
          </p>
        )}

        {!streaming && messages.length === 0 && (
          <p className={`text-[11px] leading-relaxed text-neutral-500 ${selection.trim() ? 'mt-3' : ''}`}>
            Ask anything about this note, or select text to focus the answer.
          </p>
        )}
      </div>

      <div className="border-t border-white/5 p-2.5">
        <div className="flex items-end gap-1.5">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                sendChat()
              }
            }}
            rows={1}
            placeholder="Ask about this note…"
            className="chat-scrollbar max-h-28 min-h-[36px] flex-1 resize-none rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-[color:var(--chat-accent)]"
          />
          <button
            type="button"
            onClick={sendChat}
            disabled={streaming || !input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-neutral-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send note AI message"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
