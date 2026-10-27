import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react'
import { Compartment, EditorSelection, EditorState, Transaction } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  keymap,
  placeholder as placeholderExtension,
  type Command
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { livePreview } from './livePreview'
import { notesEditorTheme } from './theme'
import {
  dedentList,
  indentList,
  toggleBold,
  toggleItalic
} from './listCommands'

export type NotesEditorMode = 'live' | 'source'

export interface NotesEditorHandle {
  focus: () => void
  insertText: (text: string) => void
  wrapSelection: (before: string, after: string, placeholder: string) => void
  replaceRange: (range: { start: number; end: number }, text: string) => void
  getSelection: () => { text: string; range: { start: number; end: number } }
}

interface LiveMarkdownEditorProps {
  value: string
  mode: NotesEditorMode
  placeholder?: string
  onChange: (value: string) => void
  onSelectionChange: (selection: string, range: { start: number; end: number }) => void
}

const TOOLBAR: Array<{
  label: string
  title: string
  before: string
  after: string
  placeholder: string
}> = [
  { label: 'B', title: 'Bold', before: '**', after: '**', placeholder: 'bold text' },
  { label: 'I', title: 'Italic', before: '_', after: '_', placeholder: 'italic text' },
  { label: 'H', title: 'Heading', before: '## ', after: '', placeholder: 'Heading' },
  { label: '•', title: 'Bullet list', before: '- ', after: '', placeholder: 'List item' },
  { label: '1.', title: 'Numbered list', before: '1. ', after: '', placeholder: 'List item' },
  { label: '<>', title: 'Inline code', before: '`', after: '`', placeholder: 'code' },
  { label: '“”', title: 'Quote', before: '> ', after: '', placeholder: 'Quote' }
]

const CUSTOM_KEYMAP: readonly { key: string; run: Command }[] = [
  { key: 'Tab', run: indentList },
  { key: 'Shift-Tab', run: dedentList },
  { key: 'Mod-b', run: toggleBold },
  { key: 'Mod-i', run: toggleItalic }
]

/**
 * CodeMirror 6 based Markdown editor with MarkText-style live preview. The
 * Markdown source is the document; the preview is a decoration layer, so
 * saving, AI insert/replace and meeting recaps keep working on raw text.
 */
const LiveMarkdownEditor = forwardRef<NotesEditorHandle, LiveMarkdownEditorProps>(
  function LiveMarkdownEditor(
    { value, mode, placeholder = 'Start writing… Markdown is supported.', onChange, onSelectionChange },
    ref
  ): JSX.Element {
    const hostRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const valueRef = useRef(value)
    const modeCompartmentRef = useRef(new Compartment())
    const historyCompartmentRef = useRef(new Compartment())
    const applyingExternalRef = useRef(false)
    const onChangeRef = useRef(onChange)
    const onSelectionChangeRef = useRef(onSelectionChange)

    valueRef.current = value
    onChangeRef.current = onChange
    onSelectionChangeRef.current = onSelectionChange

    useImperativeHandle(
      ref,
      () => ({
        focus(): void {
          viewRef.current?.focus()
        },
        insertText(text: string): void {
          const view = viewRef.current
          if (!view) return
          const range = view.state.selection.main
          view.dispatch({
            changes: { from: range.from, to: range.to, insert: text },
            selection: EditorSelection.cursor(range.from + text.length)
          })
          view.focus()
        },
        wrapSelection(before: string, after: string, placeholderText: string): void {
          const view = viewRef.current
          if (!view) return
          const range = view.state.selection.main
          const selected = view.state.sliceDoc(range.from, range.to) || placeholderText
          const text = `${before}${selected}${after}`
          view.dispatch({
            changes: { from: range.from, to: range.to, insert: text },
            selection: EditorSelection.range(
              range.from + before.length,
              range.from + before.length + selected.length
            )
          })
          view.focus()
        },
        replaceRange(range: { start: number; end: number }, text: string): void {
          const view = viewRef.current
          if (!view) return
          const docLength = view.state.doc.length
          const from = Math.max(0, Math.min(range.start, docLength))
          const to = Math.max(from, Math.min(range.end, docLength))
          view.dispatch({
            changes: { from, to, insert: text },
            selection: EditorSelection.cursor(from + text.length)
          })
          view.focus()
        },
        getSelection(): { text: string; range: { start: number; end: number } } {
          const view = viewRef.current
          if (!view) return { text: '', range: { start: 0, end: 0 } }
          const range = view.state.selection.main
          return {
            text: view.state.sliceDoc(range.from, range.to),
            range: { start: range.from, end: range.to }
          }
        }
      }),
      []
    )

    useEffect(() => {
      const host = hostRef.current
      if (!host) return undefined

      const reportSelection = (view: EditorView): void => {
        const range = view.state.selection.main
        onSelectionChangeRef.current(view.state.sliceDoc(range.from, range.to), {
          start: range.from,
          end: range.to
        })
      }

      const state = EditorState.create({
        doc: valueRef.current,
        extensions: [
          historyCompartmentRef.current.of(history()),
          drawSelection(),
          EditorView.lineWrapping,
          EditorState.tabSize.of(2),
          EditorView.contentAttributes.of({
            'aria-label': 'Note content',
            spellcheck: 'true'
          }),
          markdown({ base: markdownLanguage }),
          modeCompartmentRef.current.of(mode === 'live' ? livePreview : []),
          notesEditorTheme,
          placeholderExtension(placeholder),
          keymap.of([...CUSTOM_KEYMAP, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              if (!applyingExternalRef.current) {
                onChangeRef.current(update.state.doc.toString())
              }
            }
            if (update.docChanged || update.selectionSet) reportSelection(update.view)
          })
        ]
      })

      const view = new EditorView({ state, parent: host })
      viewRef.current = view
      reportSelection(view)

      return () => {
        view.destroy()
        viewRef.current = null
      }
      // The editor is created once; later prop changes are handled below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // External updates (note switch, meeting recap, AI transcription) replace
    // the document without pushing a new value through `onChange`.
    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      if (view.state.doc.toString() === value) return
      applyingExternalRef.current = true
      try {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: value },
          annotations: Transaction.addToHistory.of(false)
        })
        // The document now belongs to another note (or a regenerated recap),
        // so undo must not resurrect the previous document's text.
        view.dispatch({
          effects: historyCompartmentRef.current.reconfigure(history())
        })
      } finally {
        applyingExternalRef.current = false
      }
    }, [value])

    useEffect(() => {
      viewRef.current?.dispatch({
        effects: modeCompartmentRef.current.reconfigure(mode === 'live' ? livePreview : [])
      })
    }, [mode])

    return (
      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <div className="mb-1.5 flex flex-wrap items-center gap-0.5">
          {TOOLBAR.map((item) => (
            <button
              key={item.title}
              type="button"
              title={item.title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                viewRef.current &&
                wrapFromView(viewRef.current, item.before, item.after, item.placeholder)
              }
              className="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-[11px] text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div ref={hostRef} className="cm-notes-host" />
      </div>
    )
  }
)

function wrapFromView(
  view: EditorView,
  before: string,
  after: string,
  placeholder: string
): void {
  const range = view.state.selection.main
  const selected = view.state.sliceDoc(range.from, range.to) || placeholder
  const text = `${before}${selected}${after}`
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: EditorSelection.range(
      range.from + before.length,
      range.from + before.length + selected.length
    )
  })
  view.focus()
}

export default LiveMarkdownEditor
