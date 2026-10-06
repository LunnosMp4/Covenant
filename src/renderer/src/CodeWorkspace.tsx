import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type {
  CodeEngineEvent,
  CodeFileDiff,
  CodeModel,
  CodePermissionRequest,
  CodeProject,
  CodeSession,
  CodeStatus,
  CodeTranscriptItem
} from '../../shared/code/code'
import { parseModelSelector } from '../../shared/code/codeNormalizers'
import { AssistantMarkdown } from './chat/AssistantMarkdown'
import {
  ChevronDownIcon,
  CodeIcon,
  SendIcon,
  SpinnerIcon,
  StopIcon,
  TrashIcon,
  XIcon
} from './ui/icons'

type CodeStatusWithKey = CodeStatus & { hasApiKey: boolean }

interface ToolCard {
  callId: string
  name: string
  status: 'running' | 'completed' | 'error'
  output?: string
  error?: string
}

interface Note {
  id: string
  text: string
  tone: 'info' | 'error' | 'file' | 'shell'
}

interface StreamingState {
  text: string
  reasoning: string
  tools: ToolCard[]
  notes: Note[]
  busy: boolean
  error?: string
}

const EMPTY_STREAM: StreamingState = {
  text: '',
  reasoning: '',
  tools: [],
  notes: [],
  busy: false
}

function noteId(): string {
  return Math.random().toString(36).slice(2)
}

export default function CodeWorkspace(): JSX.Element {
  const api = window.api
  const [status, setStatus] = useState<CodeStatusWithKey | null>(null)
  const [projects, setProjects] = useState<CodeProject[]>([])
  const [activeProject, setActiveProject] = useState<CodeProject | null>(null)
  const [sessions, setSessions] = useState<CodeSession[]>([])
  const [activeSession, setActiveSession] = useState<CodeSession | null>(null)
  const [models, setModels] = useState<CodeModel[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [transcript, setTranscript] = useState<CodeTranscriptItem[]>([])
  const [stream, setStream] = useState<StreamingState>(EMPTY_STREAM)
  const [permissions, setPermissions] = useState<CodePermissionRequest[]>([])
  const [diffs, setDiffs] = useState<CodeFileDiff[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const activeSessionIdRef = useRef<string | null>(null)
  const activeProjectRef = useRef<CodeProject | null>(null)

  activeSessionIdRef.current = activeSession?.id ?? null
  activeProjectRef.current = activeProject

  const refreshStatus = useCallback(async () => {
    if (!api?.code) return
    const result = await api.code.getStatus()
    if (result.success) setStatus(result.status)
    else setError(result.error)
  }, [api])

  const loadProjects = useCallback(async () => {
    if (!api?.code) return
    const result = await api.code.listProjects()
    if (result.success) {
      setProjects(result.projects)
      setActiveProject((current) => current ?? result.projects[0] ?? null)
    }
  }, [api])

  const loadModels = useCallback(async () => {
    if (!api?.code) return
    const result = await api.code.listModels()
    if (result.success) {
      setModels(result.models)
      setSelectedModel((current) => current || (result.models[0] ? `${result.models[0].providerID}/${result.models[0].id}` : ''))
    }
  }, [api])

  const loadSessions = useCallback(
    async (project: CodeProject | null) => {
      if (!api?.code || !project) {
        setSessions([])
        return
      }
      setLoadingSessions(true)
      const result = await api.code.listSessions(project.directory)
      setLoadingSessions(false)
      if (result.success) setSessions(result.sessions)
      else setError(result.error)
    },
    [api]
  )

  // Initial load + event subscription.
  useEffect(() => {
    if (!api?.code) return
    api.code.subscribe()
    void refreshStatus()
    void loadProjects()
    void loadModels()
  }, [api, refreshStatus, loadProjects, loadModels])

  useEffect(() => {
    if (!activeProject) return
    void loadSessions(activeProject)
  }, [activeProject, loadSessions])

  useEffect(() => {
    if (!api?.code) return
    let diffTimer: number | null = null
    const scheduleDiffRefresh = (sessionId: string): void => {
      if (!sessionId) return
      if (diffTimer !== null) window.clearTimeout(diffTimer)
      diffTimer = window.setTimeout(() => {
        void (async () => {
          const result = await api.code?.getDiff(sessionId)
          if (result?.success) setDiffs(result.diff)
        })()
      }, 600)
    }

    const unsubscribe = api.code.onEvent((event: CodeEngineEvent) => {
      if (event.kind === 'permission') {
        setPermissions((current) =>
          current.some((item) => item.id === event.request.id) ? current : [...current, event.request]
        )
        return
      }
      if (event.kind === 'permission-replied') {
        setPermissions((current) => current.filter((item) => item.id !== event.requestId))
        return
      }
      if (event.kind === 'diff') {
        if (!activeSessionIdRef.current || event.sessionId === activeSessionIdRef.current) {
          setDiffs(event.diff)
        }
        return
      }
      if (event.kind === 'session') {
        setSessions((current) => {
          const idx = current.findIndex((session) => session.id === event.session.id)
          if (idx < 0) return current
          const next = [...current]
          next[idx] = event.session
          return next
        })
        setActiveSession((current) => (current && current.id === event.session.id ? event.session : current))
        return
      }

      const activity = event.event
      if (activeSessionIdRef.current && activity.sessionId && activity.sessionId !== activeSessionIdRef.current) {
        return
      }
      setStream((current) => applyActivity(current, activity))
      if (
        activity.type === 'file-edited' ||
        activity.type === 'tool-success' ||
        activity.type === 'tool-failed' ||
        activity.type === 'done'
      ) {
        scheduleDiffRefresh(activity.sessionId)
      }
      if (activity.type === 'done') {
        void (async () => {
          const directory = activeProjectRef.current?.directory
          const result = await api.code?.listSessions(directory)
          if (result?.success) {
            setSessions(result.sessions)
            setActiveSession((current) =>
              current ? result.sessions.find((session) => session.id === current.id) ?? current : current
            )
          }
        })()
      }
    })
    return () => {
      if (diffTimer !== null) window.clearTimeout(diffTimer)
      unsubscribe()
    }
  }, [api])

  const handleAddProject = useCallback(async () => {
    if (!api?.code) return
    const picked = await api.code.pickDirectory()
    if (!picked.success || !picked.directory) return
    const result = await api.code.addProject(picked.directory)
    if (result.success) {
      setProjects(result.projects)
      const created = result.projects.find((project) => project.directory === picked.directory)
      if (created) setActiveProject(created)
    } else {
      setError(result.error)
    }
  }, [api])

  const handleRemoveProject = useCallback(
    async (project: CodeProject) => {
      if (!api?.code) return
      const result = await api.code.removeProject(project.id)
      if (result.success) {
        setProjects(result.projects)
        setActiveProject((current) => (current?.id === project.id ? result.projects[0] ?? null : current))
      }
    },
    [api]
  )

  const handleCreateSession = useCallback(async () => {
    if (!api?.code || !activeProject) return
    const ref = parseModelSelector(selectedModel)
    const result = await api.code.createSession({
      directory: activeProject.directory,
      model: ref.id ? ref : undefined
    })
    if (result.success) {
      setSessions((current) => [result.session, ...current])
      setActiveSession(result.session)
      setTranscript([])
      setStream(EMPTY_STREAM)
      setDiffs([])
      setPermissions([])
    } else {
      setError(result.error)
    }
  }, [api, activeProject, selectedModel])

  const handleSelectSession = useCallback(
    async (session: CodeSession) => {
      if (!api?.code) return
      setActiveSession(session)
      setStream(EMPTY_STREAM)
      setPermissions([])
      setError(null)
      const [transcriptResult, diffResult, permissionResult] = await Promise.all([
        api.code.getTranscript(session.id),
        api.code.getDiff(session.id),
        api.code.listPermissions(session.id)
      ])
      setTranscript(transcriptResult.success ? transcriptResult.transcript : [])
      setDiffs(diffResult.success ? diffResult.diff : [])
      setPermissions(permissionResult.success ? permissionResult.requests : [])
    },
    [api]
  )

  const handleDeleteSession = useCallback(
    async (session: CodeSession) => {
      if (!api?.code) return
      const result = await api.code.deleteSession(session.id)
      if (result.success) {
        setSessions((current) => current.filter((item) => item.id !== session.id))
        if (activeSession?.id === session.id) {
          setActiveSession(null)
          setTranscript([])
          setDiffs([])
        }
      }
    },
    [api, activeSession]
  )

  const handleSend = useCallback(async () => {
    if (!api?.code || !activeSession || !input.trim()) return
    const text = input.trim()
    setInput('')
    setTranscript((current) => [
      ...current,
      { id: noteId(), role: 'user', text, createdAt: Date.now() }
    ])
    setStream({ ...EMPTY_STREAM, busy: true })
    const result = await api.code.prompt({ sessionId: activeSession.id, text })
    if (!result.success) {
      setError(result.error)
      setStream((current) => ({ ...current, busy: false, error: result.error }))
    }
  }, [api, activeSession, input])

  const handleStop = useCallback(async () => {
    if (!api?.code || !activeSession) return
    await api.code.interrupt(activeSession.id)
    setStream((current) => ({ ...current, busy: false }))
  }, [api, activeSession])

  const handlePermission = useCallback(
    async (request: CodePermissionRequest, reply: 'once' | 'always' | 'reject') => {
      if (!api?.code) return
      const result = await api.code.replyPermission({
        sessionId: request.sessionId,
        requestId: request.id,
        reply
      })
      if (result.success) {
        setPermissions((current) => current.filter((item) => item.id !== request.id))
      } else {
        setError(result.error)
      }
    },
    [api]
  )

  const handleModelChange = useCallback(
    async (value: string) => {
      setSelectedModel(value)
      if (activeSession && api?.code) {
        const ref = parseModelSelector(value)
        if (ref.id) {
          await api.code.switchModel({ sessionId: activeSession.id, model: ref })
        }
      }
    },
    [api, activeSession]
  )

  const totalDiff = useMemo(
    () => ({
      additions: diffs.reduce((sum, diff) => sum + diff.additions, 0),
      deletions: diffs.reduce((sum, diff) => sum + diff.deletions, 0)
    }),
    [diffs]
  )

  const hasKey = status?.hasApiKey === true
  const ready = status?.ready === true

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-950/95 text-neutral-200">
      <header
        className="flex items-center gap-3 border-b border-neutral-800/70 px-4 py-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-100">
          <CodeIcon />
          <span>Covenant Code</span>
        </div>
        <div className="ml-2 flex items-center gap-2 text-xs text-neutral-400">
          {ready ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              OpenCode {status?.version ?? ''}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <SpinnerIcon /> Not connected
            </span>
          )}
          {!hasKey && <span className="text-amber-400">No Go API key</span>}
        </div>
        <div className="ml-auto flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <select
            value={selectedModel}
            onChange={(event) => void handleModelChange(event.target.value)}
            className="max-w-[220px] rounded-md border border-neutral-700/70 bg-neutral-900/80 px-2 py-1 text-xs text-neutral-200"
          >
            {models.length === 0 && <option value="">No models</option>}
            {models.map((model) => (
              <option key={`${model.providerID}/${model.id}`} value={`${model.providerID}/${model.id}`}>
                {model.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => window.api?.window.openSettings('code')}
            className="rounded-md border border-neutral-700/70 px-2 py-1 text-xs hover:bg-neutral-800/70"
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="rounded-md border border-neutral-700/70 px-2 py-1 text-xs hover:bg-neutral-800/70"
          >
            <XIcon />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-800/70">
          <div className="flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-neutral-500">
            <span>Projects</span>
            <button type="button" onClick={() => void handleAddProject()} className="hover:text-neutral-200">
              +
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            {projects.length === 0 && (
              <p className="px-2 py-2 text-xs text-neutral-500">Add a project folder to begin.</p>
            )}
            {projects.map((project) => (
              <div
                key={project.id}
                className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                  activeProject?.id === project.id ? 'bg-neutral-800/80 text-neutral-100' : 'hover:bg-neutral-800/50'
                }`}
              >
                <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setActiveProject(project)}>
                  {project.name}
                </button>
                <button
                  type="button"
                  className="opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                  onClick={() => void handleRemoveProject(project)}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-neutral-800/70 px-3 py-2 text-xs uppercase tracking-wide text-neutral-500">
            <span>Sessions</span>
            <button
              type="button"
              onClick={() => void handleCreateSession()}
              disabled={!activeProject}
              className="disabled:opacity-40 hover:text-neutral-200"
            >
              New
            </button>
          </div>
          <div className="h-56 overflow-y-auto px-2 pb-2">
            {loadingSessions && <p className="px-2 py-1 text-xs text-neutral-500">Loading…</p>}
            {!loadingSessions && sessions.length === 0 && (
              <p className="px-2 py-1 text-xs text-neutral-500">No sessions yet.</p>
            )}
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                  activeSession?.id === session.id ? 'bg-neutral-800/80 text-neutral-100' : 'hover:bg-neutral-800/50'
                }`}
              >
                <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => void handleSelectSession(session)}>
                  {session.title}
                </button>
                <button
                  type="button"
                  className="opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                  onClick={() => void handleDeleteSession(session)}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {error && (
            <div className="mx-4 mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {!activeSession && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-neutral-500">
              <CodeIcon />
              <p className="text-sm">
                {hasKey
                  ? 'Select or create a session to start coding.'
                  : 'Add your OpenCode Go API key in Settings → Code.'}
              </p>
              {!hasKey && (
                <button
                  type="button"
                  onClick={() => window.api?.window.openSettings('code')}
                  className="rounded-md border border-neutral-700/70 px-3 py-1 text-xs hover:bg-neutral-800/70"
                >
                  Open Settings
                </button>
              )}
            </div>
          )}

          {activeSession && (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {transcript.map((item) => (
                  <TranscriptBlock key={item.id} item={item} />
                ))}
                {(stream.text || stream.reasoning || stream.tools.length > 0 || stream.notes.length > 0) && (
                  <StreamBlock stream={stream} />
                )}
                {stream.busy && !stream.text && (
                  <div className="flex items-center gap-2 py-2 text-xs text-neutral-500">
                    <SpinnerIcon /> Working…
                  </div>
                )}
              </div>

              <div className="border-t border-neutral-800/70 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        void handleSend()
                      }
                    }}
                    placeholder="Ask Covenant Code to change something…"
                    rows={2}
                    className="max-h-40 min-h-[44px] flex-1 resize-y rounded-md border border-neutral-700/70 bg-neutral-900/80 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
                  />
                  {stream.busy ? (
                    <button
                      type="button"
                      onClick={() => void handleStop()}
                      className="flex items-center gap-1 rounded-md border border-neutral-700/70 px-3 py-2 text-sm hover:bg-neutral-800/70"
                    >
                      <StopIcon /> Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={!input.trim()}
                      className="flex items-center gap-1 rounded-md border border-neutral-700/70 px-3 py-2 text-sm disabled:opacity-40 hover:bg-neutral-800/70"
                    >
                      <SendIcon /> Send
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </main>

        <aside className="flex w-72 shrink-0 flex-col border-l border-neutral-800/70">
          <div className="flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-neutral-500">
            <span>Changes</span>
            {diffs.length > 0 && (
              <span className="text-[11px] text-neutral-400">
                <span className="text-emerald-400">+{totalDiff.additions}</span>{' '}
                <span className="text-red-400">-{totalDiff.deletions}</span>
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {diffs.length === 0 && <p className="px-2 py-1 text-xs text-neutral-500">No file changes yet.</p>}
            {diffs.map((diff) => (
              <div key={diff.file} className="mb-1 rounded-md border border-neutral-800/60 px-2 py-1.5 text-xs">
                <div className="truncate text-neutral-300" title={diff.file}>
                  {diff.file}
                </div>
                <div className="text-[11px] text-neutral-500">
                  <span className="text-emerald-400">+{diff.additions}</span>{' '}
                  <span className="text-red-400">-{diff.deletions}</span>
                  {diff.status ? ` · ${diff.status}` : ''}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {permissions.map((request) => (
          <PermissionPrompt
            key={request.id}
            request={request}
            onReply={(reply) => void handlePermission(request, reply)}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

function TranscriptBlock({ item }: { item: CodeTranscriptItem }): JSX.Element {
  if (item.role === 'user') {
    return (
      <div className="mb-3 flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-neutral-800/70 px-3 py-2 text-sm text-neutral-100 whitespace-pre-wrap">
          {item.text}
        </div>
      </div>
    )
  }
  return (
    <div className="mb-4 space-y-2">
      {item.reasoning && <ReasoningBlock text={item.reasoning} />}
      {item.text && <AssistantMarkdown content={item.text} />}
      {item.tools?.map((tool) => (
        <ToolBlock
          key={tool.callId}
          tool={{
            callId: tool.callId,
            name: tool.name,
            status: tool.status === 'pending' ? 'running' : tool.status,
            output: tool.output,
            error: tool.error
          }}
        />
      ))}
      {item.error && <p className="text-xs text-red-400">{item.error}</p>}
    </div>
  )
}

function StreamBlock({ stream }: { stream: StreamingState }): JSX.Element {
  return (
    <div className="mb-4 space-y-2">
      {stream.reasoning && <ReasoningBlock text={stream.reasoning} />}
      {stream.text && <AssistantMarkdown content={stream.text} />}
      {stream.tools.map((tool) => (
        <ToolBlock key={tool.callId} tool={tool} />
      ))}
      {stream.notes.map((note) => (
        <p
          key={note.id}
          className={`text-xs ${
            note.tone === 'error'
              ? 'text-red-400'
              : note.tone === 'file'
                ? 'text-sky-400'
                : note.tone === 'shell'
                  ? 'text-amber-300'
                  : 'text-neutral-400'
          }`}
        >
          {note.text}
        </p>
      ))}
      {stream.error && <p className="text-xs text-red-400">{stream.error}</p>}
    </div>
  )
}

function ReasoningBlock({ text }: { text: string }): JSX.Element {
  return (
    <details className="rounded-md border border-neutral-800/60 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-400">
      <summary className="cursor-pointer select-none">Reasoning</summary>
      <p className="mt-1 whitespace-pre-wrap">{text}</p>
    </details>
  )
}

function ToolBlock({ tool }: { tool: ToolCard }): JSX.Element {
  const tone =
    tool.status === 'error' ? 'border-red-500/40' : tool.status === 'completed' ? 'border-emerald-500/30' : 'border-neutral-700/60'
  return (
    <details className={`rounded-md border ${tone} bg-neutral-900/40 px-3 py-2 text-xs`}>
      <summary className="flex cursor-pointer select-none items-center gap-2">
        {tool.status === 'running' && <SpinnerIcon />}
        <span className="text-neutral-300">{tool.name || 'tool'}</span>
        <span className="text-neutral-500">{tool.status}</span>
      </summary>
      {tool.output && <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap text-neutral-400">{tool.output}</pre>}
      {tool.error && <p className="mt-1 text-red-400">{tool.error}</p>}
    </details>
  )
}

function PermissionPrompt({
  request,
  onReply
}: {
  request: CodePermissionRequest
  onReply: (reply: 'once' | 'always' | 'reject') => void
}): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="w-[440px] rounded-xl border border-neutral-700/70 bg-neutral-900 p-4 text-sm shadow-xl"
      >
        <h3 className="mb-1 font-medium text-neutral-100">Permission requested</h3>
        <p className="mb-2 text-xs text-neutral-400">
          OpenCode wants to <span className="text-neutral-200">{request.action}</span>:
        </p>
        <ul className="mb-4 max-h-40 space-y-1 overflow-auto rounded-md bg-neutral-950/60 p-2 text-xs text-neutral-300">
          {request.resources.length === 0 && <li>—</li>}
          {request.resources.map((resource) => (
            <li key={resource} className="truncate" title={resource}>
              {resource}
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onReply('reject')}
            className="rounded-md border border-neutral-700/70 px-3 py-1 text-xs hover:bg-neutral-800/70"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={() => onReply('always')}
            className="rounded-md border border-neutral-700/70 px-3 py-1 text-xs hover:bg-neutral-800/70"
          >
            Always allow
          </button>
          <button
            type="button"
            onClick={() => onReply('once')}
            className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
          >
            Allow once
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function applyActivity(current: StreamingState, activity: import('../../shared/code/code').CodeActivityEvent): StreamingState {
  switch (activity.type) {
    case 'text-delta':
      return { ...current, busy: true, text: current.text + (activity.delta ?? '') }
    case 'text-end':
      return { ...current, text: activity.text ?? current.text }
    case 'reasoning-delta':
      return { ...current, busy: true, reasoning: current.reasoning + (activity.delta ?? '') }
    case 'reasoning-end':
      return { ...current, reasoning: activity.text ?? current.reasoning }
    case 'tool-input': {
      if (!activity.callId) return current
      const tools = upsertTool(current.tools, activity.callId, { name: activity.toolName })
      return { ...current, tools }
    }
    case 'tool-called': {
      if (!activity.callId) return current
      const tools = upsertTool(current.tools, activity.callId, { name: activity.toolName, status: 'running' })
      return { ...current, tools }
    }
    case 'tool-success': {
      if (!activity.callId) return current
      const tools = upsertTool(current.tools, activity.callId, { status: 'completed', output: activity.output })
      return { ...current, tools }
    }
    case 'tool-failed': {
      if (!activity.callId) return current
      const tools = upsertTool(current.tools, activity.callId, { status: 'error', error: activity.error })
      return { ...current, tools }
    }
    case 'shell-started':
      return { ...current, busy: true, notes: [...current.notes, { id: noteId(), text: `$ ${activity.command ?? ''}`, tone: 'shell' }] }
    case 'shell-ended':
      return {
        ...current,
        notes: [...current.notes, { id: noteId(), text: activity.output ?? '', tone: 'shell' }]
      }
    case 'file-edited':
      return { ...current, notes: [...current.notes, { id: noteId(), text: `Edited ${activity.file ?? ''}`, tone: 'file' }] }
    case 'step-ended':
      return { ...current, busy: current.busy }
    case 'status':
      return { ...current, busy: activity.status === 'busy' || activity.status === 'retry' }
    case 'error':
      return { ...current, busy: false, error: activity.error }
    case 'done':
      return { ...current, busy: false }
    default:
      return current
  }
}

function upsertTool(tools: ToolCard[], callId: string, patch: Partial<ToolCard>): ToolCard[] {
  const idx = tools.findIndex((tool) => tool.callId === callId)
  if (idx < 0) {
    return [...tools, { callId, name: patch.name ?? 'tool', status: patch.status ?? 'running', ...patch }]
  }
  const next = [...tools]
  next[idx] = { ...next[idx], ...patch }
  return next
}
