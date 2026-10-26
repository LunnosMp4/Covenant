import { describe, expect, it } from 'vitest'
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { dedentList, indentList, toggleBold, toggleItalic } from './listCommands'

function viewFor(doc: string, from: number, to = from): { view: EditorView; state: () => EditorState } {
  let state = EditorState.create({
    doc,
    selection: EditorSelection.range(from, to)
  })
  const view = {
    get state() {
      return state
    },
    dispatch(...specs: TransactionSpec[]) {
      state = state.update(...specs).state
    }
  } as unknown as EditorView
  return { view, state: () => state }
}

describe('list indentation', () => {
  it('indents a list item by two spaces', () => {
    const { view, state } = viewFor('- item', 5)
    expect(indentList(view)).toBe(true)
    expect(state().doc.toString()).toBe('  - item')
  })

  it('does not touch plain paragraphs', () => {
    const { view, state } = viewFor('paragraph', 3)
    expect(indentList(view)).toBe(false)
    expect(state().doc.toString()).toBe('paragraph')
  })

  it('indents every selected list line', () => {
    const doc = '- one\n- two'
    const { view, state } = viewFor(doc, 0, doc.length)
    expect(indentList(view)).toBe(true)
    expect(state().doc.toString()).toBe('  - one\n  - two')
  })

  it('outdents a nested item by two spaces', () => {
    const { view, state } = viewFor('    - deep', 8)
    expect(dedentList(view)).toBe(true)
    expect(state().doc.toString()).toBe('  - deep')
  })

  it('does nothing when there is no indent to remove', () => {
    const { view } = viewFor('- item', 3)
    expect(dedentList(view)).toBe(false)
  })
})

describe('emphasis toggles', () => {
  it('inserts a pair and places the caret between it', () => {
    const { view, state } = viewFor('', 0)
    expect(toggleBold(view)).toBe(true)
    expect(state().doc.toString()).toBe('****')
    expect(state().selection.main.head).toBe(2)
  })

  it('wraps the selection', () => {
    const { view, state } = viewFor('bold', 0, 4)
    expect(toggleBold(view)).toBe(true)
    expect(state().doc.toString()).toBe('**bold**')
    expect(state().selection.main.from).toBe(2)
    expect(state().selection.main.to).toBe(6)
  })

  it('unwraps when the markers surround the selection', () => {
    const { view, state } = viewFor('**bold**', 2, 6)
    expect(toggleBold(view)).toBe(true)
    expect(state().doc.toString()).toBe('bold')
  })

  it('toggles italics with underscores', () => {
    const { view, state } = viewFor('text', 0, 4)
    expect(toggleItalic(view)).toBe(true)
    expect(state().doc.toString()).toBe('_text_')
  })
})
