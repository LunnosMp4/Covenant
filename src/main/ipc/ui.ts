import { app, ipcMain } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'

interface SandboxSourceResult {
  charts: string
  error?: string
}

let cached: SandboxSourceResult | null = null

function candidateDirectories(): string[] {
  return [
    join(__dirname, '../renderer/sandbox'),
    join(app.getAppPath(), 'src/renderer/public/sandbox')
  ]
}

function readSandboxFile(name: string): string {
  let lastError: unknown = null

  for (const directory of candidateDirectories()) {
    try {
      return readFileSync(join(directory, name), 'utf8')
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Sandbox asset ${name} is missing.`)
}

/**
 * The chart engine is served to the renderer through IPC rather than fetch:
 * packaged builds load the window from `file://`, where `fetch` cannot read
 * local files. The frame document itself is a static asset next to it.
 */
export function readSandboxSource(): SandboxSourceResult {
  if (cached) return cached

  try {
    const source = { charts: readSandboxFile('charts.js') }
    cached = source
    return source
  } catch (error) {
    // Do not cache a miss forever: the bundler may still be writing the file
    // when the first generated surface is opened in development.
    return {
      charts: '',
      error: error instanceof Error ? error.message : 'Sandbox assets are missing.'
    }
  }
}

export function registerUiIpc(): void {
  ipcMain.handle('covenant:ui-sandbox-source', () => readSandboxSource())
}
