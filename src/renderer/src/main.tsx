import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Settings from './Settings'
import './assets/index.css'

function isSettingsRoute(): boolean {
  const normalizedHash = window.location.hash.toLowerCase()
  return normalizedHash === '#settings' || normalizedHash === '#/settings'
}

const isSettingsWindow = isSettingsRoute()

document.documentElement.setAttribute('data-window', isSettingsWindow ? 'settings' : 'main')
document.body.setAttribute('data-window', isSettingsWindow ? 'settings' : 'main')

const RootComponent = isSettingsWindow ? Settings : App

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
)
