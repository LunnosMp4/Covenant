import type { Preprompt } from './preprompt'

interface AppConfig {
  apiKey: string
  themeGradient: string
  proxyUrl: string
}

interface PrometheusAPI {
  window: {
    hideWindow: () => void
    openSettings: () => void
    closeSettings: () => void
    minimizeSettings: () => void
    onToggleVisibility: (callback: (visible: boolean) => void) => (() => void) | void
  }
  config: {
    getConfig: () => Promise<AppConfig>
    saveApiKey: (apiKey: string) => void
    saveOpenAISettings: (settings: { apiKey: string; proxyUrl: string }) => void
    updateTheme: (gradientClass: string) => void
    onThemeUpdated: (callback: (gradientClass: string) => void) => (() => void) | void
  }
  chat: {
    askPrometheus: (prompt: string) => Promise<string>
  }
  store: {
    getPreprompts: () => Promise<Preprompt[]>
    savePreprompt: (preprompt: Partial<Preprompt>) => Promise<Preprompt[]>
    deletePreprompt: (prepromptId: string) => Promise<Preprompt[]>
  }
}

declare global {
  interface Window {
    api?: PrometheusAPI
    electronAPI?: {
      hideWindow: () => void
      openSettings: () => void
      closeSettings: () => void
      minimizeSettings: () => void
      getConfig: () => Promise<AppConfig>
      saveApiKey: (apiKey: string) => void
      saveOpenAISettings: (settings: { apiKey: string; proxyUrl: string }) => void
      updateTheme: (gradientClass: string) => void
      onThemeUpdated: (callback: (gradientClass: string) => void) => (() => void) | void
      askPrometheus: (prompt: string) => Promise<string>
      onToggleVisibility: (callback: (visible: boolean) => void) => (() => void) | void
    }
  }
}

export {}
