import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from 'react'
import type { NotesSettings } from '../../../shared/config'
import type { Note, NoteMeta } from '../../../shared/notes/note'
import ConfirmDeleteModal from '../ui/ConfirmDeleteModal'
import ExpandButton from '../ui/ExpandButton'
import { PinIcon as WindowPinIcon, MeetingIcon, SpinnerIcon } from '../ui/icons'
import { CopyIcon, SparklesIcon } from '../paste/PasteIcons'
import { formatRelativeTime } from '../utils/paste/pasteFormat'
import LiveMarkdownEditor, { type NotesEditorHandle } from './editor/LiveMarkdownEditor'
import NoteAIPanel from './NoteAIPanel'
import NoteAudioPlayer from './NoteAudioPlayer'
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

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
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
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<NoteFilter>('all')
  const [aiOpen, setAiOpen] = useState(false)
  const [selection, setSelection] = useState('')
  const [notesSettings, setNotesSettings] = useState<NotesSettings | null>(null)
  const [deleting, setDeleting] = useState<NoteMeta | null>(null)
  const [meetingTab, setMeetingTab] = useState<'recap' | 'transcript' | 'audio'>('recap')
  const [loading, setLoading] = useState(false)
  // True while the user explicitly went back to the list on a narrow layout.
  // Without it the "pick an initial note" effect immediately reselects a note.
  const [browsingList, setBrowsingList] = useState(false)

  const noteRef = useRef<Note | null>(null)
  const titleRef = useRef('')
  const contentRef = useRef('')
  const dirtyRef = useRef(false)
  const selectedIdRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())
  const flushSaveRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const loadRequestRef = useRef(0)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<NotesEditorHandle>(null)

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
      // Guard against out-of-order responses when notes are switched quickly.
      const requestId = ++loadRequestRef.current
      setLoading(true)
      try {
        const next = (await window.api?.notes?.get?.(id)) ?? null
        if (requestId !== loadRequestRef.current) return
        if (!next) {
          const remaining = await window.api?.notes?.delete?.(id)
          if (requestId !== loadRequestRef.current) return
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
        setBrowsingList(false)
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
        if (!options?.keepSelection) setSelection('')
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
        if (requestId === loadRequestRef.current) setLoading(false)
      }
    },
    []
  )

  /**
   * Saves the current draft. Saves are chained so they are applied in order, and
   * "clean" is only reported when nothing changed while the write was in flight
   * — otherwise an edit made during an autosave could be silently dropped.
   */
  const flushSave = useCallback((): Promise<void> => {
    const run = async (): Promise<void> => {
      const current = noteRef.current
      if (!current || !dirtyRef.current) return
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }

      const id = current.id
      const title = titleRef.current
      const content = contentRef.current
      try {
        const updated = await window.api?.notes?.save?.({ id, title, content })
        if (!updated) {
          return
        }
        if (noteRef.current?.id === id) {
          setNote((previous) =>
            previous && previous.id === id
              ? {
                  ...previous,
                  title,
                  content,
                  meeting: updated.meeting,
                  updatedAt: updated.updatedAt
                }
              : previous
          )
          if (titleRef.current === title && contentRef.current === content) {
            setDirty(false)
            dirtyRef.current = false
          }
        }
      } catch {
        // Retry if the write failed while there is still unsaved work.
        if (dirtyRef.current && !saveTimerRef.current) {
          saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null
            void flushSaveRef.current()
          }, 1500)
        }
      }
    }

    const next = saveChainRef.current.then(run, run)
    saveChainRef.current = next.catch(() => {})
    return next
  }, [])

  flushSaveRef.current = flushSave

  // Debounced autosave. The surface unmounts when the command window hides, so
  // flushSave also runs from the unmount cleanup below. It deliberately does not
  // depend on `note`, so meeting events can't postpone a pending autosave.
  useEffect(() => {
    if (!dirty || !noteRef.current) return undefined
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
  }, [dirty, title, content, flushSave])

  useEffect(() => {
    return () => {
      if (dirtyRef.current && noteRef.current) void flushSave()
    }
  }, [flushSave])

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
  // case. The notes list itself is refreshed by the `notes:changed` broadcast.
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
    })
  }, [])

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
        editorRef.current?.focus()
      } else {
        titleInputRef.current?.focus()
      }
    }, 60)
    return () => window.clearTimeout(timer)
  }, [active, reloadMetas])

  // Pick an initial note once the list is available.
  useEffect(() => {
    if (browsingList) return
    if (selectedId || loading) return
    if (metas.length === 0) return
    const last = window.localStorage.getItem('covenant:last-note')
    const target = last && metas.some((meta) => meta.id === last) ? last : metas[0].id
    void loadNote(target)
  }, [browsingList, metas, selectedId, loading, loadNote])

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

  // Counting words scans the whole document; don't redo it on every render
  // (meeting ticks, selection changes, etc.).
  const wordTotal = useMemo(() => wordCount(content), [content])

  const handleSelect = useCallback(
    (id: string): void => {
      if (id === selectedIdRef.current) return
      void flushSave().then(() => loadNote(id))
    },
    [flushSave, loadNote]
  )

  const handleBackToList = useCallback(async (): Promise<void> => {
    // Save before clearing the editor state, otherwise the pending debounce
    // would be cancelled along with the draft.
    await flushSave()
    setBrowsingList(true)
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
    setSelection('')
  }, [flushSave])

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
    // Cancelling an active meeting already deletes the note, so don't delete it
    // a second time (and don't fail if it is already gone).
    const wasActiveMeeting = meeting.state.noteId === target.id
    if (wasActiveMeeting) {
      await meeting.cancelMeeting()
    }
    const next = wasActiveMeeting
      ? ((await window.api?.notes?.list?.()) ?? [])
      : ((await window.api?.notes?.delete?.(target.id)) ?? [])
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

  const handleTogglePin = useCallback(
    async (id?: string): Promise<void> => {
      const targetId = id ?? noteRef.current?.id
      if (!targetId) return
      const selected = noteRef.current?.id === targetId
      const current = noteRef.current
      const meta = metas.find((entry) => entry.id === targetId)
      const pinned = selected && current ? !current.pinned : !(meta?.pinned ?? false)
      const title = selected ? titleRef.current : undefined
      const content = selected ? contentRef.current : undefined
      try {
        const updated = await window.api?.notes?.save?.({ id: targetId, title, content, pinned })
        if (!updated) return
        if (selected && noteRef.current?.id === targetId) {
          const latest = noteRef.current
          if (latest) noteRef.current = { ...latest, pinned: updated.pinned }
          setNote((previous) =>
            previous && previous.id === targetId
              ? { ...previous, pinned: updated.pinned }
              : previous
          )
          // Only clear the dirty flag if the draft didn't change during the save.
          if (titleRef.current === title && contentRef.current === content) {
            setDirty(false)
            dirtyRef.current = false
          }
        }
      } catch {
        // Ignore — the pin state stays unchanged.
      }
    },
    [metas]
  )

  const insertText = useCallback((text: string): void => {
    const editor = editorRef.current
    if (editor) {
      editor.insertText(text)
      return
    }
    // Editor not mounted (e.g. a meeting's transcript tab): append instead.
    const current = contentRef.current
    const next = `${current}${current.trim() ? '\n\n' : ''}${text}`
    setContent(next)
    contentRef.current = next
    setDirty(true)
    dirtyRef.current = true
  }, [])

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
      event.preventDefault()
      window.api?.window.hideWindow()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [aiOpen, deleting])

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
            className={`pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
              isPinned
                ? 'border-[color:var(--chat-accent-strong)] bg-[color:var(--chat-accent-soft)] text-[color:var(--chat-accent)]'
                : 'border-white/10 text-neutral-400 hover:border-white/20 hover:bg-white/10 hover:text-neutral-200'
            }`}
            aria-label={isPinned ? 'Unpin window' : 'Pin window'}
            aria-pressed={isPinned}
          >
            <WindowPinIcon active={isPinned} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-200">Notes</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!showSidebar && (
            <>
              <button
                type="button"
                onClick={() => void handleNewNote()}
                className="pressable flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-xs text-neutral-300 hover:bg-white/10 hover:text-white"
              >
                + Note
              </button>
              <button
                type="button"
                onClick={() => void handleNewMeeting()}
                className={`pressable flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs ${
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
                className={`pressable flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                  aiOpen && aiAvailable
                    ? 'border-[color:var(--chat-accent-strong)] bg-[color:var(--chat-accent-soft)] text-[color:var(--chat-accent)]'
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
            showActions={isWide}
            onQueryChange={setQuery}
            onFilterChange={setFilter}
            onSelect={handleSelect}
            onNewNote={() => void handleNewNote()}
            onNewMeeting={() => void handleNewMeeting()}
            onToggleAi={() => setAiOpen((open) => !open)}
            onTogglePin={(id) => void handleTogglePin(id)}
            onDelete={setDeleting}
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

                <div className="mt-3 flex shrink-0 items-center gap-2">
                  {!isWide && (
                    <button
                      type="button"
                      onClick={() => void handleBackToList()}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
                      aria-label="Back to notes"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="m15 18-6-6 6-6" />
                      </svg>
                    </button>
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
                    className="min-w-0 flex-1 border-none bg-transparent text-xl font-semibold text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
                    aria-label="Note title"
                  />
                  <span className="shrink-0 text-[11px] text-neutral-500">
                    {formatRelativeTime(note.updatedAt)} · {wordTotal}{' '}
                    {wordTotal === 1 ? 'word' : 'words'}
                  </span>
                </div>

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
                            <div key={segment.index} className="space-y-1.5">
                              <NoteAudioPlayer
                                src={`covenant-note://audio/${encodeURIComponent(note.id)}/${encodeURIComponent(segment.file)}`}
                                durationMs={segment.durationMs}
                                label={`Part ${segment.index + 1}`}
                              />
                              {segment.error && (
                                <p className="px-1 text-[10px] text-red-300">{segment.error}</p>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-neutral-500">No audio segments saved.</p>
                        )}
                      </div>
                    ) : (
                      <LiveMarkdownEditor
                        ref={editorRef}
                        value={content}
                        mode="live"
                        onChange={(next) => {
                          setContent(next)
                          contentRef.current = next
                          setDirty(true)
                          dirtyRef.current = true
                        }}
                        onSelectionChange={(next) => setSelection(next)}
                      />
                    )}
                  </>
                ) : (
                  <LiveMarkdownEditor
                    ref={editorRef}
                    value={content}
                    mode="live"
                    onChange={(next) => {
                      setContent(next)
                      contentRef.current = next
                      setDirty(true)
                      dirtyRef.current = true
                    }}
                    onSelectionChange={(next) => setSelection(next)}
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
    <div className="mt-3 shrink-0 rounded-lg border border-[color:var(--chat-accent-strong)] bg-neutral-950/80 px-3 py-2">
      <div className="flex items-center gap-2 text-[11px] text-neutral-200">
        <SpinnerIcon />
        <span>{label}</span>
      </div>
      {progress !== null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="progress-fill h-full rounded-full bg-[color:var(--chat-accent)]"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      )}
    </div>
  )
}
