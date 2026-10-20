import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject
} from 'react'
import type { NotesSettings } from '../../../shared/config'
import type { Note, NoteMeta } from '../../../shared/notes/note'
import { formatDuration } from '../../../shared/notes/meeting'
import { AssistantMarkdown } from '../chat/AssistantMarkdown'
import ConfirmDeleteModal from '../ui/ConfirmDeleteModal'
import ExpandButton from '../ui/ExpandButton'
import { PinIcon as WindowPinIcon, MeetingIcon, SpinnerIcon } from '../ui/icons'
import { CopyIcon, SparklesIcon, TrashIcon } from '../paste/PasteIcons'
import { formatRelativeTime } from '../utils/paste/pasteFormat'
import NoteAIPanel from './NoteAIPanel'
import NoteList, { type NoteFilter } from './NoteList'
import MeetingRecorderPanel from './MeetingRecorderPanel'
import type { MeetingRecorderApi } from './useMeetingRecorder'

interface NotesSurfaceProps {
  active: boolean
  height: number
  isExpanded: boolean
  isWide: boolean
  isAltHeld: boolean
  isPinned: boolean
  onToggleExpand: (event: ReactMouseEvent<HTMLButtonElement>) => void
  onTogglePin: () => void
  meeting: MeetingRecorderApi
}

type SaveState = 'idle' | 'saving' | 'saved'

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function noteKindLabel(note: Note): string {
  return note.kind === 'meeting' ? 'Meeting' : 'Note'
}

export default function NotesSurface({
  active,
  height,
  isExpanded,
  isWide,
  isAltHeld,
  isPinned,
  onToggleExpand,
  onTogglePin,
  meeting
}: NotesSurfaceProps): JSX.Element {
  const [metas, setMetas] = useState<NoteMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<NoteFilter>('all')
  const [preview, setPreview] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [selection, setSelection] = useState('')
  const [notesSettings, setNotesSettings] = useState<NotesSettings | null>(null)
  const [deleting, setDeleting] = useState<NoteMeta | null>(null)
  const [meetingTab, setMeetingTab] = useState<'recap' | 'transcript' | 'audio'>('recap')
  const [loading, setLoading] = useState(false)

  const noteRef = useRef<Note | null>(null)
  const titleRef = useRef('')
  const contentRef = useRef('')
  const dirtyRef = useRef(false)
  const selectedIdRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const selectionRangeRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })

  useEffect(() => {
    noteRef.current = note
  }, [note])
  useEffect(() => {
    titleRef.current = title
  }, [title])
  useEffect(() => {
    contentRef.current = content
  }, [content])
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  const reloadMetas = useCallback(async (): Promise<void> => {
    try {
      const next = (await window.api?.notes?.list?.()) ?? []
      setMetas(next)
    } catch {
      setMetas([])
    }
  }, [])

  const loadNote = useCallback(
    async (id: string, options?: { keepSelection?: boolean }): Promise<void> => {
      if (!id) return
      setLoading(true)
      try {
        const next = (await window.api?.notes?.get?.(id)) ?? null
        if (!next) {
          const remaining = await window.api?.notes?.delete?.(id)
          if (remaining) setMetas(remaining)
          setSelectedId(null)
          selectedIdRef.current = null
          setNote(null)
          noteRef.current = null
          setTitle('')
          titleRef.current = ''
          setContent('')
          contentRef.current = ''
          setDirty(false)
          dirtyRef.current = false
          return
        }
        setSelectedId(next.id)
        selectedIdRef.current = next.id
        setNote(next)
        noteRef.current = next
        setTitle(next.title)
        titleRef.current = next.title
        setContent(next.content)
        contentRef.current = next.content
        setDirty(false)
        dirtyRef.current = false
        setSaveState('idle')
        if (!options?.keepSelection) setSelection('')
        selectionRangeRef.current = { start: 0, end: 0 }
        window.localStorage.setItem('covenant:last-note', next.id)
        if (next.kind === 'meeting') {
          setMeetingTab(
            next.meeting?.recap
              ? 'recap'
              : next.meeting?.status === 'recording'
                ? 'transcript'
                : 'recap'
          )
        }
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const flushSave = useCallback(async (): Promise<void> => {
    const current = noteRef.current
    if (!current || !dirtyRef.current) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    setSaveState('saving')
    try {
      const updated = await window.api?.notes?.save?.({
        id: current.id,
        title: titleRef.current,
        content: contentRef.current
      })
      if (updated) {
        setNote((previous) =>
          previous && previous.id === updated.id
            ? { ...previous, title: titleRef.current, content: contentRef.current, meeting: updated.meeting }
            : previous
        )
        setDirty(false)
        dirtyRef.current = false
        setSaveState('saved')
        await reloadMetas()
      }
    } catch {
      setSaveState('idle')
    }
  }, [reloadMetas])

  // Debounced autosave. The surface unmounts when the command window hides, so
  // flushSave also runs from the unmount cleanup below.
  useEffect(() => {
    if (!dirty || !note) return undefined
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void flushSave()
    }, 650)
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [dirty, note, title, content, flushSave])

  useEffect(() => {
    return () => {
      if (dirtyRef.current && noteRef.current) {
        void window.api?.notes?.save?.({
          id: noteRef.current.id,
          title: titleRef.current,
          content: contentRef.current
        })
      }
    }
  }, [])

  useEffect(() => {
    void window.api?.notes?.getSettings?.().then(setNotesSettings).catch(() => {})
    void reloadMetas()
    const unsubscribe = window.api?.notes?.onChanged?.((next) => {
      setMetas(next)
    })
    const unsubscribeSettings = window.api?.config?.onNotesSettingsUpdated?.((next) => {
      setNotesSettings(next)
    })
    return () => {
      unsubscribe?.()
      unsubscribeSettings?.()
    }
  }, [reloadMetas])

  // Meeting events can update the transcript/recap while the user is editing.
  // Never overwrite a dirty draft; only refresh the meeting metadata in that
  // case.
  useEffect(() => {
    return window.api?.notes?.meeting?.onEvent?.((event) => {
      const currentId = selectedIdRef.current
      if (!event.note || !currentId || event.note.id !== currentId) return
      if (dirtyRef.current) {
        setNote((previous) =>
          previous ? { ...previous, meeting: event.note?.meeting } : previous
        )
      } else {
        setNote(event.note)
        noteRef.current = event.note
        setTitle(event.note.title)
        titleRef.current = event.note.title
        setContent(event.note.content)
        contentRef.current = event.note.content
        setDirty(false)
        dirtyRef.current = false
      }
      if (event.type === 'recap-done') {
        setMeetingTab('recap')
      }
      void reloadMetas()
    })
  }, [reloadMetas])

  // Select the live meeting note as soon as recording starts.
  useEffect(() => {
    if (!meeting.state.noteId) return
    if (meeting.state.noteId === selectedIdRef.current) return
    void loadNote(meeting.state.noteId)
    if (meeting.isRecording) setMeetingTab('transcript')
  }, [meeting.state.noteId, meeting.isRecording, loadNote])

  useEffect(() => {
    if (!active) return
    void reloadMetas()
    const timer = window.setTimeout(() => {
      if (selectedIdRef.current) {
        textareaRef.current?.focus()
      } else {
        titleInputRef.current?.focus()
      }
    }, 60)
    return () => window.clearTimeout(timer)
  }, [active, reloadMetas])

  // Pick an initial note once the list is available.
  useEffect(() => {
    if (selectedId || loading) return
    if (metas.length === 0) return
    const last = window.localStorage.getItem('covenant:last-note')
    const target = last && metas.some((meta) => meta.id === last) ? last : metas[0].id
    void loadNote(target)
  }, [metas, selectedId, loading, loadNote])

  const filteredMetas = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    return metas.filter((meta) => {
      if (filter !== 'all' && meta.kind !== filter) return false
      if (!trimmed) return true
      return (
        meta.title.toLowerCase().includes(trimmed) ||
        meta.preview.toLowerCase().includes(trimmed) ||
        meta.tags.some((tag) => tag.toLowerCase().includes(trimmed))
      )
    })
  }, [metas, query, filter])

  const handleSelect = useCallback(
    (id: string): void => {
      if (id === selectedIdRef.current) return
      void flushSave().then(() => loadNote(id))
    },
    [flushSave, loadNote]
  )

  const handleNewNote = useCallback(async (): Promise<void> => {
    await flushSave()
    try {
      const created = await window.api?.notes?.create?.({
        kind: 'note',
        title: 'Untitled note',
        content: ''
      })
      if (!created) return
      await reloadMetas()
      await loadNote(created.id)
      window.setTimeout(() => {
        titleInputRef.current?.focus()
        titleInputRef.current?.select()
      }, 30)
    } catch {
      // Ignore — the empty state still lets the user retry.
    }
  }, [flushSave, loadNote, reloadMetas])

  const handleNewMeeting = useCallback(async (): Promise<void> => {
    await flushSave()
    if (meeting.isRecording || meeting.isBusy) {
      if (meeting.state.noteId) {
        await loadNote(meeting.state.noteId)
        setMeetingTab('transcript')
      }
      return
    }
    const created = await meeting.startMeeting({
      captureSystemAudio: notesSettings?.captureSystemAudio ?? true
    })
    if (created) {
      await reloadMetas()
      await loadNote(created.id)
      setMeetingTab('transcript')
    }
  }, [flushSave, loadNote, meeting, notesSettings, reloadMetas])

  const handleDelete = useCallback(async (): Promise<void> => {
    const target = deleting
    if (!target) return
    setDeleting(null)
    if (meeting.state.noteId === target.id) {
      await meeting.cancelMeeting()
    }
    const next = (await window.api?.notes?.delete?.(target.id)) ?? []
    setMetas(next)
    if (selectedIdRef.current === target.id) {
      setSelectedId(null)
      selectedIdRef.current = null
      setNote(null)
      noteRef.current = null
      setTitle('')
      setContent('')
      setDirty(false)
      dirtyRef.current = false
      const nextTarget = next[0]?.id
      if (nextTarget) {
        await loadNote(nextTarget)
      }
    }
  }, [deleting, loadNote, meeting])

  const handleTogglePin = useCallback(async (): Promise<void> => {
    const current = noteRef.current
    if (!current) return
    const updated = await window.api?.notes?.save?.({
      id: current.id,
      title: titleRef.current,
      content: contentRef.current,
      pinned: !current.pinned
    })
    if (updated) {
      setNote(updated)
      noteRef.current = updated
      setDirty(false)
      dirtyRef.current = false
      await reloadMetas()
    }
  }, [reloadMetas])

  const wrapSelection = useCallback(
    (before: string, after: string, placeholder: string): void => {
      const textarea = textareaRef.current
      if (!textarea) return
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const selected = content.slice(start, end) || placeholder
      const next = `${content.slice(0, start)}${before}${selected}${after}${content.slice(end)}`
      setContent(next)
      contentRef.current = next
      setDirty(true)
      dirtyRef.current = true
      window.requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(start + before.length, start + before.length + selected.length)
      })
    },
    [content]
  )

  const insertText = useCallback(
    (text: string): void => {
      const textarea = textareaRef.current
      if (!textarea) {
        const next = `${content}${content.trim() ? '\n\n' : ''}${text}`
        setContent(next)
        contentRef.current = next
        setDirty(true)
        dirtyRef.current = true
        return
      }
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const next = `${content.slice(0, start)}${text}${content.slice(end)}`
      setContent(next)
      contentRef.current = next
      setDirty(true)
      dirtyRef.current = true
      window.requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(start + text.length, start + text.length)
      })
    },
    [content]
  )

  const replaceSelection = useCallback(
    (text: string): void => {
      const range = selectionRangeRef.current
      const next = `${content.slice(0, range.start)}${text}${content.slice(range.end)}`
      setContent(next)
      contentRef.current = next
      setDirty(true)
      dirtyRef.current = true
      setSelection('')
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(range.start + text.length, range.start + text.length)
      })
    },
    [content]
  )

  const handleSummarize = useCallback((): void => {
    if (!note) return
    void meeting.summarizeMeeting(note.id)
  }, [meeting, note])

  const handleRetranscribe = useCallback((): void => {
    if (!note) return
    void window.api?.notes?.meeting?.retranscribe?.(note.id).then((updated) => {
      if (!updated) return
      setNote(updated)
      noteRef.current = updated
      setTitle(updated.title)
      setContent(updated.content)
      setDirty(false)
      dirtyRef.current = false
      void reloadMetas()
    })
  }, [note, reloadMetas])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (deleting) {
        event.preventDefault()
        setDeleting(null)
        return
      }
      if (aiOpen) {
        event.preventDefault()
        setAiOpen(false)
        return
      }
      if (preview) {
        event.preventDefault()
        setPreview(false)
        return
      }
      event.preventDefault()
      window.api?.window.hideWindow()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [aiOpen, preview, deleting])

  const saveLabel =
    saveState === 'saving' ? 'Saving…' : saveState === 'saved' || !dirty ? 'Saved' : 'Unsaved'
  const activeMeeting = note && meeting.state.noteId === note.id ? meeting.state : null
  const isMeetingNote = note?.kind === 'meeting'
  const showSidebar = isWide || !note
  // AI works on normal notes and on a meeting's Recap tab. It is intentionally
  // unavailable for Transcript/Audio because those aren't editable content.
  const aiAvailable = Boolean(note) && (!isMeetingNote || meetingTab === 'recap')
  const meetingStatus = activeMeeting?.status ?? note?.meeting?.status
  const totalSegments = note?.meeting?.segments.length ?? 0
  const transcribedSegments =
    note?.meeting?.segments.filter((segment) => segment.transcript.trim().length > 0).length ?? 0

  useEffect(() => {
    if (!aiAvailable && aiOpen) setAiOpen(false)
  }, [aiAvailable, aiOpen])

  if (!active) return <div style={{ height }} />

  return (
    <div className="notes-selectable flex min-h-0 flex-col" style={{ height }}>
      <header className="relative flex items-center justify-between gap-2 px-1 pb-2">
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
            <WindowPinIcon active={isPinned} />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Notes</p>
            <p className="truncate text-sm font-medium text-neutral-200">
              Notes &amp; Meetings
              <span className="ml-2 text-[11px] font-normal text-neutral-500">
                {metas.length} note{metas.length === 1 ? '' : 's'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!showSidebar && (
            <>
              <button
                type="button"
                onClick={() => void handleNewNote()}
                className="flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-xs text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                + Note
              </button>
              <button
                type="button"
                onClick={() => void handleNewMeeting()}
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${
                  meeting.isRecording
                    ? 'border-red-400/30 bg-red-500/15 text-red-300'
                    : 'border-white/10 text-neutral-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <MeetingIcon className={meeting.isRecording ? 'animate-pulse' : undefined} />
                Meet
              </button>
              <button
                type="button"
                onClick={() => setAiOpen((open) => !open)}
                disabled={!aiAvailable}
                title={aiAvailable ? 'Toggle note AI' : 'Open a note or switch to Recap to use AI'}
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  aiOpen && aiAvailable
                    ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
                    : 'border-white/10 text-neutral-300 hover:bg-white/10 hover:text-white'
                }`}
                aria-pressed={aiOpen}
              >
                <SparklesIcon /> AI
              </button>
            </>
          )}
          <ExpandButton
            expanded={isExpanded}
            wide={isWide}
            altHeld={isAltHeld}
            onClick={onToggleExpand}
          />
        </div>
      </header>

      {meeting.state.error && !meeting.state.noteId && (
        <div className="mx-1 mb-2 flex items-start justify-between gap-3 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
          <span>{meeting.state.error}</span>
          <button
            type="button"
            onClick={() => meeting.clearError()}
            className="shrink-0 rounded px-1 text-red-300 transition-colors hover:bg-white/10 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-white/5 bg-neutral-950/20">
        {showSidebar && (
          <NoteList
            notes={filteredMetas}
            selectedId={selectedId}
            query={query}
            filter={filter}
            isRecording={meeting.isRecording}
            aiOpen={aiOpen && aiAvailable}
            aiEnabled={aiAvailable}
            onQueryChange={setQuery}
            onFilterChange={setFilter}
            onSelect={handleSelect}
            onNewNote={() => void handleNewNote()}
            onNewMeeting={() => void handleNewMeeting()}
            onToggleAi={() => setAiOpen((open) => !open)}
          />
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          {!note ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-neutral-400">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <path d="M14 3v6h6" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-200">Your notes live here</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Write a note or record a meeting and turn the transcript into a recap.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleNewNote()}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-white/10"
                >
                  New note
                </button>
                <button
                  type="button"
                  onClick={() => void handleNewMeeting()}
                  className="flex items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/25"
                >
                  <MeetingIcon />
                  Record meeting
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  {!isWide && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(null)
                        selectedIdRef.current = null
                        setNote(null)
                        noteRef.current = null
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
                      aria-label="Back to notes"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="m15 18-6-6 6-6" />
                      </svg>
                    </button>
                  )}
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-neutral-400">
                    {noteKindLabel(note)}
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    {formatRelativeTime(note.updatedAt)} · {wordCount(content)} words
                  </span>
                  <span className={`text-[11px] ${dirty ? 'text-amber-300' : 'text-neutral-500'}`}>
                    {saveLabel}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void handleTogglePin()}
                    className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors ${
                      note.pinned
                        ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                        : 'border-white/10 text-neutral-400 hover:bg-white/10 hover:text-neutral-200'
                    }`}
                  >
                    {note.pinned ? 'Pinned' : 'Pin'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview((value) => !value)}
                    className={`flex h-7 items-center rounded-md border px-2 text-[11px] transition-colors ${
                      preview
                        ? 'border-white/20 bg-white/10 text-neutral-100'
                        : 'border-white/10 text-neutral-400 hover:bg-white/10 hover:text-neutral-200'
                    }`}
                    aria-pressed={preview}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(metas.find((meta) => meta.id === note.id) ?? null)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-red-500/15 hover:text-red-300"
                    aria-label="Delete note"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
                {isMeetingNote && (
                  <div className="shrink-0">
                    <MeetingRecorderPanel
                      note={note}
                      meeting={meeting}
                      onSummarize={handleSummarize}
                      onRetranscribe={handleRetranscribe}
                    />
                  </div>
                )}

                <input
                  ref={titleInputRef}
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value)
                    titleRef.current = event.target.value
                    setDirty(true)
                    dirtyRef.current = true
                  }}
                  placeholder="Untitled note"
                  className="mt-3 w-full shrink-0 border-none bg-transparent text-xl font-semibold text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
                  aria-label="Note title"
                />

                {isMeetingNote ? (
                  <>
                    <div className="mt-2 flex shrink-0 items-center gap-1 border-b border-white/5 pb-2">
                      {(
                        [
                          ['recap', 'Recap'],
                          ['transcript', 'Transcript'],
                          ['audio', 'Audio']
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setMeetingTab(id)}
                          className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                            meetingTab === id
                              ? 'bg-white/10 text-neutral-100'
                              : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
                          }`}
                        >
                          {label}
                          {id === 'transcript' &&
                            (meetingStatus === 'transcribing' || meetingStatus === 'finalizing') && (
                              <span className="ml-1 inline-flex">
                                <SpinnerIcon />
                              </span>
                            )}
                          {id === 'recap' && meetingStatus === 'summarizing' && (
                            <span className="ml-1 inline-flex">
                              <SpinnerIcon />
                            </span>
                          )}
                          {id === 'transcript' && note.meeting?.segments.length ? (
                            <span className="ml-1 text-neutral-500">
                              {note.meeting.segments.length}
                            </span>
                          ) : null}
                        </button>
                      ))}
                      {meetingTab === 'transcript' && (
                        <button
                          type="button"
                          onClick={() =>
                            void window.api?.clipboard?.writeText(
                              activeMeeting?.transcript ?? note.meeting?.transcript ?? ''
                            )
                          }
                          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
                        >
                          <CopyIcon /> Copy
                        </button>
                      )}
                    </div>

                    <MeetingWorkBanner
                      status={meetingStatus}
                      transcribedSegments={transcribedSegments}
                      totalSegments={totalSegments}
                    />

                    {meetingTab === 'transcript' ? (
                      <div className="chat-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto">
                        {activeMeeting?.status === 'recording' && (
                          <p className="mb-2 flex items-center gap-1.5 text-[11px] text-red-300">
                            <MeetingIcon className="animate-pulse" />
                            Live transcript · updated every few minutes
                          </p>
                        )}
                        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-neutral-200">
                          {activeMeeting?.transcript || note.meeting?.transcript || 'No transcript yet.'}
                        </pre>
                      </div>
                    ) : meetingTab === 'audio' ? (
                      <div className="chat-scrollbar mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
                        {note.meeting?.segments.length ? (
                          note.meeting.segments.map((segment) => (
                            <div
                              key={segment.index}
                              className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5"
                            >
                              <div className="mb-1.5 flex items-center justify-between text-[11px] text-neutral-400">
                                <span>Part {segment.index + 1}</span>
                                <span>{formatDuration(segment.durationMs)}</span>
                              </div>
                              <audio
                                controls
                                preload="metadata"
                                className="h-8 w-full"
                                src={`covenant-note://audio/${encodeURIComponent(note.id)}/${encodeURIComponent(segment.file)}`}
                              />
                              {segment.error && (
                                <p className="mt-1 text-[10px] text-red-300">
                                  {segment.error}
                                </p>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-neutral-500">No audio segments saved.</p>
                        )}
                      </div>
                    ) : preview ? (
                      <div className="chat-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto pb-6 text-neutral-200">
                        <AssistantMarkdown content={content || '*Nothing here yet.*'} />
                      </div>
                    ) : (
                      <MarkdownEditor
                        value={content}
                        onChange={(next) => {
                          setContent(next)
                          contentRef.current = next
                          setDirty(true)
                          dirtyRef.current = true
                        }}
                        onSelectionChange={(next, range) => {
                          setSelection(next)
                          selectionRangeRef.current = range
                        }}
                        textareaRef={textareaRef}
                        onWrap={wrapSelection}
                      />
                    )}
                  </>
                ) : preview ? (
                  <div className="chat-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto pb-6 text-neutral-200">
                    <AssistantMarkdown content={content || '*Nothing here yet.*'} />
                  </div>
                ) : (
                  <MarkdownEditor
                    value={content}
                    onChange={(next) => {
                      setContent(next)
                      contentRef.current = next
                      setDirty(true)
                      dirtyRef.current = true
                    }}
                    onSelectionChange={(next, range) => {
                      setSelection(next)
                      selectionRangeRef.current = range
                    }}
                    textareaRef={textareaRef}
                    onWrap={wrapSelection}
                  />
                )}
              </div>
            </div>
          )}
        </main>

        {note && aiAvailable && (
          <NoteAIPanel
            note={note}
            noteContent={content}
            noteTitle={title}
            open={aiOpen}
            selection={selection}
            onClose={() => setAiOpen(false)}
            onInsert={(text) => {
              insertText(text)
              setAiOpen(false)
            }}
            onReplace={(text) => {
              replaceSelection(text)
              setAiOpen(false)
            }}
          />
        )}
      </div>

      {deleting && (
        <ConfirmDeleteModal
          title={`Delete “${deleting.title}”?`}
          message={
            deleting.kind === 'meeting'
              ? 'The transcript, recap and saved audio for this meeting will be deleted permanently.'
              : 'This note will be deleted permanently.'
          }
          onCancel={() => setDeleting(null)}
          onConfirm={() => void handleDelete()}
          contained
        />
      )}
    </div>
  )
}

function MeetingWorkBanner({
  status,
  transcribedSegments,
  totalSegments
}: {
  status: string | undefined
  transcribedSegments: number
  totalSegments: number
}): JSX.Element | null {
  if (status !== 'finalizing' && status !== 'transcribing' && status !== 'summarizing') {
    return null
  }

  const label =
    status === 'finalizing'
      ? 'Sending final audio for transcription…'
      : status === 'summarizing'
        ? 'Transcription complete · writing recap…'
        : totalSegments > 0
          ? `Transcribing audio… ${transcribedSegments} / ${totalSegments} segments`
          : 'Sending audio for transcription…'

  const progress =
    status === 'transcribing' && totalSegments > 0
      ? Math.min(1, transcribedSegments / totalSegments)
      : null

  return (
    <div className="mt-3 shrink-0 rounded-lg border border-emerald-400/20 bg-neutral-950/80 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-2 text-[11px] text-neutral-200">
        <SpinnerIcon />
        <span>{label}</span>
      </div>
      {progress !== null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-300"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  onSelectionChange: (selection: string, range: { start: number; end: number }) => void
  textareaRef: RefObject<HTMLTextAreaElement>
  onWrap: (before: string, after: string, placeholder: string) => void
}

function MarkdownEditor({
  value,
  onChange,
  onSelectionChange,
  textareaRef,
  onWrap
}: MarkdownEditorProps): JSX.Element {
  const TOOLBAR: Array<{ label: string; title: string; before: string; after: string; placeholder: string }> = [
    { label: 'B', title: 'Bold', before: '**', after: '**', placeholder: 'bold text' },
    { label: 'I', title: 'Italic', before: '_', after: '_', placeholder: 'italic text' },
    { label: 'H', title: 'Heading', before: '## ', after: '', placeholder: 'Heading' },
    { label: '•', title: 'Bullet list', before: '- ', after: '', placeholder: 'List item' },
    { label: '1.', title: 'Numbered list', before: '1. ', after: '', placeholder: 'List item' },
    { label: '<>', title: 'Inline code', before: '`', after: '`', placeholder: 'code' },
    { label: '“”', title: 'Quote', before: '> ', after: '', placeholder: 'Quote' }
  ]

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      <div className="mb-1.5 flex flex-wrap items-center gap-0.5">
        {TOOLBAR.map((item) => (
          <button
            key={item.title}
            type="button"
            title={item.title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onWrap(item.before, item.after, item.placeholder)}
            className="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-[11px] text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-neutral-500">Markdown</span>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onSelect={(event) => {
          const target = event.currentTarget
          onSelectionChange(
            target.value.slice(target.selectionStart, target.selectionEnd),
            { start: target.selectionStart, end: target.selectionEnd }
          )
        }}
        onKeyUp={(event) => {
          const target = event.currentTarget
          onSelectionChange(
            target.value.slice(target.selectionStart, target.selectionEnd),
            { start: target.selectionStart, end: target.selectionEnd }
          )
        }}
        onClick={(event) => {
          const target = event.currentTarget
          onSelectionChange(
            target.value.slice(target.selectionStart, target.selectionEnd),
            { start: target.selectionStart, end: target.selectionEnd }
          )
        }}
        placeholder="Start writing… Markdown is supported."
        className="chat-scrollbar min-h-[220px] w-full flex-1 resize-none border-none bg-transparent font-sans text-sm leading-relaxed text-neutral-200 placeholder:text-neutral-500 focus:outline-none"
        spellCheck
      />
    </div>
  )
}
