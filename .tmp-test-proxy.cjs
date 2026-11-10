const { app, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')
const { ProxyAgent } = require('undici')

app.setPath('userData', path.join(process.env.APPDATA, 'covenant'))

app.whenReady().then(async () => {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'covenant', 'config.json'), 'utf8'))
  const searxngToken = safeStorage
    .decryptString(fs.readFileSync(path.join(process.env.APPDATA, 'covenant', 'ai', 'search-searxng.enc')))
    .trim()
  const proxy = new ProxyAgent('http://185.46.212.90:80')

  async function test(label, url, headers) {
    try {
      const res = await fetch(url, { headers, dispatcher: proxy })
      const text = await res.text()
      console.log(label, 'status=', res.status, 'type=', res.headers.get('content-type'), 'body=', text.slice(0, 160))
    } catch (error) {
      console.log(label, 'ERROR', error?.message)
    }
  }

  await test('searxng', 'https://search.loic-tisseyre.com/search?q=Covenant%20test&format=json', {
    Authorization: `Bearer ${searxngToken}`,
    Accept: 'application/json',
    'User-Agent': 'Covenant/1.12.5'
  })

  await test('opencode-models', 'https://opencode.ai/inference/go/v1/models', {
    Accept: 'application/json',
    'User-Agent': 'Covenant/1.12.5'
  })

  await test('openai-models', 'https://api.openai.com/v1/models', {
    Authorization: `Bearer ${config.apiKey}`,
    Accept: 'application/json'
  })

  app.quit()
})
