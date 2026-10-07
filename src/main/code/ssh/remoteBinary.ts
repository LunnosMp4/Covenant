import { execFileSync } from 'child_process'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { app } from 'electron'
import { log } from '../../logger'
import { OPENCODE_PINNED_VERSION } from '../opencodeBinary'

/**
 * Maps a remote `uname -s` / `uname -m` pair to a Covenant/OpenCode target
 * identifier. Only Linux and macOS are supported for SSH machines.
 */
export function remoteTargetFromUname(os: string, machine: string): string | undefined {
  const normalizedOs = os.trim().toLowerCase()
  const normalizedArch = machine.trim().toLowerCase()
  const arch = normalizedArch === 'aarch64' || normalizedArch === 'arm64'
    ? 'arm64'
    : normalizedArch === 'x86_64' || normalizedArch === 'amd64'
      ? 'x64'
      : undefined
  if (!arch) return undefined
  if (normalizedOs.includes('linux')) return `linux-${arch}`
  if (normalizedOs.includes('darwin')) return `darwin-${arch}`
  return undefined
}

export function remoteBinaryName(): string {
  return 'opencode'
}

function cacheDir(target: string): string {
  return join(app.getPath('userData'), 'code', 'remote-bin', target)
}

function cachedBinary(target: string): string {
  return join(cacheDir(target), remoteBinaryName())
}

async function download(
  url: string,
  dest: string,
  onProgress?: (received: number, total: number) => void
): Promise<void> {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) for ${url}`)
  }
  const total = Number(response.headers.get('content-length')) || 0
  let received = 0
  const body = Readable.fromWeb(response.body as never)
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    onProgress?.(received, total)
  })
  await pipeline(body, createWriteStream(dest))
}

/**
 * Returns a local path to an OpenCode binary built for the remote target,
 * downloading and extracting the pinned npm tarball on first use. The caller
 * uploads this file over SFTP to the machine.
 */
export async function ensureLocalBinaryForTarget(
  target: string,
  onLog?: (line: string) => void,
  onProgress?: (received: number, total: number) => void
): Promise<string> {
  const cached = cachedBinary(target)
  if (existsSync(cached)) return cached

  mkdirSync(cacheDir(target), { recursive: true })
  const tgzName = `cli-${target}-${OPENCODE_PINNED_VERSION}.tgz`
  const url = `https://registry.npmjs.org/@opencode%2fcli-${target}/-/${tgzName}`
  const tmp = join(tmpdir(), `covenant-opencode-${target}-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  const archive = join(tmp, tgzName)

  onLog?.(`Downloading OpenCode ${OPENCODE_PINNED_VERSION} for ${target}…`)
  await download(url, archive, onProgress)

  try {
    execFileSync('tar', ['-xzf', archive, '-C', tmp], { stdio: 'ignore' })
  } catch (error) {
    rmSync(tmp, { recursive: true, force: true })
    throw new Error(
      `Failed to extract ${archive}: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  const extracted = join(tmp, 'package', 'bin', remoteBinaryName())
  if (!existsSync(extracted)) {
    rmSync(tmp, { recursive: true, force: true })
    throw new Error(`Extracted archive did not contain ${remoteBinaryName()}`)
  }

  copyFileSync(extracted, cached)
  rmSync(tmp, { recursive: true, force: true })
  log.info(`Cached OpenCode remote binary for ${target} at ${cached}`)
  return cached
}
