import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { shell } from 'electron'
import { parseLaunchArguments } from '../services/argParser'

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

function spawnDetached(command: string, args: string[], options?: { windowsHide?: boolean }): Promise<void> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: options?.windowsHide ?? true
    })

    childProcess.once('spawn', () => {
      childProcess.unref()
      resolve()
    })

    childProcess.once('error', (error) => {
      reject(error)
    })
  })
}

export async function launchSavedApp(payload: { path?: string; arguments?: string }): Promise<void> {
  const normalizedPath = typeof payload.path === 'string' ? payload.path.trim() : ''
  const normalizedArguments = typeof payload.arguments === 'string' ? payload.arguments : ''

  if (!normalizedPath) {
    throw new Error('Application path is required.')
  }

  // Microsoft Store / UWP apps are launched through the shell app namespace.
  if (isWindows && /^shell:/i.test(normalizedPath)) {
    await spawnDetached('explorer.exe', [normalizedPath])
    return
  }

  if (!existsSync(normalizedPath)) {
    throw new Error('The saved application path no longer exists.')
  }

  const parsedArguments = parseLaunchArguments(normalizedArguments)

  if (isMac && normalizedPath.toLowerCase().endsWith('.app')) {
    const openArguments = ['-a', normalizedPath]
    if (parsedArguments.length > 0) {
      openArguments.push('--args', ...parsedArguments)
    }

    await spawnDetached('open', openArguments, { windowsHide: false })
    return
  }

  if (isWindows && /\.(lnk|url)$/i.test(normalizedPath)) {
    const openError = await shell.openPath(normalizedPath)
    if (openError) {
      throw new Error(openError)
    }
    return
  }

  await spawnDetached(normalizedPath, parsedArguments)
}
