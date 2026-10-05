import { randomUUID } from 'crypto'
import type { LauncherApp, LauncherAppTarget } from '../../shared/launcher/launcher-app'
import { appStore } from '../store/appStore'

function normalizeLauncherTargets(payload: Partial<LauncherApp>): LauncherAppTarget[] {
  const rawTargets = Array.isArray(payload.targets) ? payload.targets : []
  const sanitizedTargets = rawTargets
    .map((target) => {
      const path = typeof target.path === 'string' ? target.path.trim() : ''
      if (!path) return null
      const argumentsValue =
        typeof target.arguments === 'string' ? target.arguments.trim() : ''
      return { path, arguments: argumentsValue }
    })
    .filter((target): target is LauncherAppTarget => Boolean(target))

  if (sanitizedTargets.length > 0) {
    return sanitizedTargets
  }

  const legacyPath = typeof payload.path === 'string' ? payload.path.trim() : ''
  if (!legacyPath) {
    return []
  }

  const legacyArguments =
    typeof payload.arguments === 'string' ? payload.arguments.trim() : ''
  return [{ path: legacyPath, arguments: legacyArguments }]
}

function normalizeStoredApps(apps: LauncherApp[]): LauncherApp[] {
  let didChange = false
  const normalized = apps.map((app) => {
    const targets = normalizeLauncherTargets(app)
    const normalizedTitle = typeof app.title === 'string' ? app.title.trim() : ''
    const primaryTarget = targets[0]
    const normalizedPath = primaryTarget?.path ?? (typeof app.path === 'string' ? app.path.trim() : '')
    const normalizedArguments =
      primaryTarget?.arguments ?? (typeof app.arguments === 'string' ? app.arguments.trim() : '')
    const iconBase64 = typeof app.iconBase64 === 'string' ? app.iconBase64 : ''
    const targetsChanged =
      !Array.isArray(app.targets) ||
      app.targets.length !== targets.length ||
      app.targets.some((target, index) => {
        const targetPath = typeof target.path === 'string' ? target.path.trim() : ''
        const targetArguments =
          typeof target.arguments === 'string' ? target.arguments.trim() : ''
        return (
          targetPath !== targets[index]?.path ||
          targetArguments !== targets[index]?.arguments
        )
      })

    if (
      app.title !== normalizedTitle ||
      targetsChanged ||
      app.path !== normalizedPath ||
      app.arguments !== normalizedArguments ||
      app.iconBase64 !== iconBase64
    ) {
      didChange = true
    }

    return {
      ...app,
      title: normalizedTitle,
      targets,
      path: normalizedPath,
      arguments: normalizedArguments,
      iconBase64
    }
  })

  if (didChange) {
    appStore.set('apps', normalized)
  }

  return normalized
}

export function getApps(): LauncherApp[] {
  const apps = appStore.get('apps', [])
  return normalizeStoredApps(apps)
}

export function saveApp(payload: Partial<LauncherApp>): LauncherApp[] {
  const normalizedTitle = typeof payload.title === 'string' ? payload.title.trim() : ''
  const normalizedTargets = normalizeLauncherTargets(payload)

  if (!normalizedTitle || normalizedTargets.length === 0) {
    throw new Error('Application title and at least one app path are required.')
  }

  const primaryTarget = normalizedTargets[0]
  const normalizedPath = primaryTarget.path
  const normalizedArguments = primaryTarget.arguments
  const normalizedIconBase64 = typeof payload.iconBase64 === 'string' ? payload.iconBase64 : ''

  const apps = getApps()
  const existingId = typeof payload.id === 'string' ? payload.id.trim() : ''

  if (existingId && apps.some((item) => item.id === existingId)) {
    const updated = apps.map((item) =>
      item.id === existingId
        ? {
            ...item,
            title: normalizedTitle,
            targets: normalizedTargets,
            path: normalizedPath,
            iconBase64: normalizedIconBase64,
            arguments: normalizedArguments
          }
        : item
    )

    appStore.set('apps', updated)
    return updated
  }

  const created: LauncherApp = {
    id: existingId || randomUUID(),
    title: normalizedTitle,
    targets: normalizedTargets,
    path: normalizedPath,
    iconBase64: normalizedIconBase64,
    arguments: normalizedArguments
  }

  const nextApps = [...apps, created]
  appStore.set('apps', nextApps)
  return nextApps
}

export function deleteApp(id: string): LauncherApp[] {
  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId) {
    return getApps()
  }

  const nextApps = getApps().filter((item) => item.id !== normalizedId)
  appStore.set('apps', nextApps)
  return nextApps
}
