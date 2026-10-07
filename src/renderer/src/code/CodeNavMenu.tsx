import { useEffect, useRef, useState } from 'react'
import type { CodeProject, CodeSession } from '../../../shared/code/code'
import { ChevronDownIcon, TrashIcon } from '../ui/icons'
import { FolderIcon, PlusIcon, SessionIcon } from './icons'

interface CodeNavMenuProps {
  projects: CodeProject[]
  activeProject: CodeProject | null
  onSelectProject: (project: CodeProject) => void
  onAddProject: () => void
  onDeleteProject: (project: CodeProject) => void
  sessions: CodeSession[]
  activeSession: CodeSession | null
  loadingSessions: boolean
  onSelectSession: (session: CodeSession) => void
  onCreateSession: () => void
  onDeleteSession: (session: CodeSession) => void
}

const ROW =
  'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors'

export default function CodeNavMenu({
  projects,
  activeProject,
  onSelectProject,
  onAddProject,
  onDeleteProject,
  sessions,
  activeSession,
  loadingSessions,
  onSelectSession,
  onCreateSession,
  onDeleteSession
}: CodeNavMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent): void => {
      if (containerRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const projectName = activeProject?.name ?? 'Select project'
  const label = projectName.length > 20 ? `${projectName.slice(0, 20)}…` : projectName

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex h-8 min-w-0 items-center gap-2 rounded-lg border px-2.5 text-xs transition-colors ${
          open
            ? 'border-white/20 bg-white/10 text-neutral-100'
            : 'border-white/10 text-neutral-200 hover:border-white/20 hover:bg-white/10'
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="shrink-0 text-neutral-400">
          <FolderIcon />
        </span>
        <span className="min-w-0 max-w-[200px] truncate">{label}</span>
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-30 w-80 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/95 shadow-xl shadow-black/50">
          <div className="max-h-72 overflow-y-auto p-1 chat-scrollbar">
            <div className="flex items-center justify-between px-2 pb-1 pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                Projects
              </span>
              <button
                type="button"
                onClick={onAddProject}
                className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
                aria-label="Add project folder"
                title="Add project folder"
              >
                <PlusIcon />
              </button>
            </div>
            {projects.length === 0 && (
              <p className="px-2 py-1 text-xs text-neutral-500">No projects yet.</p>
            )}
            {projects.map((project) => {
              const isActive = activeProject?.id === project.id
              return (
                <div
                  key={project.id}
                  className={`${ROW} ${
                    isActive ? 'bg-white/10 text-neutral-100' : 'text-neutral-300 hover:bg-white/5'
                  }`}
                >
                  <span className={`shrink-0 ${isActive ? 'text-neutral-300' : 'text-neutral-500'}`}>
                    <FolderIcon />
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    title={project.directory}
                    onClick={() => {
                      onSelectProject(project)
                      setOpen(false)
                    }}
                  >
                    {project.name}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteProject(project)
                    }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 opacity-0 transition hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"
                    aria-label={`Remove ${project.name}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              )
            })}

            <div className="mt-1 flex items-center justify-between border-t border-white/5 px-2 pb-1 pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                Sessions
              </span>
              <button
                type="button"
                onClick={() => {
                  onCreateSession()
                  setOpen(false)
                }}
                disabled={!activeProject}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                New
              </button>
            </div>
            {loadingSessions && <p className="px-2 py-1 text-xs text-neutral-500">Loading…</p>}
            {!loadingSessions && sessions.length === 0 && (
              <p className="px-2 py-1 text-xs text-neutral-500">
                {activeProject ? 'No sessions yet.' : 'Select a project first.'}
              </p>
            )}
            {sessions.map((session) => {
              const isActive = activeSession?.id === session.id
              return (
                <div
                  key={session.id}
                  className={`${ROW} ${
                    isActive ? 'bg-white/10 text-neutral-100' : 'text-neutral-300 hover:bg-white/5'
                  }`}
                >
                  <span
                    className={`shrink-0 ${
                      session.status === 'busy' || session.status === 'retry'
                        ? 'text-emerald-400'
                        : isActive
                          ? 'text-neutral-300'
                          : 'text-neutral-500'
                    }`}
                  >
                    <SessionIcon />
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    title={session.title}
                    onClick={() => {
                      onSelectSession(session)
                      setOpen(false)
                    }}
                  >
                    {session.title}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteSession(session)
                    }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 opacity-0 transition hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"
                    aria-label={`Delete ${session.title}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
