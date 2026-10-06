// Stages the pinned OpenCode CLI binary into `resources/opencode-cli/<target>/`
// so electron-builder can bundle it via `extraResources`. Run explicitly with
// `npm run prepare:opencode-cli`; it is also wired to `predist`.
//
// Resolution order for each platform:
//   1. Already staged under resources/opencode-cli/<target>/
//   2. A locally installed platform package (@opencode/cli-<target>)
//   3. The npm registry tarball for the pinned version
import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const VERSION = '2.0.24'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'

function targetName() {
  const os = process.platform === 'win32' ? 'windows' : process.platform
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return `${os}-${arch}`
}

function binaryName() {
  return isWindows ? 'opencode.exe' : 'opencode'
}

function stageDir() {
  return join(root, 'resources', 'opencode-cli', targetName())
}

function packageName() {
  return `@opencode/cli-${targetName()}`
}

function stagedBinary() {
  return join(stageDir(), binaryName())
}

function installedBinary() {
  return join(root, 'node_modules', ...packageName().split('/'), 'bin', binaryName())
}

async function download(url, dest) {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) for ${url}`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest))
}

async function main() {
  if (existsSync(stagedBinary())) {
    console.log(`OpenCode CLI already staged at ${stagedBinary()}`)
    return
  }

  mkdirSync(stageDir(), { recursive: true })

  if (existsSync(installedBinary())) {
    const { copyFileSync } = await import('node:fs')
    copyFileSync(installedBinary(), stagedBinary())
    console.log(`Staged OpenCode CLI from ${installedBinary()}`)
    verify()
    return
  }

  const pkg = packageName()
  const target = targetName()
  const tgzName = `cli-${target}-${VERSION}.tgz`
  const url = `https://registry.npmjs.org/${pkg.replace('/', '%2f')}/-/${tgzName}`
  const tmp = join(tmpdir(), `covenant-opencode-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  const archive = join(tmp, tgzName)

  console.log(`Downloading OpenCode CLI ${VERSION} (${target})…`)
  await download(url, archive)

  try {
    execFileSync('tar', ['-xzf', archive, '-C', tmp], { stdio: 'inherit' })
  } catch (error) {
    throw new Error(`Failed to extract ${archive}: ${error instanceof Error ? error.message : error}`)
  }

  const extracted = join(tmp, 'package', 'bin', binaryName())
  const { copyFileSync, chmodSync } = await import('node:fs')
  copyFileSync(extracted, stagedBinary())
  if (!isWindows) chmodSync(stagedBinary(), 0o755)
  rmSync(tmp, { recursive: true, force: true })
  console.log(`Staged OpenCode CLI at ${stagedBinary()}`)
  verify()
}

function verify() {
  try {
    const version = execFileSync(stagedBinary(), ['--version'], { encoding: 'utf-8' }).trim()
    console.log(`Verified OpenCode CLI: ${version}`)
  } catch (error) {
    console.warn(`Could not verify OpenCode CLI: ${error instanceof Error ? error.message : error}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
