import { app, session } from 'electron'

export function resolveOpenAIProxyUrl(configProxyUrl?: string): string | undefined {
  const proxyCandidates = [
    configProxyUrl,
    process.env.OPENAI_PROXY_URL,
    process.env.HTTPS_PROXY,
    process.env.HTTP_PROXY
  ]

  for (const candidate of proxyCandidates) {
    const trimmedCandidate = candidate?.trim()
    if (trimmedCandidate) {
      return trimmedCandidate
    }
  }

  return undefined
}

function parseProxyUrl(proxyUrl: string): { host: string; port: string; username: string; password: string } | null {
  try {
    const parsed = new URL(proxyUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
    return {
      host: parsed.hostname,
      port,
      username: decodeURIComponent(parsed.username || ''),
      password: decodeURIComponent(parsed.password || '')
    }
  } catch {
    return null
  }
}

let sessionProxyCredentials: { username: string; password: string } | undefined
let sessionProxyLoginHandlerRegistered = false
let lastAppliedSessionProxy: string | undefined

function ensureSessionProxyLoginHandler(): void {
  if (sessionProxyLoginHandlerRegistered) return
  sessionProxyLoginHandlerRegistered = true

  app.on('login', (event, _webContents, _details, authInfo, callback) => {
    if (!authInfo.isProxy || !sessionProxyCredentials) return
    event.preventDefault()
    callback(sessionProxyCredentials.username, sessionProxyCredentials.password)
  })
}

// Mirrors the configured proxy onto Chromium's session so renderer network
// traffic (e.g. embedded remote pages) is routed like our Node-side requests.
export async function applySessionProxy(resolvedProxyUrl?: string): Promise<void> {
  const proxyUrl = resolvedProxyUrl?.trim() || undefined
  if (proxyUrl === lastAppliedSessionProxy) return
  lastAppliedSessionProxy = proxyUrl

  const targetSession = session.defaultSession
  if (!targetSession) return

  const parsed = proxyUrl ? parseProxyUrl(proxyUrl) : null
  if (!parsed) {
    sessionProxyCredentials = undefined
    await targetSession.setProxy({ mode: 'system' }).catch(() => undefined)
    return
  }

  ensureSessionProxyLoginHandler()
  sessionProxyCredentials =
    parsed.username || parsed.password
      ? { username: parsed.username, password: parsed.password }
      : undefined

  const hostPort = `${parsed.host}:${parsed.port}`
  await targetSession
    .setProxy({
      proxyRules: `http=${hostPort};https=${hostPort}`,
      proxyBypassRules: '<local>,localhost,127.0.0.1,[::1]'
    })
    .catch(() => undefined)
}
