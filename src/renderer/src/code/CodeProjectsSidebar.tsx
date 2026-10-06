import type { CodeProject, CodeSession } from '../../../shared/code/code'
import { TrashIcon } from '../ui/icons'
import { FolderIcon, PlusIcon, SessionIcon } from './icons'

interface CodeProjectsSidebarProps {
  projects: CodeProject[]
  activeProject: CodeProject | null
  onSelectProject: (project: CodeProject) => void
  onAddProject: () => void
  sessions: CodeSession[]
  activeSession: CodeSession | null
  loadingSessions: boolean
  onSelectSession: (session: CodeSession) => void
  onCreateSession: () => void
  onDeleteSession: (session: CodeSession) => void
}

const ROW = 'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors'

function SectionLabel({ children, action }: { children: string; action?: JSX.Element }): JSX.Element {
  return (
    <div className="flex items-center justify-between px-2 pb-1 pt-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
        {children}
      </span>
      {action}
    </div>
  )
}

export default function CodeProjectsSidebar({
  projects,
  activeProject,
  onSelectProject,
  onAddProject,
  sessions,
  activeSession,
  loadingSessions,
  onSelectSession,
  onCreateSession,
  onDeleteSession
}: CodeProjectsSidebarProps): JSX.Element {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <SectionLabel
        action={
          <button
            type="button"
            onClick={onAddProject}
            className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
            aria-label="Add project folder"
            title="Add project folder"
          >
            <PlusIcon />
          </button>
        }
      >
        Projects
      </SectionLabel>
      <div className="max-h-32 shrink-0 overflow-y-auto px-1 chat-scrollbar">
        {projects.length === 0 && <p className="px-2 py-1 text-xs text-neutral-500">No projects yet.</p>}
        {projects.map((project) => {
          const isActive = activeProject?.id === project.id
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => onSelectProject(project)}
              title={project.directory}
              className={`${ROW} w-full text-left ${
                isActive ? 'bg-white/10 text-neutral-100' : 'text-neutral-300 hover:bg-white/5'
              }`}
            >
              <span className={`shrink-0 ${isActive ? 'text-neutral-300' : 'text-neutral-500'}`}>
                <FolderIcon />
              </span>
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
            </button>
          )
        })}
      </div>

      <SectionLabel
        action={
          <button
            type="button"
            onClick={onCreateSession}
            disabled={!activeProject}
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            New
          </button>
        }
      >
        Sessions
      </SectionLabel>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1 chat-scrollbar">
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
                onClick={() => onSelectSession(session)}
                title={session.title}
                className="min-w-0 flex-1 truncate text-left"
              >
                {session.title}
              </button>
              <button
                type="button"
                onClick={() => onDeleteSession(session)}
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
  )
}
