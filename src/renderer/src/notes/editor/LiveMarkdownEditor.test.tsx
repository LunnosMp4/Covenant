// @vitest-environment jsdom
import { createRef } from 'react'
import { act, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import LiveMarkdownEditor, { type NotesEditorHandle, type NotesEditorMode } from './LiveMarkdownEditor'

// jsdom does not implement layout measurement; CodeMirror only needs these to
// exist. Returning empty rects keeps the editor from throwing while measuring.
const emptyRects = {
  length: 0,
  item: () => null,
  [Symbol.iterator]: function* iterate() {}
} as unknown as DOMRectList

Range.prototype.getClientRects = () => emptyRects
Range.prototype.getBoundingClientRect = () => new DOMRect()

function mountEditor(value: string, mode: NotesEditorMode = 'live') {
  const ref = createRef<NotesEditorHandle>()
  const changes: string[] = []
  const selections: Array<{ text: string; start: number; end: number }> = []
  const result = render(
    <LiveMarkdownEditor
      ref={ref}
      value={value}
      mode={mode}
      onChange={(next) => changes.push(next)}
      onSelectionChange={(text, range) =>
        selections.push({ text, start: range.start, end: range.end })
      }
    />
  )
  return { ...result, ref, changes, selections }
}

describe('LiveMarkdownEditor', () => {
  it('mounts a CodeMirror editor with the Markdown source', () => {
    const { container, ref } = mountEditor('## Title')
    expect(container.querySelector('.cm-editor')).toBeTruthy()
    expect(container.querySelector('.cm-content')?.textContent).toContain('## Title')
    expect(ref.current).not.toBeNull()
  })

  it('reports edits through onChange but not the initial value', () => {
    const { ref, changes } = mountEditor('start')
    expect(changes).toHaveLength(0)

    act(() => {
      ref.current?.insertText(' more')
    })

    expect(changes[changes.length - 1]).toBe(' morestart')
  })

  it('can replace a specific range (AI replace selection)', () => {
    const { ref, changes } = mountEditor('before rest')
    act(() => {
      ref.current?.replaceRange({ start: 0, end: 6 }, '**bold**')
    })
    expect(changes[changes.length - 1]).toBe('**bold** rest')
  })

  it('replaces the document when the value comes from outside', () => {
    const { rerender, container, ref } = mountEditor('first')
    rerender(
      <LiveMarkdownEditor
        ref={ref}
        value="second"
        mode="live"
        onChange={() => {}}
        onSelectionChange={() => {}}
      />
    )
    expect(container.querySelector('.cm-content')?.textContent).toContain('second')
  })

  it('renders raw Markdown in source mode', () => {
    const { container } = mountEditor('## Title', 'source')
    expect(container.querySelector('.cm-mdl-h2')).toBeNull()
    expect(container.querySelector('.cm-content')?.textContent).toContain('## Title')
  })

  it('hides heading markers once the caret leaves the marker', () => {
    const { container } = mountEditor('## Title')
    const view = EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement)
    expect(view).not.toBeNull()

    act(() => {
      view?.dispatch({ selection: EditorSelection.cursor(5) })
    })

    expect(container.querySelector('.cm-mdl-h2')).toBeTruthy()
    expect(container.querySelector('.cm-line')?.textContent).toBe('Title')

    act(() => {
      view?.dispatch({ selection: EditorSelection.cursor(0) })
    })

    expect(container.querySelector('.cm-mdl-h2')).toBeTruthy()
    expect(container.querySelector('.cm-line')?.textContent).toContain('##')
  })

  it('renders list bullets and task checkboxes as widgets', () => {
    const { container } = mountEditor('- [ ] todo')
    const view = EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement)

    act(() => {
      view?.dispatch({ selection: EditorSelection.cursor(9) })
    })

    expect(container.querySelector('.cm-mdl-bullet')).toBeTruthy()
    expect(container.querySelector('.cm-mdl-checkbox')).toBeTruthy()
  })
})
