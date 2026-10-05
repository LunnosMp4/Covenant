import type { WebContents } from 'electron'

type WebContentsProvider = () => WebContents | null

let mainProvider: WebContentsProvider = () => null
let settingsProvider: WebContentsProvider = () => null
let pasteProvider: WebContentsProvider = () => null

/**
 * Wires the window-owning module's web contents into the broadcast helpers so
 * feature and IPC modules can emit events without importing window state.
 */
export function setBroadcastProviders(providers: {
  main: WebContentsProvider
  settings: WebContentsProvider
  paste: WebContentsProvider
}): void {
  mainProvider = providers.main
  settingsProvider = providers.settings
  pasteProvider = providers.paste
}

function safeSend(provider: WebContentsProvider, channel: string, args: unknown[]): void {
  const contents = provider()
  if (!contents || contents.isDestroyed()) return
  contents.send(channel, ...args)
}

export function sendToMain(channel: string, ...args: unknown[]): void {
  safeSend(mainProvider, channel, args)
}

export function sendToSettings(channel: string, ...args: unknown[]): void {
  safeSend(settingsProvider, channel, args)
}

export function sendToPaste(channel: string, ...args: unknown[]): void {
  safeSend(pasteProvider, channel, args)
}

export function broadcast(channel: string, ...args: unknown[]): void {
  safeSend(mainProvider, channel, args)
  safeSend(settingsProvider, channel, args)
}
