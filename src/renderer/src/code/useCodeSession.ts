import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CodeActivityEvent,
  CodeEngineEvent,
  CodeFileDiff,
  CodeModel,
  CodePermissionRequest,
  CodeProject,
  CodeSession,
  CodeTranscriptItem
} from '../../../shared/code/code'
import { parseModelSelector } from '../../../shared/code/codeNormalizers'
import { EMPTY_STREAM, noteId, type CodeStatusWithKey, type StreamingState, type ToolCard } from './types'

/**
 * Owns all Covenant Code / OpenCode state for the in-window surface. The heavy
 * work (runtime connect, model/session listing, event subscription) is deferred
 * until `enable()` is called so opening Covenant never starts the runtime.
 */
export function useCodeSession(): {
  status: CodeStatusWithKey | null
  projects: CodeProject[]
  activeProject: CodeProject | null
  sessions: CodeSession[]
  activeSession: CodeSession | null
  models: CodeModel[]
  selectedModel: string
  transcript: CodeTranscriptItem[]
  stream: StreamingState
  permissions: CodePermissionRequest[]
  diffs: CodeFileDiff[]
  totals: { additions: number; deletions: number }
  error: string | null
  loadingSessions: boolean
  enable: () => Promise<void>
  addProject: () => Promise<void>
  removeProject: (project: CodeProject) => Promise<void>
  selectProject: (project: CodeProject) => void
  createSession: () => Promise<void>
  selectSession: (session: CodeSession) => Promise<void>
  deleteSession: (session: CodeSession) => Promise<void>
  changeModel: (value: string) => Promise<void>
  submit: (text: string) => Promise<void>
  stop: () => Promise<void>
  replyPermission: (request: CodePermissionRequest, reply: 'once' | 'always' | 'reject') => Promise<void>
  dismissError: () => void
} {
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
  const [error, setError] = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)

  const activeSessionRef = useRef<CodeSession | null>(null)
  const activeProjectRef = useRef<CodeProject | null>(null)
  const selectedModelRef = useRef('')
  const streamRef = useRef<StreamingState>(EMPTY_STREAM)
  const readyRef = useRef(false)
  const readyPromiseRef = useRef<Promise<void> | null>(null)

  activeSessionRef.current = activeSession
  activeProjectRef.current = activeProject
  selectedModelRef.current = selectedModel
  streamRef.current = stream

  const refreshStatus = useCallback(async () => {
    if (!api?.code) return
    const result = await api.code.getStatus()
    if (result.success) setStatus(result.status)
    else setError(result.error)
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

  const enable = useCallback(async () => {
    if (readyRef.current) return
    if (readyPromiseRef.current) return readyPromiseRef.current

    const run = async (): Promise<void> => {
      if (!api?.code) return
      api.code.subscribe()

      const projectsResult = await api.code.listProjects()
      let project = activeProjectRef.current
      if (projectsResult.success) {
        setProjects(projectsResult.projects)
        project = project ?? projectsResult.projects[0] ?? null
        setActiveProject(project)
      }

      const modelsResult = await api.code.listModels()
      if (modelsResult.success) {
        setModels(modelsResult.models)
        setSelectedModel(
          (current) =>
            current ||
            (modelsResult.models[0]
              ? `${modelsResult.models[0].providerID}/${modelsResult.models[0].id}`
              : '')
        )
      }

      if (project) {
        setLoadingSessions(true)
        const sessionsResult = await api.code.listSessions(project.directory)
        setLoadingSessions(false)
        if (sessionsResult.success) setSessions(sessionsResult.sessions)
        else setError(sessionsResult.error)
      }
      readyRef.current = true
    }

    const promise = run().finally(() => {
      readyPromiseRef.current = null
    })
    readyPromiseRef.current = promise
    return promise
  }, [api])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  // Keep sessions in sync when the user switches projects (after first enable).
  useEffect(() => {
    if (!readyRef.current || !activeProject) return
    void loadSessions(activeProject)
  }, [activeProject, loadSessions])

  const refreshDiffs = useCallback(
    async (sessionId: string) => {
      if (!api?.code || !sessionId) return
      const result = await api.code.getDiff(sessionId)
      if (result.success) setDiffs(result.diff)
    },
    [api]
  )

  useEffect(() => {
    if (!api?.code) return
    let diffTimer: number | null = null
    const scheduleDiffRefresh = (sessionId: string): void => {
      if (!sessionId) return
      if (diffTimer !== null) window.clearTimeout(diffTimer)
      diffTimer = window.setTimeout(() => {
        void refreshDiffs(sessionId)
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
        if (!activeSessionRef.current || event.sessionId === activeSessionRef.current.id) {
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
        setActiveSession((current) =>
          current && current.id === event.session.id ? event.session : current
        )
        return
      }

      const activity = event.event
      if (
        activeSessionRef.current &&
        activity.sessionId &&
        activity.sessionId !== activeSessionRef.current.id
      ) {
        return
      }

      if (activity.type === 'done') {
        const finished = streamRef.current
        if (finished.text || finished.reasoning || finished.tools.length > 0) {
          setTranscript((previous) => [...previous, finishedToTranscriptItem(finished)])
        }
        setStream(EMPTY_STREAM)
        scheduleDiffRefresh(activity.sessionId)
        void (async () => {
          const project = activeProjectRef.current
          if (!project) return
          const result = await api.code?.listSessions(project.directory)
          if (result?.success) {
            setSessions(result.sessions)
            setActiveSession((current) =>
              current ? result.sessions.find((session) => session.id === current.id) ?? current : current
            )
          }
        })()
        return
      }

      setStream((current) => applyActivity(current, activity))
      if (
        activity.type === 'file-edited' ||
        activity.type === 'tool-success' ||
        activity.type === 'tool-failed'
      ) {
        scheduleDiffRefresh(activity.sessionId)
      }
    })

    return () => {
      if (diffTimer !== null) window.clearTimeout(diffTimer)
      unsubscribe()
    }
  }, [api, refreshDiffs])

  const addProject = useCallback(async () => {
    if (!api?.code) return
    const picked = await api.code.pickDirectory()
    if (!picked.success || !picked.directory) return
    await enable()
    const result = await api.code.addProject(picked.directory)
    if (result.success) {
      setProjects(result.projects)
      const created = result.projects.find((project) => project.directory === picked.directory)
      if (created) setActiveProject(created)
    } else {
      setError(result.error)
    }
  }, [api, enable])

  const removeProject = useCallback(
    async (project: CodeProject) => {
      if (!api?.code) return
      const result = await api.code.removeProject(project.id)
      if (result.success) {
        setProjects(result.projects)
        setActiveProject((current) =>
          current?.id === project.id ? result.projects[0] ?? null : current
        )
      }
    },
    [api]
  )

  const createSession = useCallback(async () => {
    if (!api?.code) return
    await enable()
    const project = activeProjectRef.current
    if (!project) {
      setError('Add a project folder to start coding.')
      return
    }
    const ref = parseModelSelector(selectedModelRef.current)
    const result = await api.code.createSession({
      directory: project.directory,
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
  }, [api, enable])

  const selectSession = useCallback(
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

  const deleteSession = useCallback(
    async (session: CodeSession) => {
      if (!api?.code) return
      const result = await api.code.deleteSession(session.id)
      if (result.success) {
        setSessions((current) => current.filter((item) => item.id !== session.id))
        if (activeSessionRef.current?.id === session.id) {
          setActiveSession(null)
          setTranscript([])
          setDiffs([])
        }
      }
    },
    [api]
  )

  const changeModel = useCallback(
    async (value: string) => {
      setSelectedModel(value)
      const session = activeSessionRef.current
      if (session && api?.code) {
        const ref = parseModelSelector(value)
        if (ref.id) {
          await api.code.switchModel({ sessionId: session.id, model: ref })
        }
      }
    },
    [api]
  )

  const submit = useCallback(
    async (rawText: string) => {
      const text = rawText.trim()
      if (!text || !api?.code) return
      await enable()

      let session = activeSessionRef.current
      if (!session) {
        const project = activeProjectRef.current
        if (!project) {
          setError('Add a project folder to start coding.')
          return
        }
        const ref = parseModelSelector(selectedModelRef.current)
        const created = await api.code.createSession({
          directory: project.directory,
          model: ref.id ? ref : undefined
        })
        if (!created.success) {
          setError(created.error)
          return
        }
        session = created.session
        setSessions((current) => [created.session, ...current])
        setActiveSession(created.session)
        setTranscript([])
        setDiffs([])
      }

      setTranscript((current) => [
        ...current,
        { id: noteId(), role: 'user', text, createdAt: Date.now() }
      ])
      setStream({ ...EMPTY_STREAM, busy: true })
      const result = await api.code.prompt({ sessionId: session.id, text })
      if (!result.success) {
        setError(result.error)
        setStream((current) => ({ ...current, busy: false, error: result.error }))
      }
    },
    [api, enable]
  )

  const stop = useCallback(async () => {
    const session = activeSessionRef.current
    if (!api?.code || !session) return
    await api.code.interrupt(session.id)
    setStream((current) => ({ ...current, busy: false }))
  }, [api])

  const replyPermission = useCallback(
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

  const selectProject = useCallback((project: CodeProject) => setActiveProject(project), [])
  const dismissError = useCallback(() => setError(null), [])

  const totals = useMemo(
    () => ({
      additions: diffs.reduce((sum, diff) => sum + diff.additions, 0),
      deletions: diffs.reduce((sum, diff) => sum + diff.deletions, 0)
    }),
    [diffs]
  )

  return {
    status,
    projects,
    activeProject,
    sessions,
    activeSession,
    models,
    selectedModel,
    transcript,
    stream,
    permissions,
    diffs,
    totals,
    error,
    loadingSessions,
    enable,
    addProject,
    removeProject,
    selectProject,
    createSession,
    selectSession,
    deleteSession,
    changeModel,
    submit,
    stop,
    replyPermission,
    dismissError
  }
}

function finishedToTranscriptItem(stream: StreamingState): CodeTranscriptItem {
  return {
    id: noteId(),
    role: 'assistant',
    text: stream.text,
    reasoning: stream.reasoning || undefined,
    tools: stream.tools.map((tool) => ({
      callId: tool.callId,
      name: tool.name,
      status: tool.status === 'running' ? 'completed' : tool.status,
      output: tool.output,
      error: tool.error
    })),
    createdAt: Date.now()
  }
}

function applyActivity(current: StreamingState, activity: CodeActivityEvent): StreamingState {
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
      const tools = upsertTool(current.tools, activity.callId, {
        name: activity.toolName,
        status: 'running'
      })
      return { ...current, tools }
    }
    case 'tool-success': {
      if (!activity.callId) return current
      const tools = upsertTool(current.tools, activity.callId, {
        status: 'completed',
        output: activity.output
      })
      return { ...current, tools }
    }
    case 'tool-failed': {
      if (!activity.callId) return current
      const tools = upsertTool(current.tools, activity.callId, {
        status: 'error',
        error: activity.error
      })
      return { ...current, tools }
    }
    case 'shell-started':
      return {
        ...current,
        busy: true,
        notes: [...current.notes, { id: noteId(), text: `$ ${activity.command ?? ''}`, tone: 'shell' }]
      }
    case 'shell-ended':
      return {
        ...current,
        notes: [...current.notes, { id: noteId(), text: activity.output ?? '', tone: 'shell' }]
      }
    case 'file-edited':
      return {
        ...current,
        notes: [...current.notes, { id: noteId(), text: `Edited ${activity.file ?? ''}`, tone: 'file' }]
      }
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
