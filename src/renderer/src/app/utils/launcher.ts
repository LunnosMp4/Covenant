import type { LauncherApp, LauncherAppTarget } from '../../../../shared/launcher/launcher-app'
import type { PopupItem } from '../../launcher/ModulePopup'
import { normalizeLaunchTargets } from '../../utils/launcher/launcherTargets'

export function normalizeLauncherAppTargets(app: LauncherApp): LauncherAppTarget[] {
  return normalizeLaunchTargets(app.targets, app.path, app.arguments)
}

export function normalizePopupLaunchTargets(item: PopupItem): LauncherAppTarget[] {
  return normalizeLaunchTargets(item.appLaunchTargets, item.appPath, item.launchArguments)
}
