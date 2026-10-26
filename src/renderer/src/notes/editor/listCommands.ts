import { EditorSelection } from '@codemirror/state'
import type { Command, EditorView } from '@codemirror/view'

/**
 * Small MarkText-flavoured editing helpers: list indentation on Tab and
 * bold/italic toggles. Enter/Backspace continuation and markup deletion come
 * from `@codemirror/lang-markdown`'s own keymap.
 */

const LIST_PREFIX = /^(\s*)([-*+]|\d+[.)])( +)/

function isBlank(text: string): boolean {
  return text.trim().length === 0
}

function selectedLines(view: EditorView): Array<{ from: number; to: number; text: string }> {
  const { state } = view
  const numbers = new Set<number>()
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let number = first; number <= last; number += 1) numbers.add(number)
  }
  return [...numbers]
    .sort((a, b) => a - b)
    .map((number) => {
      const line = state.doc.line(number)
      return { from: line.from, to: line.to, text: line.text }
    })
}

/** Tab indents list items by two spaces (no-op outside lists). */
export const indentList: Command = (view: EditorView): boolean => {
  const lines = selectedLines(view)
  if (lines.length === 0) return false
  if (!lines.every((line) => isBlank(line.text) || LIST_PREFIX.test(line.text))) return false
  if (lines.every((line) => isBlank(line.text))) return false

  view.dispatch({
    changes: lines
      .filter((line) => !isBlank(line.text))
      .map((line) => ({ from: line.from, insert: '  ' }))
  })
  return true
}

/** Shift-Tab outdents list items by up to two spaces. */
export const dedentList: Command = (view: EditorView): boolean => {
  const lines = selectedLines(view)
  if (lines.length === 0) return false
  if (!lines.every((line) => isBlank(line.text) || LIST_PREFIX.test(line.text))) return false

  const changes = lines
    .map((line) => {
      const indent = /^ */.exec(line.text)?.[0] ?? ''
      if (!indent) return null
      return { from: line.from, to: line.from + Math.min(2, indent.length), insert: '' }
    })
    .filter((change): change is { from: number; to: number; insert: string } => change != null)

  if (changes.length === 0) return false
  view.dispatch({ changes })
  return true
}

function toggleWrap(view: EditorView, before: string, after: string): boolean {
  const { state } = view
  const range = state.selection.main
  const selected = state.sliceDoc(range.from, range.to)

  const aroundBefore = state.sliceDoc(Math.max(0, range.from - before.length), range.from)
  const aroundAfter = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + after.length))
  if (aroundBefore === before && aroundAfter === after) {
    view.dispatch({
      changes: [
        { from: range.from - before.length, to: range.from, insert: '' },
        { from: range.to, to: range.to + after.length, insert: '' }
      ],
      selection: EditorSelection.range(
        range.from - before.length,
        range.to - before.length
      )
    })
    return true
  }

  if (!selected) {
    view.dispatch({
      changes: { from: range.from, insert: `${before}${after}` },
      selection: EditorSelection.cursor(range.from + before.length)
    })
    return true
  }

  if (selected.startsWith(before) && selected.endsWith(after)) {
    const inner = selected.slice(before.length, selected.length - after.length)
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: inner },
      selection: EditorSelection.range(range.from, range.from + inner.length)
    })
    return true
  }

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `${before}${selected}${after}` },
    selection: EditorSelection.range(range.from + before.length, range.to + before.length)
  })
  return true
}

export const toggleBold: Command = (view: EditorView): boolean => toggleWrap(view, '**', '**')
export const toggleItalic: Command = (view: EditorView): boolean => toggleWrap(view, '_', '_')
