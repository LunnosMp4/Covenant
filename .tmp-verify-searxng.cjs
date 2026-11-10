const { app, BrowserWindow } = require('electron')
const path = require('path')

app.setPath('userData', path.join(process.env.APPDATA, 'covenant'))
require('./out/main/index.js')

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

app.whenReady().then(async () => {
  let win
  for (let i = 0; i < 50; i += 1) {
    win = BrowserWindow.getAllWindows()[0]
    if (win) break
    await wait(200)
  }
  if (!win) {
    console.log('NO_WINDOW')
    app.quit()
    return
  }
  if (win.webContents.isLoading()) {
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve))
  }
  await wait(1500)

  try {
    const result = await win.webContents.executeJavaScript(
      `new Promise((resolve) => {
        const events = []
        let unsub = () => {}
        let settled = false
        const finish = (reason) => {
          if (settled) return
          settled = true
          try { unsub() } catch {}
          resolve({ reason, events })
        }
        const timer = setTimeout(() => finish('timeout'), 60000)
        unsub = window.api.chat.onStreamEvent((event) => {
          events.push(event)
          if (event.type === 'done' || event.type === 'error') {
            clearTimeout(timer)
            finish('event:' + event.type)
          }
        })
        window.api.chat.askCovenantStream(
          [{ role: 'user', content: 'What is the latest news about OpenAI today? Search the web.' }],
          { conversationId: 'verify-searxng' }
        ).then((response) => {
          events.push({ type: 'started', ...response })
        }).catch((error) => {
          clearTimeout(timer)
          events.push({ type: 'invoke-error', error: String(error) })
          finish('invoke-error')
        })
      })`,
      true
    )
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.log('EXECUTE_ERROR', error?.message)
  }

  app.quit()
})
