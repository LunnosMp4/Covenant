const { app, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')
const dns = require('dns')
const { Agent, ProxyAgent } = require('undici')

app.setPath('userData', path.join(process.env.APPDATA, 'covenant'))

app.whenReady().then(async () => {
  const token = safeStorage
    .decryptString(fs.readFileSync(path.join(process.env.APPDATA, 'covenant', 'ai', 'search-searxng.enc')))
    .trim()
  const url = 'https://search.loic-tisseyre.com/search?q=Covenant%20test&format=json'
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'User-Agent': 'Covenant/1.12.5'
  }

  async function test(label, dispatcher) {
    try {
      const res = await fetch(url, { headers, ...(dispatcher ? { dispatcher } : {}) })
      const text = await res.text()
      console.log(label, 'status=', res.status, 'type=', res.headers.get('content-type'), 'body=', text.slice(0, 120))
    } catch (error) {
      console.log(label, 'ERROR', error?.message)
    }
  }

  dns.setDefaultResultOrder('ipv4first')
  await test('ipv4first-direct')
  await test('family4-agent', new Agent({ connect: { family: 4 } }))
  await test('proxy', new ProxyAgent('http://185.46.212.90:80'))

  app.quit()
})
