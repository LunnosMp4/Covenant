import { randomUUID } from 'crypto'
import { statSync } from 'fs'
import { appStore } from '../store/appStore'
import { normalizeCodeProject, normalizeCodeProjects } from '../../shared/code/codeNormalizers'
import { LOCAL_CONNECTION_ID } from '../../shared/code/connection'
import type { CodeProject } from '../../shared/code/code'

const MAX_CODE_PROJECTS = 50

export function getCodeProjects(): CodeProject[] {
  return normalizeCodeProjects(appStore.get('codeProjects', []))
}

export function addCodeProject(
  input: { directory?: unknown; name?: unknown; connectionId?: unknown },
  options?: { validateLocal?: boolean }
): CodeProject[] {
  const directory = typeof input?.directory === 'string' ? input.directory.trim() : ''
  if (!directory) {
    throw new Error('A project directory is required')
  }
  const connectionId =
    typeof input?.connectionId === 'string' && input.connectionId.trim()
      ? input.connectionId.trim()
      : LOCAL_CONNECTION_ID

  // Local paths are validated here; remote paths are validated by the caller
  // over SFTP before this is invoked.
  if (connectionId === LOCAL_CONNECTION_ID && options?.validateLocal !== false) {
    let isDirectory = false
    try {
      isDirectory = statSync(directory).isDirectory()
    } catch {
      throw new Error(`Directory does not exist: ${directory}`)
    }
    if (!isDirectory) {
      throw new Error(`Not a directory: ${directory}`)
    }
  }

  const existing = getCodeProjects()
  const duplicate = existing.find(
    (project) => project.directory === directory && project.connectionId === connectionId
  )
  if (duplicate) {
    return existing
  }

  const normalized = normalizeCodeProject({
    id: randomUUID(),
    name: typeof input?.name === 'string' ? input.name : undefined,
    directory,
    connectionId,
    addedAt: Date.now()
  })
  if (!normalized) {
    throw new Error('Invalid project')
  }

  const next = [normalized, ...existing].slice(0, MAX_CODE_PROJECTS)
  appStore.set('codeProjects', next)
  return next
}

export function removeCodeProject(id: unknown): CodeProject[] {
  const targetId = typeof id === 'string' ? id : ''
  const next = getCodeProjects().filter((project) => project.id !== targetId)
  appStore.set('codeProjects', next)
  return next
}
