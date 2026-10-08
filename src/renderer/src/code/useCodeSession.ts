import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CodeActivityEvent,
  CodeAgent,
  CodeEngineEvent,
  CodeFileDiff,
  CodeFormRequest,
  CodeFormValue,
  CodeModel,
  CodePermissionRequest,
  CodeProject,
  CodeRuntimeProgress,
  CodeSession,
  CodeTranscriptItem,
  CodeUsage
} from '../../../shared/code/code'
import { parseModelSelector } from '../../../shared/code/codeNormalizers'
import type { CodeConnection } from '../../../shared/code/connection'
import { isLocalConnectionId } from '../../../shared/code/connection'
import { EMPTY_STREAM, noteId, type CodeStatusWithKey, type StreamingState, type ToolCard } from './types'

/**
 * Owns all Covenant Code / OpenCode state for the in-window surface. The heavy
 * work (runtime connect, model/session listing, event subscription) is deferred
 * until `enable()` is called so opening Covenant never starts the runtime.
 */
export function useCodeSession(): {
  status: CodeStatusWithKey | null
  runtimeProgress: CodeRuntimeProgress | null
  connections: CodeConnection[]
  activeConnection: CodeConnection | null
  activeConnectionId: string
  projects: CodeProject[]
  activeProject: CodeProject | null
  sessions: CodeSession[]
  activeSession: CodeSession | null
  models: CodeModel[]
  selectedModel: string
  agents: CodeAgent[]
  selectedAgent: string
  selectedVariant: string
  activeVariants: string[]
  transcript: CodeTranscriptItem[]
  stream: StreamingState
  usage: CodeUsage | null
  liveCost: number | null
  permissions: CodePermissionRequest[]
  forms: CodeFormRequest[]
  diffs: CodeFileDiff[]
  totals: { additions: number; deletions: number }
  error: string | null
  loadingSessions: boolean
  enable: () => Promise<void>
  retryRuntime: () => Promise<void>
  addProject: () => Promise<void>
  addRemoteProject: (directory: string) => Promise<void>
  switchConnection: (connectionId: string) => Promise<void>
  refreshConnections: () => Promise<void>
  removeProject: (project: CodeProject) => Promise<void>
  selectProject: (project: CodeProject) => void
  createSession: () => Promise<void>
  selectSession: (session: CodeSession) => Promise<void>
  deleteSession: (session: CodeSession) => Promise<void>
  changeModel: (value: string) => Promise<void>
  changeAgent: (value: string) => Promise<void>
  toggleMode: () => void
  changeVariant: (value: string) => void
  submit: (text: string) => Promise<void>
  stop: () => Promise<void>
  replyPermission: (request: CodePermissionRequest, reply: 'once' | 'always' | 'reject') => Promise<void>
  replyForm: (form: CodeFormRequest, answer: Record<string, CodeFormValue>) => Promise<void>
  cancelForm: (form: CodeFormRequest, message?: string) => Promise<void>
  dismissError: () => void
} {
  const api = window.api
  const [status, setStatus] = useState<CodeStatusWithKey | null>(null)
  const [runtimeProgress, setRuntimeProgress] = useState<CodeRuntimeProgress | null>(null)
  const [connections, setConnections] = useState<CodeConnection[]>([])
  const [activeConnectionId, setActiveConnectionId] = useState<string>('local')
  const [projects, setProjects] = useState<CodeProject[]>([])
  const [activeProject, setActiveProject] = useState<CodeProject | null>(null)
  const [sessions, setSessions] = useState<CodeSession[]>([])
  const [activeSession, setActiveSession] = useState<CodeSession | null>(null)
  const [models, setModels] = useState<CodeModel[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [agents, setAgents] = useState<CodeAgent[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')
  const [selectedVariant, setSelectedVariant] = useState('')
  const [transcript, setTranscript] = useState<CodeTranscriptItem[]>([])
  const [stream, setStream] = useState<StreamingState>(EMPTY_STREAM)
  const [usage, setUsage] = useState<CodeUsage | null>(null)
  const [liveCost, setLiveCost] = useState<number | null>(null)
  const [permissions, setPermissions] = useState<CodePermissionRequest[]>([])
  const [forms, setForms] = useState<CodeFormRequest[]>([])
  const [diffs, setDiffs] = useState<CodeFileDiff[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)

  const activeSessionRef = useRef<CodeSession | null>(null)
  const activeConnectionIdRef = useRef<string>('local')
  const activeProjectRef = useRef<CodeProject | null>(null)
  const selectedModelRef = useRef('')
  const selectedAgentRef = useRef('')
  const selectedVariantRef = useRef('')
  const modelsRef = useRef<CodeModel[]>([])
  const agentsRef = useRef<CodeAgent[]>([])
  const streamRef = useRef<StreamingState>(EMPTY_STREAM)
  const readyRef = useRef(false)
  const readyPromiseRef = useRef<Promise<void> | null>(null)

  activeSessionRef.current = activeSession
  activeConnectionIdRef.current = activeConnectionId
  activeProjectRef.current = activeProject
  selectedModelRef.current = selectedModel
  selectedAgentRef.current = selectedAgent
  selectedVariantRef.current = selectedVariant
  modelsRef.current = models
  agentsRef.current = agents
  streamRef.current = stream

  const currentModelRef = useCallback((): { providerID: string; id: string; variant?: string } | undefined => {
    const ref = parseModelSelector(selectedModelRef.current)
    if (!ref.id) return undefined
    const model = modelsRef.current.find(
      (entry) => `${entry.providerID}/${entry.id}` === selectedModelRef.current
    )
    const variant =
      model && model.variants.includes(selectedVariantRef.current)
        ? selectedVariantRef.current
        : undefined
    return { providerID: ref.providerID, id: ref.id, variant }
  }, [])

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

      const connectionsResult = await api.code.listConnections()
      let connectionId = activeConnectionIdRef.current
      if (connectionsResult.success) {
        setConnections(connectionsResult.connections)
        connectionId = connectionsResult.activeConnectionId || connectionId
        setActiveConnectionId(connectionId)
        activeConnectionIdRef.current = connectionId
      }

      const projectsResult = await api.code.listProjects()
      let project = activeProjectRef.current
      if (projectsResult.success) {
        const scoped = projectsResult.projects.filter(
          (item) => item.connectionId === connectionId
        )
        setProjects(scoped)
        project = project && project.connectionId === connectionId ? project : scoped[0] ?? null
        setActiveProject(project)
        activeProjectRef.current = project
      }

      const [modelsResult, settingsResult, agentsResult] = await Promise.all([
        api.code.listModels(),
        api.code.getSettings(),
        api.code.listAgents()
      ])
      const settings = settingsResult.success ? settingsResult.settings : null
      const defaultModel = settings?.defaultModel ?? ''
      const defaultVariant = settings?.defaultVariant ?? ''

      if (modelsResult.success) {
        setModels(modelsResult.models)
        setSelectedModel((current) => {
          if (current) return current
          if (defaultModel) return defaultModel
          const first = modelsResult.models[0]
          return first ? `${first.providerID}/${first.id}` : ''
        })
      } else if (defaultModel) {
        setSelectedModel((current) => current || defaultModel)
      }
      if (defaultVariant) {
        setSelectedVariant((current) => current || defaultVariant)
      }

      const listedAgents = (agentsResult.success ? agentsResult.agents : []).filter(
        (agent) => !agent.hidden && (agent.mode === 'primary' || agent.mode === 'all')
      )
      // OpenCode always exposes the `build` and `plan` primary agents, but the
      // catalog can come back empty before the runtime is warm — fall back to
      // them so the Plan/Build toggle is always available.
      const usableAgents: CodeAgent[] =
        listedAgents.length > 0
          ? listedAgents
          : [
              { id: 'build', name: 'Build', mode: 'primary', hidden: false },
              { id: 'plan', name: 'Plan', mode: 'primary', hidden: false }
            ]
      setAgents(usableAgents)
      const preferred = usableAgents.find((agent) => agent.id === 'build') ?? usableAgents[0]
      setSelectedAgent((current) => current || preferred?.id || '')

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
      if (event.kind === 'progress') {
        setRuntimeProgress(event.progress.phase === 'ready' ? null : event.progress)
        return
      }
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
      if (event.kind === 'form') {
        const form = event.form
        const active = activeSessionRef.current
        if (active && form.sessionId && form.sessionId !== active.id) return
        setForms((current) =>
          current.some((item) => item.id === form.id) ? current : [...current, form]
        )
        return
      }
      if (event.kind === 'form-settled') {
        setForms((current) => current.filter((item) => item.id !== event.formId))
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

      if (activity.type === 'step-ended' && activity.usage) {
        setUsage(activity.usage)
      }

      if (activity.type === 'usage') {
        if (activity.usage) {
          setUsage(activity.usage)
          if (typeof activity.usage.cost === 'number') setLiveCost(activity.usage.cost)
        }
        return
      }

      if (activity.type === 'model-selected') {
        if (activity.model) {
          setSelectedModel(`${activity.model.providerID}/${activity.model.id}`)
          setSelectedVariant(activity.model.variant ?? '')
        }
        return
      }

      if (activity.type === 'agent-selected') {
        if (activity.agent) {
          setSelectedAgent(activity.agent)
          setStream((current) => ({ ...current, agent: activity.agent }))
        }
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
        // `filesystem.changed` carries no session id — fall back to the active one.
        scheduleDiffRefresh(activity.sessionId || activeSessionRef.current?.id || '')
      }
    })

    return () => {
      if (diffTimer !== null) window.clearTimeout(diffTimer)
      unsubscribe()
    }
  }, [api, refreshDiffs])

  const retryRuntime = useCallback(async () => {
    if (!api?.code) return
    setRuntimeProgress(null)
    const result = await api.code.restartRuntime()
    if (!result.success) setError(result.error)
    readyRef.current = false
    await enable()
  }, [api, enable])

  const addProject = useCallback(async () => {
    if (!api?.code) return
    const connectionId = activeConnectionIdRef.current
    // Remote folders are chosen through the SFTP browser.
    if (!isLocalConnectionId(connectionId)) return
    const picked = await api.code.pickDirectory()
    if (!picked.success || !picked.directory) return
    const result = await api.code.addProject(picked.directory, undefined, connectionId)
    if (result.success) {
      const scoped = result.projects.filter((project) => project.connectionId === connectionId)
      setProjects(scoped)
      const created = scoped.find((project) => project.directory === picked.directory)
      if (created) {
        setActiveProject(created)
        activeProjectRef.current = created
      }
    } else {
      setError(result.error)
    }
  }, [api])

  const addRemoteProject = useCallback(
    async (directory: string) => {
      if (!api?.code) return
      const connectionId = activeConnectionIdRef.current
      if (isLocalConnectionId(connectionId)) return
      const result = await api.code.addProject(directory, undefined, connectionId)
      if (result.success) {
        const scoped = result.projects.filter((project) => project.connectionId === connectionId)
        setProjects(scoped)
        const created = scoped.find((project) => project.directory === directory)
        if (created) {
          setActiveProject(created)
          activeProjectRef.current = created
        }
      } else {
        setError(result.error)
      }
    },
    [api]
  )

  const refreshConnections = useCallback(async () => {
    if (!api?.code) return
    const result = await api.code.listConnections()
    if (result.success) {
      setConnections(result.connections)
      setActiveConnectionId(result.activeConnectionId)
      activeConnectionIdRef.current = result.activeConnectionId
    }
  }, [api])

  const switchConnection = useCallback(
    async (connectionId: string) => {
      if (!api?.code || connectionId === activeConnectionIdRef.current) return
      const result = await api.code.selectConnection(connectionId)
      if (!result.success) {
        setError(result.error)
        return
      }
      setActiveConnectionId(connectionId)
      activeConnectionIdRef.current = connectionId
      setActiveSession(null)
      activeSessionRef.current = null
      setActiveProject(null)
      activeProjectRef.current = null
      setProjects([])
      setSessions([])
      setTranscript([])
      setStream(EMPTY_STREAM)
      setUsage(null)
      setLiveCost(null)
      setDiffs([])
      setPermissions([])
      setForms([])
      setRuntimeProgress(null)
      setError(null)
      void refreshStatus()
      readyRef.current = false
      await enable()
    },
    [api, enable, refreshStatus]
  )

  const removeProject = useCallback(
    async (project: CodeProject) => {
      if (!api?.code) return
      const connectionId = activeConnectionIdRef.current
      const result = await api.code.removeProject(project.id)
      if (result.success) {
        // Only ever surface projects from the machine that is still active, and
        // never auto-switch to a project that lives on a different machine.
        const scoped = result.projects.filter((item) => item.connectionId === connectionId)
        setProjects(scoped)
        if (activeProjectRef.current?.id === project.id) {
          const next = scoped[0] ?? null
          activeProjectRef.current = next
          setActiveProject(next)
        }
      } else {
        setError(result.error)
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
    const result = await api.code.createSession({
      directory: project.directory,
      model: currentModelRef(),
      agent: selectedAgentRef.current || undefined
    })
    if (result.success) {
      setSessions((current) => [result.session, ...current])
      setActiveSession(result.session)
      setTranscript([])
      setStream(EMPTY_STREAM)
      setUsage(null)
      setLiveCost(null)
      setDiffs([])
      setPermissions([])
      setForms([])
    } else {
      setError(result.error)
    }
  }, [api, enable, currentModelRef])

  const selectSession = useCallback(
    async (session: CodeSession) => {
      if (!api?.code) return
      setActiveSession(session)
      setStream(EMPTY_STREAM)
      setUsage(null)
      setLiveCost(null)
      setPermissions([])
      setForms([])
      setError(null)
      if (session.agent) setSelectedAgent(session.agent)
      if (session.model) {
        setSelectedModel(`${session.model.providerID}/${session.model.id}`)
        setSelectedVariant(session.model.variant ?? '')
      }
      const [transcriptResult, diffResult, permissionResult, formResult] = await Promise.all([
        api.code.getTranscript(session.id),
        api.code.getDiff(session.id),
        api.code.listPermissions(session.id),
        api.code.listForms(session.id)
      ])
      const transcript = transcriptResult.success ? transcriptResult.transcript : []
      setTranscript(transcript)
      // Restore the context meter from the last turn's recorded token usage so
      // reopening a session doesn't show an empty context after a restart.
      const restoredUsage = [...transcript].reverse().find((item) => item.usage)?.usage ?? null
      if (restoredUsage) setUsage(restoredUsage)
      setDiffs(diffResult.success ? diffResult.diff : [])
      setPermissions(permissionResult.success ? permissionResult.requests : [])
      setForms(formResult.success ? formResult.forms : [])
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
      // Remember the choice so the next session uses the same model.
      void api?.code?.setSettings({ defaultModel: value })

      const model = modelsRef.current.find((entry) => `${entry.providerID}/${entry.id}` === value)
      const variant = model?.variants.includes(selectedVariantRef.current)
        ? selectedVariantRef.current
        : ''
      if (variant !== selectedVariantRef.current) setSelectedVariant(variant)

      const session = activeSessionRef.current
      const ref = parseModelSelector(value)
      if (session && api?.code && ref.id) {
        await api.code.switchModel({
          sessionId: session.id,
          model: { providerID: ref.providerID, id: ref.id, variant: variant || undefined }
        })
      }
    },
    [api]
  )

  const changeAgent = useCallback(
    async (value: string) => {
      setSelectedAgent(value)
      const session = activeSessionRef.current
      if (session && api?.code) {
        await api.code.switchAgent({ sessionId: session.id, agent: value })
      }
    },
    [api]
  )

  const toggleMode = useCallback(() => {
    const list = agentsRef.current.filter(
      (agent) => !agent.hidden && (agent.mode === 'primary' || agent.mode === 'all')
    )
    if (list.length < 2) return
    const index = list.findIndex((agent) => agent.id === selectedAgentRef.current)
    const next = list[(index + 1) % list.length]
    if (next && next.id !== selectedAgentRef.current) {
      void changeAgent(next.id)
    }
  }, [changeAgent])

  const changeVariant = useCallback(
    (value: string) => {
      setSelectedVariant(value)
      void api?.code?.setSettings({ defaultVariant: value })
      const session = activeSessionRef.current
      const ref = parseModelSelector(selectedModelRef.current)
      if (session && api?.code && ref.id) {
        void api.code.switchModel({
          sessionId: session.id,
          model: { providerID: ref.providerID, id: ref.id, variant: value || undefined }
        })
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
        const created = await api.code.createSession({
          directory: project.directory,
          model: currentModelRef(),
          agent: selectedAgentRef.current || undefined
        })
        if (!created.success) {
          setError(created.error)
          return
        }
        session = created.session
        setSessions((current) => [created.session, ...current])
        setActiveSession(created.session)
        setTranscript([])
        setUsage(null)
        setLiveCost(null)
        setDiffs([])
        setForms([])
      }

      setTranscript((current) => [
        ...current,
        { id: noteId(), role: 'user', text, createdAt: Date.now() }
      ])
      setStream({ ...EMPTY_STREAM, busy: true, agent: selectedAgentRef.current || undefined })
      const result = await api.code.prompt({ sessionId: session.id, text })
      if (!result.success) {
        setError(result.error)
        setStream((current) => ({ ...current, busy: false, error: result.error }))
      }
    },
    [api, enable, currentModelRef]
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

  const replyForm = useCallback(
    async (form: CodeFormRequest, answer: Record<string, CodeFormValue>) => {
      if (!api?.code) return
      const result = await api.code.replyForm({ sessionId: form.sessionId, formId: form.id, answer })
      if (result.success) {
        setForms((current) => current.filter((item) => item.id !== form.id))
      } else {
        setError(result.error)
      }
    },
    [api]
  )

  const cancelForm = useCallback(
    async (form: CodeFormRequest, message?: string) => {
      if (!api?.code) return
      const result = await api.code.cancelForm({
        sessionId: form.sessionId,
        formId: form.id,
        message
      })
      if (result.success) {
        setForms((current) => current.filter((item) => item.id !== form.id))
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

  const activeVariants = useMemo(
    () =>
      models.find((model) => `${model.providerID}/${model.id}` === selectedModel)?.variants ?? [],
    [models, selectedModel]
  )

  const activeConnection = useMemo(
    () => connections.find((connection) => connection.id === activeConnectionId) ?? null,
    [connections, activeConnectionId]
  )

  return {
    status,
    runtimeProgress,
    connections,
    activeConnection,
    activeConnectionId,
    projects,
    activeProject,
    sessions,
    activeSession,
    models,
    selectedModel,
    agents,
    selectedAgent,
    selectedVariant,
    activeVariants,
    transcript,
    stream,
    usage,
    liveCost,
    permissions,
    forms,
    diffs,
    totals,
    error,
    loadingSessions,
    enable,
    retryRuntime,
    addProject,
    addRemoteProject,
    switchConnection,
    refreshConnections,
    removeProject,
    selectProject,
    createSession,
    selectSession,
    deleteSession,
    changeModel,
    changeAgent,
    toggleMode,
    changeVariant,
    submit,
    stop,
    replyPermission,
    replyForm,
    cancelForm,
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
      input: tool.input,
      output: tool.output,
      title: tool.title,
      error: tool.error
    })),
    agent: stream.agent,
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
      const patch: Partial<ToolCard> = {}
      if (activity.toolName) patch.name = activity.toolName
      if (activity.input) patch.input = activity.input
      if (Object.keys(patch).length === 0) return current
      const tools = upsertTool(current.tools, activity.callId, patch)
      return { ...current, tools }
    }
    case 'tool-called': {
      if (!activity.callId) return current
      const patch: Partial<ToolCard> = { status: 'running' }
      if (activity.toolName) patch.name = activity.toolName
      if (activity.input) patch.input = activity.input
      const tools = upsertTool(current.tools, activity.callId, patch)
      return { ...current, tools }
    }
    case 'tool-progress': {
      if (!activity.callId) return current
      const tools = upsertTool(current.tools, activity.callId, {
        status: 'running',
        metadata: activity.metadata
      })
      return { ...current, tools }
    }
    case 'tool-success': {
      if (!activity.callId) return current
      const tools = upsertTool(current.tools, activity.callId, {
        status: 'completed',
        output: activity.output,
        metadata: activity.metadata
      })
      return { ...current, tools }
    }
    case 'tool-failed': {
      if (!activity.callId) return current
      const tools = upsertTool(current.tools, activity.callId, {
        status: 'error',
        error: activity.error,
        output: activity.output,
        metadata: activity.metadata
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
    return [...tools, { callId, name: patch.name || 'tool', status: patch.status ?? 'running', ...patch }]
  }
  const next = [...tools]
  const merged = { ...next[idx], ...patch }
  // Never let an empty patch name clobber a known tool name.
  if (!merged.name) merged.name = next[idx].name || 'tool'
  next[idx] = merged
  return next
}
