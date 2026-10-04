export type LauncherItemKind = 'app' | 'workflow' | 'task' | 'command' | 'ai'

/**
 * A single actionable entry rendered by the unified command bar. New kinds
 * (workflow, task, command, …) only need their own optional payload field here
 * and a case in the renderer's `runLauncherItem` router.
 */
export interface LauncherItem {
  id: string
  kind: LauncherItemKind
  title: string
  subtitle?: string
  iconBase64?: string
  score: number
  /** Present when `kind === 'app'`. */
  app?: {
    path: string
    arguments?: string
  }
}

/** A launchable application discovered on the host system. */
export interface InstalledApp {
  id: string
  title: string
  path: string
}
