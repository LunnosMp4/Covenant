import React from 'react'
import ReactDOM from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './assets/index.css'
import './assets/code-theme.css'

function getWindowKind(): 'settings' | 'main' {
  const normalizedHash = window.location.hash.toLowerCase()
  if (normalizedHash.startsWith('#settings') || normalizedHash.startsWith('#/settings')) {
    return 'settings'
  }
  return 'main'
}

const windowKind = getWindowKind()

document.documentElement.setAttribute('data-window', windowKind)
document.body.setAttribute('data-window', windowKind)

/**
 * Each window only ever renders one root, so the other root and everything it
 * imports (xterm, CodeMirror, every settings tab, the markdown stack, …) must
 * not be parsed by this one. Both roots stay reachable through a dynamic
 * import, which lets the bundler split them per window.
 */
async function loadRootComponent(): Promise<() => JSX.Element> {
  if (windowKind === 'settings') {
    const { default: Settings } = await import('./Settings')
    return Settings
  }

  const { default: App } = await import('./App')
  return App
}

async function bootstrap(): Promise<void> {
  const RootComponent = await loadRootComponent()

  // `reducedMotion="user"` makes Framer Motion honour the OS setting: transform
  // and layout animations are skipped while opacity/colour feedback is kept.
  const app = (
    <MotionConfig reducedMotion="user">
      <RootComponent />
    </MotionConfig>
  )

  // StrictMode double-invokes mount effects in development which re-plays
  // entry animations and makes flicker hard to reason about. Keep it for dev
  // only; production renders once.
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    import.meta.env.DEV ? <React.StrictMode>{app}</React.StrictMode> : app
  )
}

void bootstrap()
