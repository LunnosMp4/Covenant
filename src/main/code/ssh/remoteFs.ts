import type { SFTPWrapper } from 'ssh2'
import type { RemoteDirEntry, RemoteEntryType } from '../../../shared/code/connection'

export type { RemoteDirEntry, RemoteEntryType } from '../../../shared/code/connection'

export function joinRemote(...parts: string[]): string {
  const joined = parts.filter((part) => part !== '').join('/')
  return joined.replace(/\/{2,}/g, '/')
}

export function parentRemote(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  if (index <= 0) return '/'
  return trimmed.slice(0, index)
}

export function baseNameRemote(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  return index >= 0 ? trimmed.slice(index + 1) : trimmed
}

export function listRemoteDir(sftp: SFTPWrapper, dir: string): Promise<RemoteDirEntry[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(dir, (error, list) => {
      if (error) {
        reject(error)
        return
      }
      const entries: RemoteDirEntry[] = list
        .filter((item) => item.filename !== '.' && item.filename !== '..')
        .map((item) => {
          const attrs = item.attrs
          const isDir = attrs.isDirectory()
          const isLink = attrs.isSymbolicLink()
          const type: RemoteEntryType = isDir ? 'dir' : isLink ? 'symlink' : attrs.isFile() ? 'file' : 'other'
          return {
            name: item.filename,
            path: joinRemote(dir, item.filename),
            type,
            size: typeof attrs.size === 'number' ? attrs.size : 0
          }
        })
        .sort((a, b) => {
          if (a.type === 'dir' && b.type !== 'dir') return -1
          if (a.type !== 'dir' && b.type === 'dir') return 1
          return a.name.localeCompare(b.name)
        })
      resolve(entries)
    })
  })
}

export function statRemotePath(sftp: SFTPWrapper, path: string): Promise<RemoteEntryType | null> {
  return new Promise((resolve) => {
    sftp.stat(path, (error, stats) => {
      if (error || !stats) {
        resolve(null)
        return
      }
      resolve(stats.isDirectory() ? 'dir' : stats.isFile() ? 'file' : 'other')
    })
  })
}

export function readRemoteText(sftp: SFTPWrapper, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    sftp.readFile(path, (error, data) => {
      if (error) {
        reject(error)
        return
      }
      resolve(Buffer.isBuffer(data) ? data.toString('utf-8') : String(data))
    })
  })
}

export function writeRemoteText(sftp: SFTPWrapper, path: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.writeFile(path, text, { encoding: 'utf-8' }, (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

function mkdirRemote(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.mkdir(path, (error) => {
      // EEXIST is fine when racing or re-running.
      if (error && !/exist/i.test(error.message)) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

export async function ensureRemoteDir(sftp: SFTPWrapper, path: string): Promise<void> {
  const normalized = path.replace(/\/+$/, '')
  if (!normalized || normalized === '/') return
  const exists = await statRemotePath(sftp, normalized)
  if (exists === 'dir') return
  const parent = parentRemote(normalized)
  if (parent && parent !== normalized) {
    await ensureRemoteDir(sftp, parent)
  }
  await mkdirRemote(sftp, normalized)
}
