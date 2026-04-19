import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  shell
} from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import dotenv from 'dotenv'
import OpenAI from 'openai'

let mainWindow: BrowserWindow | null = null
let isVisible = false

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

const WINDOW_WIDTH = 800
const WINDOW_HEIGHT = 220
const WINDOW_BOTTOM_MARGIN = 48

dotenv.config({ path: join(process.cwd(), '.env') })

function getWindowPosition(): { x: number; y: number } {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { x: workAreaX, y: workAreaY, width: workAreaWidth, height: workAreaHeight } =
    primaryDisplay.workArea

  return {
    x: Math.round(workAreaX + (workAreaWidth - WINDOW_WIDTH) / 2),
    y: Math.round(workAreaY + workAreaHeight - WINDOW_HEIGHT - WINDOW_BOTTOM_MARGIN)
  }
}

function createWindow(): void {
  const { x, y } = getWindowPosition()

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    backgroundMaterial: isWindows ? 'none' : undefined,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    titleBarStyle: isMac ? 'hidden' : undefined,
    thickFrame: isWindows ? false : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // macOS vibrancy effect
  if (isMac) {
    mainWindow.setVibrancy('ultra-dark')
  }

  // Keep the full window transparent. Renderer-level styling handles the frosted bar.
  if (isWindows) {
    try {
      mainWindow.setBackgroundMaterial('auto')
    } catch {
      // Older Electron/Windows versions can ignore this safely.
    }

    // Re-apply transparent paint color at runtime for Windows compositors.
    mainWindow.setBackgroundColor('rgba(0, 0, 0, 0)')
  }

  mainWindow.webContents.on('did-finish-load', () => {
    // Force renderer roots to stay transparent even in dev/HMR reloads.
    mainWindow?.webContents.insertCSS(
      'html, body, #root, :root { background: transparent !important; }'
    )
  })

  mainWindow.on('ready-to-show', () => {
    // Don't show on start – wait for shortcut
  })

  mainWindow.on('blur', () => {
    if (isVisible) {
      hideWindow()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showWindow(): void {
  if (!mainWindow) return

  const { x, y } = getWindowPosition()
  mainWindow.setPosition(x, y, false)

  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send('toggle-visibility', true)
  isVisible = true
}

function hideWindow(): void {
  if (!mainWindow) return
  mainWindow.webContents.send('toggle-visibility', false)
  isVisible = false

  // Give the exit animation time to play before hiding
  setTimeout(() => {
    if (!isVisible && mainWindow) {
      mainWindow.hide()
    }
  }, 250)
}

function toggleWindow(): void {
  if (isVisible) {
    hideWindow()
  } else {
    showWindow()
  }
}

app.whenReady().then(() => {
  createWindow()

  globalShortcut.register('Alt+Space', toggleWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// IPC: renderer can request hide (after close animation)
ipcMain.on('hide-window', () => {
  isVisible = false
  if (mainWindow) {
    mainWindow.hide()
  }
})

ipcMain.handle('prometheus:chat', async (_event, userPrompt: string) => {
  const prompt = userPrompt?.trim()
  if (!prompt) {
    throw new Error('Prompt cannot be empty.')
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Add it to the .env file at project root.')
  }

  const client = new OpenAI({ apiKey })
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          "You are Prometheus, a helpful, concise AI assistant integrated into a user's operating system. Keep your answers brief and to the point."
      },
      { role: 'user', content: prompt }
    ]
  })

  return completion.choices[0]?.message?.content?.trim() || 'No response from model.'
})
