import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Settings from './Settings'
import PasteManager from './PasteManager'
import CodeWorkspace from './CodeWorkspace'
import './assets/index.css'
import 'prismjs/themes/prism-tomorrow.css'

function getWindowKind(): 'settings' | 'paste' | 'code' | 'main' {
  const normalizedHash = window.location.hash.toLowerCase()
  if (normalizedHash.startsWith('#settings') || normalizedHash.startsWith('#/settings')) {
    return 'settings'
  }
  if (normalizedHash.startsWith('#paste') || normalizedHash.startsWith('#/paste')) {
    return 'paste'
  }
  if (normalizedHash.startsWith('#code') || normalizedHash.startsWith('#/code')) {
    return 'code'
  }
  return 'main'
}

const windowKind = getWindowKind()

document.documentElement.setAttribute('data-window', windowKind)
document.body.setAttribute('data-window', windowKind)

const RootComponent =
  windowKind === 'settings'
    ? Settings
    : windowKind === 'paste'
      ? PasteManager
      : windowKind === 'code'
        ? CodeWorkspace
        : App

const app = <RootComponent />

// StrictMode double-invokes mount effects in development which re-plays
// entry animations and makes flicker hard to reason about. Keep it for dev
// only; production renders once.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  import.meta.env.DEV ? <React.StrictMode>{app}</React.StrictMode> : app
)
