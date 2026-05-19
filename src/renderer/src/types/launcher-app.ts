export interface LauncherAppTarget {
  id?: string
  path: string
  arguments: string
}

export interface LauncherApp {
  id: string
  title: string
  iconBase64: string
  targets: LauncherAppTarget[]
  path?: string
  arguments?: string
}
