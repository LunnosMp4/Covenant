import type { Preprompt } from '../../../../shared/domain/preprompt'
import { normalizeText, scoreMatch } from '../../utils/launcher/fuzzy'

export interface MentionTrigger {
  query: string
  /** Index of the `@` character inside the text segment. */
  start: number
}

/**
 * Detects an `@instruction` mention at the end of the text before the caret.
 * Mentions only start at the beginning of a segment or after whitespace, and
 * close as soon as a space is typed (`foo@bar` is an email, not a mention).
 */
export function parseMentionTrigger(textBeforeCaret: string): MentionTrigger | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(textBeforeCaret)
  if (!match) return null

  const query = match[2]
  return {
    query,
    start: textBeforeCaret.length - query.length - 1
  }
}

/**
 * Filters instructions for the `@` picker. An empty query keeps the saved
 * order; otherwise title matches rank above content matches.
 */
export function filterInstructionMentions(
  preprompts: Preprompt[],
  query: string
): Preprompt[] {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return [...preprompts]

  const scored: Array<{ item: Preprompt; score: number }> = []

  for (const item of preprompts) {
    const titleScore = scoreMatch(normalizedQuery, normalizeText(item.title))
    const contentScore = scoreMatch(normalizedQuery, normalizeText(item.content)) * 0.6
    const score = Math.max(titleScore, contentScore)
    if (score > 0) {
      scored.push({ item, score })
    }
  }

  scored.sort(
    (a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title)
  )

  return scored.map(({ item }) => item)
}
