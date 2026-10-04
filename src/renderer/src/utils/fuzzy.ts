import type { LauncherItem } from '../../../shared/launcher'

/**
 * Minimum score for an item to be considered a match. Anything below is
 * treated as "the user probably means something else" and falls through to
 * the AI fallback row.
 */
export const MIN_MATCH_SCORE = 120

/**
 * Human-friendly aliases so users can search by intent rather than the exact
 * application name. Keys are normalized titles.
 */
const APP_ALIASES: Record<string, string[]> = {
  'google chrome': ['browser', 'web', 'internet', 'navigateur'],
  chrome: ['browser', 'web', 'internet', 'navigateur'],
  firefox: ['browser', 'web', 'internet', 'navigateur'],
  'microsoft edge': ['browser', 'web', 'internet', 'navigateur'],
  'brave browser': ['browser', 'web', 'internet', 'navigateur'],
  safari: ['browser', 'web', 'internet', 'navigateur'],
  'visual studio code': ['editor', 'code', 'ide', 'vscode'],
  code: ['editor', 'ide', 'vscode'],
  cursor: ['editor', 'code', 'ide'],
  'windows terminal': ['terminal', 'shell', 'console', 'cmd'],
  terminal: ['shell', 'console', 'cmd'],
  'command prompt': ['cmd', 'terminal', 'shell'],
  powershell: ['terminal', 'shell', 'cmd'],
  iterm: ['terminal', 'shell', 'console'],
  'iterm2': ['terminal', 'shell', 'console'],
  warp: ['terminal', 'shell', 'console'],
  finder: ['files', 'explorer', 'documents'],
  'file explorer': ['files', 'finder'],
  settings: ['preferences', 'config', 'options', 'parametres'],
  spotify: ['music', 'musique', 'audio'],
  'apple music': ['music', 'musique', 'audio'],
  photoshop: ['photos', 'image', 'design'],
  figma: ['design', 'ui'],
  slack: ['chat', 'messaging', 'communication'],
  discord: ['chat', 'messaging', 'communication'],
  notion: ['notes', 'docs', 'wiki'],
  obsidian: ['notes', 'markdown'],
  mail: ['email', 'courrier'],
  'microsoft outlook': ['email', 'mail', 'courrier'],
  calendar: ['agenda', 'schedule'],
  'activity monitor': ['monitor', 'processes', 'task manager'],
  'task manager': ['monitor', 'processes', 'performance']
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function basenameWithoutExtension(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? ''
  return base.replace(/\.[a-z0-9]+$/i, '')
}

function isWordBoundary(char: string | undefined): boolean {
  return !char || /[\s\-_./()[\]]/.test(char)
}

/**
 * Scores a single normalized string against a normalized query.
 * Ranking tiers: exact > prefix > word-boundary substring > substring >
 * subsequence. Returns 0 when nothing matches.
 */
function scoreMatch(query: string, target: string): number {
  if (!query || !target) return 0

  if (target === query) {
    return 1200
  }

  const index = target.indexOf(query)
  if (index === 0) {
    return 1000 - Math.min(target.length - query.length, 100)
  }
  if (index > 0) {
    const boundaryBonus = isWordBoundary(target[index - 1]) ? 800 : 600
    return boundaryBonus - Math.min(index, 100)
  }

  let queryIndex = 0
  let previousMatch = -1
  let gaps = 0

  for (let targetIndex = 0; targetIndex < target.length && queryIndex < query.length; targetIndex += 1) {
    if (target[targetIndex] === query[queryIndex]) {
      if (previousMatch >= 0) {
        gaps += targetIndex - previousMatch - 1
      }
      previousMatch = targetIndex
      queryIndex += 1
    }
  }

  if (queryIndex !== query.length) {
    return 0
  }

  const score = 200 - gaps * 2 - Math.min(target.length - query.length, 100)
  return Math.max(score, 60)
}

export function scoreLauncherItem(query: string, item: LauncherItem): number {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return 0

  const normalizedTitle = normalizeText(item.title)
  let best = scoreMatch(normalizedQuery, normalizedTitle)

  if (item.app?.path) {
    const executable = normalizeText(basenameWithoutExtension(item.app.path))
    if (executable && executable !== normalizedTitle) {
      best = Math.max(best, scoreMatch(normalizedQuery, executable) * 0.95)
    }
  }

  const aliases = APP_ALIASES[normalizedTitle]
  if (aliases) {
    for (const alias of aliases) {
      best = Math.max(best, scoreMatch(normalizedQuery, alias) * 0.9)
    }
  }

  return best
}

export function rankLauncherItems(
  query: string,
  items: LauncherItem[],
  limit = 8
): LauncherItem[] {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return []

  const scored: Array<{ item: LauncherItem; score: number }> = []
  for (const item of items) {
    const score = scoreLauncherItem(trimmedQuery, item)
    if (score >= MIN_MATCH_SCORE) {
      scored.push({ item, score })
    }
  }

  scored.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))

  return scored.slice(0, limit).map(({ item, score }) => ({ ...item, score }))
}
