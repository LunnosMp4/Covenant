import { log } from '../../logger'
import { getCodeConnectionById } from '../../features/codeConnections'
import { SshSession } from './sshClient'
import { listRemoteDir, parentRemote, statRemotePath } from './remoteFs'
import type { RemoteBrowseResult, RemoteEntryType } from '../../../shared/code/connection'

interface BrowseSession {
  session: SshSession
  home: string
}

// Browse sessions are kept alive between folder-browser navigations so the
// user does not pay an SSH handshake per directory. They are torn down when
// the connection is removed or the app quits.
const sessions = new Map<string, BrowseSession>()

async function getBrowseSession(connectionId: string): Promise<BrowseSession> {
  const cached = sessions.get(connectionId)
  if (cached) return cached

  const connection = getCodeConnectionById(connectionId)
  if (!connection || connection.kind !== 'ssh') {
    throw new Error('Not a remote connection')
  }
  const { session } = await SshSession.connect(connection)
  const home = await session.getHome()
  const entry: BrowseSession = { session, home }
  sessions.set(connectionId, entry)
  return entry
}

export async function browseRemote(
  connectionId: string,
  requestedPath?: string
): Promise<RemoteBrowseResult> {
  let browse = await getBrowseSession(connectionId)
  const path = requestedPath && requestedPath.trim() ? requestedPath.trim() : browse.home
  try {
    const sftp = await browse.session.getSftp()
    const entries = await listRemoteDir(sftp, path)
    return {
      connectionId,
      path,
      parent: path === '/' ? null : parentRemote(path),
      home: browse.home,
      entries
    }
  } catch (error) {
    // A stale session (dropped connection) is retried once with a fresh one.
    disposeBrowseSession(connectionId)
    browse = await getBrowseSession(connectionId)
    const sftp = await browse.session.getSftp()
    const entries = await listRemoteDir(sftp, path)
    return {
      connectionId,
      path,
      parent: path === '/' ? null : parentRemote(path),
      home: browse.home,
      entries
    }
  }
}

export async function statRemote(
  connectionId: string,
  path: string
): Promise<RemoteEntryType | null> {
  const browse = await getBrowseSession(connectionId)
  const sftp = await browse.session.getSftp()
  return statRemotePath(sftp, path)
}

export function disposeBrowseSession(connectionId: string): void {
  const entry = sessions.get(connectionId)
  if (!entry) return
  sessions.delete(connectionId)
  try {
    entry.session.end()
  } catch (error) {
    log.warn('Failed to close browse SSH session', error)
  }
}

export function disposeAllBrowseSessions(): void {
  for (const id of [...sessions.keys()]) {
    disposeBrowseSession(id)
  }
}
