import type { LauncherAppTarget } from '../../../../shared/launcher/launcher-app'

export function normalizeLaunchTargets(
  targets: LauncherAppTarget[] | undefined,
  legacyPath?: string,
  legacyArguments?: string
): LauncherAppTarget[] {
  if (Array.isArray(targets) && targets.length > 0) {
    return targets
  }

  const path = typeof legacyPath === 'string' ? legacyPath.trim() : ''
  if (!path) {
    return []
  }

  return [{ path, arguments: legacyArguments ?? '' }]
}

export function formatTargetsSummary(targets: LauncherAppTarget[]): string {
  const count = targets.length
  if (count === 0) {
    return 'No apps'
  }

  return `${count} app${count === 1 ? '' : 's'}`
}