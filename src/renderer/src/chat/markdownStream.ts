/**
 * Streaming helper for the chat answer body.
 *
 * `react-markdown` re-parses its whole input on every render. While an answer
 * streams, the renderer commits about twenty times a second, so re-parsing the
 * entire answer each time makes the total cost grow with the square of the
 * answer's length: a 29 kB answer made of small tables and lists spends ~50 ms
 * per commit in the parser (measured inside the app), which keeps the renderer
 * pegged for the whole answer — the window stops reacting to clicks until the
 * last token arrives.
 *
 * This module cuts the answer into complete **top-level blocks** plus the block
 * currently being written. Each completed block is rendered once and memoised,
 * so a commit only parses the tail.
 *
 * The cut points are deliberately conservative: a cut is only taken where
 * CommonMark cannot join the line above to the line below (never inside a fenced
 * code block, a `$$` math block, a loose list, a blockquote, an indented code
 * block, or a document that uses reference link definitions). Splitting an
 * answer therefore renders exactly the same DOM as parsing it whole.
 */

export interface StreamedMarkdown {
  /** Complete top-level blocks, oldest first. Each one is final. */
  blocks: string[]
  /** The block currently being written (may still be inside a code/math block). */
  tail: string
}

/** Shared empty result so an empty render does not allocate. */
export const EMPTY_STREAMED_MARKDOWN: StreamedMarkdown = { blocks: [], tail: '' }

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/
const LIST_ITEM = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:\s|$)/
const BLOCKQUOTE = /^ {0,3}>/
const LEADING_WHITESPACE = /^\s/
/** `[label]: destination` definitions apply to the whole document. */
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]\n]+\]:\s/m
/** A `$$` math fence, alone or opening a block. */
const MATH_FENCE = /^ {0,3}\$\$/

interface LineFlags {
  /**
   * Line sits *inside* a fenced code block or a `$$` math block. Fence
   * delimiters themselves are not marked: a cut immediately before or after a
   * whole block is fine.
   */
  inBlockBody: boolean
}

function markBlockBodies(lines: string[]): LineFlags[] {
  const flags: LineFlags[] = lines.map(() => ({ inBlockBody: false }))
  let fenceChar = ''
  let fenceLength = 0
  let inMath = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (fenceChar) {
      const match = FENCE_LINE.exec(line)
      const isClosing =
        match !== null &&
        match[1][0] === fenceChar &&
        match[1].length >= fenceLength &&
        line.slice(line.indexOf(match[1]) + match[1].length).trim().length === 0
      if (isClosing) {
        fenceChar = ''
        fenceLength = 0
        continue
      }
      flags[index].inBlockBody = true
      continue
    }

    if (inMath) {
      if (trimmed === '$$') {
        inMath = false
        continue
      }
      flags[index].inBlockBody = true
      continue
    }

    const fence = FENCE_LINE.exec(line)
    if (fence) {
      // An opening fence carries an optional info string (`​```ts`), so it can
      // never close on the same line.
      fenceChar = fence[1][0]
      fenceLength = fence[1].length
      continue
    }

    if (MATH_FENCE.test(line)) {
      const rest = trimmed.slice(2)
      // `$$formula$$` is complete on its own line; `$$` alone opens a block.
      if (rest.length === 0 || !rest.endsWith('$$')) {
        inMath = true
      }
      continue
    }
  }

  return flags
}

function previousNonBlank(lines: string[], from: number): number {
  for (let index = from; index >= 0; index -= 1) {
    if (lines[index].trim().length > 0) return index
  }
  return -1
}

/**
 * True when a top-level block can start at `index`. A loose list (`- a`, blank
 * line, `- b`), a blockquote split by a blank line and two indented code blocks
 * separated by a blank line are single blocks in CommonMark, so a cut is only
 * taken when the line above cannot be continued.
 */
function isSafeCut(lines: string[], index: number, flags: LineFlags[]): boolean {
  if (index <= 0) return false
  if (lines[index].trim().length === 0) return false
  if (lines[index - 1].trim().length !== 0) return false
  if (flags[index].inBlockBody) return false

  const before = previousNonBlank(lines, index - 1)
  if (before < 0) return false
  if (flags[before].inBlockBody) return false

  const previousLine = lines[before]
  // A list or a quote can continue across a blank line; keep it in the tail.
  if (LIST_ITEM.test(previousLine) || BLOCKQUOTE.test(previousLine)) return false
  // Indented lines are item continuations or indented code.
  if (LEADING_WHITESPACE.test(previousLine)) return false

  return true
}

/**
 * Splits a streaming answer into completed top-level blocks plus the block being
 * written. Concatenating `blocks` and `tail` with the separating newlines always
 * reproduces the input exactly, so no content is dropped or reordered.
 */
export function splitStreamedMarkdown(content: string): StreamedMarkdown {
  if (!content) return EMPTY_STREAMED_MARKDOWN
  // Reference-style links resolve against the whole document; a cut would break
  // any link whose definition lives in another block.
  if (REFERENCE_DEFINITION.test(content)) return { blocks: [], tail: content }

  const lines = content.split('\n')
  if (lines.length < 3) return { blocks: [], tail: content }

  const flags = markBlockBodies(lines)
  const cutIndexes: number[] = []

  for (let index = 1; index < lines.length; index += 1) {
    if (isSafeCut(lines, index, flags)) cutIndexes.push(index)
  }

  if (cutIndexes.length === 0) return { blocks: [], tail: content }

  const blocks: string[] = []
  let start = 0
  for (const cut of cutIndexes) {
    const block = lines.slice(start, cut).join('\n')
    start = cut
    if (block.trim().length > 0) blocks.push(block)
  }

  const tail = lines.slice(start).join('\n')
  if (!tail.trim()) return { blocks: [], tail: content }

  return { blocks, tail }
}
