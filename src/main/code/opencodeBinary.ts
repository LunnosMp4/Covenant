import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { log } from '../logger'

export const OPENCODE_PINNED_VERSION = '2.0.24'

export interface ResolvedBinary {
  path: string
  source: string
}

function binaryName(): string {
  return process.platform === 'win32' ? 'opencode.exe' : 'opencode'
}

function targetDirName(): string {
  const os = process.platform === 'win32' ? 'windows' : process.platform
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return `${os}-${arch}`
}

function platformPackageName(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  switch (process.platform) {
    case 'win32':
      return `@opencode/cli-windows-${arch}`
    case 'darwin':
      return `@opencode/cli-darwin-${arch}`
    default:
      return `@opencode/cli-linux-${arch}`
  }
}

/** Ordered candidate paths for the bundled/pinned OpenCode CLI. */
export function candidateBinaries(): Array<{ path: string; source: string }> {
  const name = binaryName()
  const candidates: Array<{ path: string; source: string }> = []

  const override = process.env.COVENANT_OPENCODE_BIN || process.env.OPENCODE_BIN
  if (override) {
    candidates.push({ path: override, source: 'env' })
  }

  // Packaged app: electron-builder `extraResources`.
  if (process.resourcesPath) {
    candidates.push({
      path: join(process.resourcesPath, 'opencode-cli', targetDirName(), name),
      source: 'resources'
    })
    candidates.push({
      path: join(process.resourcesPath, 'opencode-cli', name),
      source: 'resources'
    })
  }

  const appPath = app.getAppPath()
  candidates.push({
    path: join(appPath, 'resources', 'opencode-cli', targetDirName(), name),
    source: 'resources'
  })
  candidates.push({
    path: join(appPath, 'resources', 'opencode-cli', name),
    source: 'resources'
  })

  // Optional npm platform package (used in dev / CI staging).
  candidates.push({
    path: join(appPath, 'node_modules', ...platformPackageName().split('/'), 'bin', name),
    source: 'node_modules'
  })

  return candidates
}

export function resolveOpenCodeBinary(): ResolvedBinary | undefined {
  for (const candidate of candidateBinaries()) {
    try {
      if (existsSync(candidate.path)) {
        return candidate
      }
    } catch {
      // ignore
    }
  }
  return undefined
}

export function readBinaryVersion(binaryPath: string): string | undefined {
  try {
    const output = execFileSync(binaryPath, ['--version'], {
      timeout: 8000,
      windowsHide: true,
      encoding: 'utf-8'
    })
    return output.trim() || undefined
  } catch (error) {
    log.warn('Failed to read OpenCode binary version', error)
    return undefined
  }
}
