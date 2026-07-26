export function getAppBadgeText(title: string): string {
  const trimmedTitle = title.trim()
  return trimmedTitle.slice(0, 2).toUpperCase() || 'AP'
}

export function createId(prefix = ''): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${prefix}${Math.random().toString(36).slice(2)}_${Date.now()}`
}
